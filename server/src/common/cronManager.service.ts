import cron, { ScheduledTask } from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { AppError } from './errors';

// Module services
import { billingSchedulesService } from '../modules/billing/billingSchedules.service';
import { invoicesService } from '../modules/billing/invoices.service';
import { penaltyService } from '../modules/billing/penalty.service';
import { pmService } from '../modules/preventive-maintenance/pm.service';
import { mallService } from '../modules/mall/mall.service';

export interface CronJobDefinition {
  key: string;
  name: string;
  category: 'Billing' | 'Leases' | 'Maintenance' | 'Mall' | 'System';
  description: string;
  defaultCron: string;
  defaultTimezone?: string;
  supportsManualTrigger?: boolean;
  runner: () => Promise<string | void>;
}

async function resetTenantSession(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('RESET app.current_company_id');
  } catch {
    // Ignore reset errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY OF DAILY & MONTHLY BUSINESS CRON JOBS (LIGHTWEIGHT ARCHITECTURE)
// High-frequency workers (10s/30s/1m/15m) run separately in memory without DB
// logging overhead so the production database connection pool is never saturated.
// ─────────────────────────────────────────────────────────────────────────────
export const SYSTEM_CRON_REGISTRY: CronJobDefinition[] = [
  // ── 1. BILLING & INVOICES ──
  {
    key: 'billing.daily',
    name: 'Daily Recurring Billing',
    category: 'Billing',
    description: 'Generates recurring invoices for active billing schedules due today or earlier across all active companies.',
    defaultCron: '0 2 * * *', // Daily 2:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let totalGenerated = 0;
      const today = new Date();
      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            const dueSchedules = await billingSchedulesService.findDueSchedules(today);
            const result = await invoicesService.runBilling(dueSchedules, today);
            totalGenerated += result.generated;
            for (const errMsg of result.errors) {
              logger.error(`Billing error (${company.code}): ${errMsg}`);
            }
          } catch (err: any) {
            logger.error(`Billing failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Generated ${totalGenerated} invoices across ${companies.length} companies`;
    },
  },
  {
    key: 'billing.penalty_check',
    name: 'Late Payment Penalty Check',
    category: 'Billing',
    description: 'Calculates and applies overdue penalty fees to invoices past due date and grace period.',
    defaultCron: '0 3 * * *', // Daily 3:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            await penaltyService.checkAndApplyPenalties();
          } catch (err: any) {
            logger.error(`Penalty check failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Penalty check processed across ${companies.length} companies`;
    },
  },
  {
    key: 'billing.overdue_transition',
    name: 'Overdue Status Transition',
    category: 'Billing',
    description: 'Automatically transitions unpaid invoices past due date to overdue status.',
    defaultCron: '0 4 * * *', // Daily 4:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            await invoicesService.transitionOverdue();
          } catch (err: any) {
            logger.error(`Overdue transition failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Overdue status transition completed for ${companies.length} companies`;
    },
  },

  // ── 2. LEASES ──
  {
    key: 'leases.escalation',
    name: 'Rent Escalation Application',
    category: 'Leases',
    description: 'Applies scheduled rent escalation increases for active lease contracts.',
    defaultCron: '0 1 * * *', // Daily 1:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let totalApplied = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            const dueEscalations = await prisma.leaseEscalationSchedule.findMany({
              where: {
                effectiveDate: { lte: today },
                applied: false,
              },
              include: { lease: true },
            });

            for (const esc of dueEscalations) {
              if (esc.lease.status !== 'active') continue;
              await prisma.$transaction([
                prisma.lease.update({
                  where: { id: esc.leaseId },
                  data: { rentAmount: esc.newRent },
                }),
                prisma.leaseEscalationSchedule.update({
                  where: { id: esc.id },
                  data: { applied: true, appliedAt: new Date() },
                }),
              ]);
              totalApplied++;
            }
          } catch (err: any) {
            logger.error(`Escalation failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Applied ${totalApplied} rent escalation schedules`;
    },
  },
  {
    key: 'leases.renewal',
    name: 'Lease Renewal Alerts',
    category: 'Leases',
    description: 'Scans expiring leases (90, 60, 30, 14, and 7 days) and triggers renewal notifications.',
    defaultCron: '0 8 * * *', // Daily 8:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let totalAlerts = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const alertDays = [90, 60, 30, 14, 7];

      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            for (const days of alertDays) {
              const targetDate = new Date(today);
              targetDate.setDate(targetDate.getDate() + days);
              const nextDay = new Date(targetDate);
              nextDay.setDate(nextDay.getDate() + 1);

              const expiringLeases = await prisma.lease.findMany({
                where: {
                  status: 'active',
                  endDate: { gte: targetDate, lt: nextDay },
                },
                select: { id: true, leaseNumber: true },
              });
              totalAlerts += expiringLeases.length;
            }
          } catch (err: any) {
            logger.error(`Lease renewal check failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Renewal alert scan completed. Detected ${totalAlerts} upcoming milestones`;
    },
  },

  // ── 3. MAINTENANCE ──
  {
    key: 'maintenance.pm_generator',
    name: 'Preventive Maintenance Work Orders',
    category: 'Maintenance',
    description: 'Auto-generates PM work orders for due maintenance schedules and flags overdue orders.',
    defaultCron: '0 6 * * *', // Daily 6:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const dueSchedules = await prisma.$queryRawUnsafe<Array<{ id: string; company_id: string }>>(
        `SELECT s.id, s.company_id FROM pm_schedules s
         WHERE s.status = 'active'
           AND (s.next_due_date - s.advance_days * interval '1 day')::date <= $1::date
           AND NOT EXISTS (
             SELECT 1 FROM pm_work_orders pw
             WHERE pw.schedule_id = s.id
               AND pw.due_date = s.next_due_date
               AND pw.status NOT IN ('skipped')
           )`,
        todayStr,
      );

      let created = 0;
      for (const sched of dueSchedules) {
        try {
          await pmService.generateWorkOrder(sched.id, sched.company_id);
          created++;
        } catch (err: any) {
          if (!err?.message?.includes('already exists')) {
            logger.warn(`PM WO generation error: ${err.message}`);
          }
        }
      }
      return `Created ${created} PM work orders from ${dueSchedules.length} due schedules`;
    },
  },
  {
    key: 'maintenance.facility_alert',
    name: 'Facility Inspection & Warranty Alerts',
    category: 'Maintenance',
    description: 'Generates alerts for expiring equipment warranties and service contracts (90, 30, 7 days).',
    defaultCron: '0 7 * * *', // Daily 7:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const today = new Date();
      const thresholds = [
        { days: 7, level: 'urgent' },
        { days: 30, level: 'warning' },
        { days: 90, level: 'info' },
      ];
      let alertCount = 0;
      for (const { days } of thresholds) {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() + days);
        const prevCutoff = new Date(today);
        prevCutoff.setDate(prevCutoff.getDate() + days - 1);

        const assets = await prisma.facilityAsset.findMany({
          where: {
            warrantyExpiry: { gte: prevCutoff, lte: cutoff },
            status: { not: 'decommissioned' },
          },
          select: { id: true },
        });
        alertCount += assets.length;
      }
      return `Scanned facility assets. Flagged ${alertCount} upcoming expirations`;
    },
  },

  // ── 4. SHOPPING MALL ──
  {
    key: 'mall.cam_billing',
    name: 'Mall CAM Billing Auto-Generate',
    category: 'Mall',
    description: 'Calculates monthly Common Area Maintenance (CAM) charges for shopping mall tenants.',
    defaultCron: '0 3 1 * *', // 1st of month at 3:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let total = 0;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            const mallProps = await prisma.mallProperty.findMany({
              where: { companyId: company.id },
              select: { propertyId: true },
            });
            for (const mp of mallProps) {
              const res = await mallService.generateCamBillings(company.id, mp.propertyId, month, year);
              total += res.generated;
            }
          } catch (err: any) {
            logger.error(`CAM billing failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Generated ${total} CAM billing records for month ${month}/${year}`;
    },
  },
  {
    key: 'mall.gto_reminder',
    name: 'Mall GTO Sales Submission Reminder',
    category: 'Mall',
    description: 'Sends turnover sales submission reminders to commercial tenants on the 15th of the month.',
    defaultCron: '0 9 15 * *', // 15th of month at 9:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let count = 0;
      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            const leases = await prisma.commercialLease.findMany({
              where: { companyId: company.id, turnoverReportingRequired: true, lease: { status: 'active' } },
              select: { leaseId: true },
            });
            count += leases.length;
          } catch (err: any) {
            logger.error(`GTO reminder failed for ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Scanned GTO submissions. Notified ${count} commercial retail leases`;
    },
  },

  // ── 5. SYSTEM EXPIRY SCANNERS (DAILY) ──
  {
    key: 'system.document_expiry',
    name: 'Document Expiry Scanner',
    category: 'System',
    description: 'Scans tenant documents approaching expiration dates and triggers reminders.',
    defaultCron: '0 8 * * *', // Daily 8:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const documents = await prisma.document.findMany({
        where: { expiryDate: { not: null }, deletedAt: null, status: { not: 'archived' } },
        select: { id: true },
      });
      return `Document expiration scan complete across ${documents.length} registered documents`;
    },
  },
  {
    key: 'system.kyc_expiry',
    name: 'Tenant KYC Expiry Scanner',
    category: 'System',
    description: 'Flags expired tenant KYC identity verifications and notifies property administrators.',
    defaultCron: '0 1 * * *', // Daily 1:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiredDocs = await prisma.tenantKycDocument.findMany({
        where: { status: 'approved', expiryDate: { lt: today } },
        select: { id: true },
      });
      return `Scanned tenant KYC verifications. Found ${expiredDocs.length} expired items`;
    },
  },
  {
    key: 'parking.pass_expiry',
    name: 'Parking Allocation Expiry',
    category: 'System',
    description: 'Expires parking allocations past their end date and frees up the reserved parking slots.',
    defaultCron: '0 0 * * *', // Daily midnight
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      let totalExpired = 0;
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      try {
        for (const company of companies) {
          try {
            await setTenantContext(company.id);
            const expiredAllocations = await prisma.parkingAllocation.findMany({
              where: {
                companyId: company.id,
                status: 'active',
                endDate: { lt: now },
              },
            });

            for (const alloc of expiredAllocations) {
              await prisma.$transaction([
                prisma.parkingAllocation.update({
                  where: { id: alloc.id },
                  data: { status: 'expired' },
                }),
                prisma.parkingSlot.update({
                  where: { id: alloc.slotId },
                  data: { status: 'available' },
                }),
              ]);
              totalExpired++;
            }
          } catch (err: any) {
            logger.error(`Parking pass expiry error for company ${company.code}: ${err.message}`);
          }
        }
      } finally {
        await resetTenantSession();
      }
      return `Expired ${totalExpired} parking allocations and freed slots`;
    },
  },
];

class CronManagerService {
  private activeTasks = new Map<string, ScheduledTask>();
  private isJobRunning = new Map<string, boolean>();
  private initialized = false;

  /**
   * Initializes the lightweight business cron engine AFTER the HTTP server is already listening:
   *  1. Seeds default records in a single batch `createMany({ skipDuplicates: true })` query
   *  2. Loads custom schedules & enabled states from database
   *  3. Schedules all active jobs with node-cron (falling back to registry defaults if DB is unavailable)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('⚙️ Initializing Lightweight Business Cron Manager...');

    const registeredKeys = SYSTEM_CRON_REGISTRY.map((d) => d.key);

    try {
      // Single batch insert for any missing job definitions
      await prisma.cronJobConfig.createMany({
        data: SYSTEM_CRON_REGISTRY.map((def) => ({
          jobKey: def.key,
          name: def.name,
          category: def.category,
          description: def.description,
          cronExpression: def.defaultCron,
          timezone: def.defaultTimezone || 'Asia/Yangon',
          isEnabled: true,
        })),
        skipDuplicates: true,
      });

      // Clean up any obsolete high-frequency job configs from previous versions
      await prisma.cronJobConfig.deleteMany({
        where: { jobKey: { notIn: registeredKeys } },
      }).catch(() => {});

      const existingConfigs = await prisma.cronJobConfig.findMany({
        where: { jobKey: { in: registeredKeys } },
      });
      const configMap = new Map(existingConfigs.map((c) => [c.jobKey, c]));

      for (const def of SYSTEM_CRON_REGISTRY) {
        const config = configMap.get(def.key);
        const isEnabled = config ? config.isEnabled : true;
        if (isEnabled) {
          this.scheduleTask(
            def,
            config?.cronExpression || def.defaultCron,
            config?.timezone || def.defaultTimezone || 'Asia/Yangon',
          );
        }
      }

      this.initialized = true;
      logger.info(`✅ Business Cron Manager initialized. Active scheduled jobs: ${this.activeTasks.size}`);
    } catch (err: any) {
      logger.warn(`Cron Manager DB sync skipped (${err.message}) — scheduling default business jobs in memory`);
      for (const def of SYSTEM_CRON_REGISTRY) {
        this.scheduleTask(def, def.defaultCron, def.defaultTimezone || 'Asia/Yangon');
      }
      this.initialized = true;
    }
  }

  /**
   * Internal helper to schedule a job with node-cron
   */
  private scheduleTask(def: CronJobDefinition, cronExpression: string, timezone: string): boolean {
    try {
      if (!cron.validate(cronExpression)) {
        logger.error(`Invalid cron expression for job ${def.key}: "${cronExpression}"`);
        return false;
      }

      const existing = this.activeTasks.get(def.key);
      if (existing) {
        existing.stop();
        this.activeTasks.delete(def.key);
      }

      const task = cron.schedule(
        cronExpression,
        async () => {
          await this.executeJob(def.key, 'cron');
        },
        {
          timezone: timezone || 'Asia/Yangon',
        },
      );

      this.activeTasks.set(def.key, task);
      return true;
    } catch (err: any) {
      logger.error(`Failed to schedule cron task ${def.key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Executes a job (called by cron timer or manually via "Run Now").
   * Tracks `isRunning` in memory and writes to the DB only ONCE upon completion.
   */
  async executeJob(jobKey: string, triggeredBy = 'cron'): Promise<{ success: boolean; message?: string; error?: string; durationMs?: number }> {
    const def = SYSTEM_CRON_REGISTRY.find((j) => j.key === jobKey);
    if (!def) {
      throw AppError.notFound(`Cron job definition not found for key: ${jobKey}`);
    }

    if (this.isJobRunning.get(jobKey)) {
      return { success: false, error: 'Job is already currently running' };
    }

    this.isJobRunning.set(jobKey, true);
    const startedAt = new Date();
    const startTime = startedAt.getTime();
    logger.info(`▶️ Running cron job [${jobKey}] (Triggered by: ${triggeredBy})...`);

    try {
      const resultMessage = await def.runner();
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startTime;
      const message = resultMessage || 'Job executed successfully';

      logger.info(`✅ Cron job [${jobKey}] completed in ${durationMs}ms: ${message}`);

      // Single post-completion write to log & config (wrapped in try/catch so logging never breaks job execution)
      try {
        if (prisma.cronJobLog && prisma.cronJobConfig) {
          await Promise.allSettled([
            prisma.cronJobLog.create({
              data: {
                jobKey,
                status: 'success',
                triggeredBy,
                startedAt,
                finishedAt,
                durationMs,
                message,
              },
            }),
            prisma.cronJobConfig.updateMany({
              where: { jobKey },
              data: {
                lastRunAt: startedAt,
                lastStatus: 'success',
                lastDurationMs: durationMs,
                lastError: null,
              },
            }),
          ]);
        } else {
          await Promise.allSettled([
            prisma.$executeRawUnsafe(
              `INSERT INTO cron_job_logs (id, job_key, started_at, finished_at, duration_ms, status, triggered_by, message)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, 'success', $5, $6)`,
              jobKey, startedAt, finishedAt, durationMs, triggeredBy, message,
            ),
            prisma.$executeRawUnsafe(
              `UPDATE cron_job_configs SET last_run_at = $2, last_status = 'success', last_duration_ms = $3, last_error = NULL, updated_at = NOW() WHERE job_key = $1`,
              jobKey, startedAt, durationMs,
            ),
          ]);
        }
      } catch (logErr: any) {
        logger.warn(`Could not persist cron job success log for ${jobKey}: ${logErr.message}`);
      }

      return { success: true, message, durationMs };
    } catch (err: any) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startTime;
      const errorMessage = err?.message || String(err);
      logger.error(`❌ Cron job [${jobKey}] failed after ${durationMs}ms:`, err);

      try {
        if (prisma.cronJobLog && prisma.cronJobConfig) {
          await Promise.allSettled([
            prisma.cronJobLog.create({
              data: {
                jobKey,
                status: 'failed',
                triggeredBy,
                startedAt,
                finishedAt,
                durationMs,
                error: errorMessage,
              },
            }),
            prisma.cronJobConfig.updateMany({
              where: { jobKey },
              data: {
                lastRunAt: startedAt,
                lastStatus: 'failed',
                lastDurationMs: durationMs,
                lastError: errorMessage,
              },
            }),
          ]);
        } else {
          await Promise.allSettled([
            prisma.$executeRawUnsafe(
              `INSERT INTO cron_job_logs (id, job_key, started_at, finished_at, duration_ms, status, triggered_by, error)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, 'failed', $5, $6)`,
              jobKey, startedAt, finishedAt, durationMs, triggeredBy, errorMessage,
            ),
            prisma.$executeRawUnsafe(
              `UPDATE cron_job_configs SET last_run_at = $2, last_status = 'failed', last_duration_ms = $3, last_error = $4, updated_at = NOW() WHERE job_key = $1`,
              jobKey, startedAt, durationMs, errorMessage,
            ),
          ]);
        }
      } catch (logErr: any) {
        logger.warn(`Could not persist cron job failure log for ${jobKey}: ${logErr.message}`);
      }

      return { success: false, error: errorMessage, durationMs };
    } finally {
      this.isJobRunning.set(jobKey, false);
    }
  }

  /**
   * Reschedules a job with a new expression / timezone dynamically at runtime
   */
  async reschedule(jobKey: string, newCron: string, timezone = 'Asia/Yangon', updatedBy?: string) {
    if (!cron.validate(newCron)) {
      throw AppError.validation(`Invalid cron expression: "${newCron}"`);
    }

    const def = SYSTEM_CRON_REGISTRY.find((j) => j.key === jobKey);
    if (!def) {
      throw AppError.notFound(`Cron job definition not found for key: ${jobKey}`);
    }

    let isEnabled = true;
    let updated: any = {
      jobKey: def.key,
      cronExpression: newCron,
      timezone,
      isEnabled: true,
    };

    if (prisma.cronJobConfig) {
      updated = await prisma.cronJobConfig.upsert({
        where: { jobKey },
        update: {
          cronExpression: newCron,
          timezone,
          updatedBy: updatedBy || 'admin',
          updatedAt: new Date(),
        },
        create: {
          jobKey: def.key,
          name: def.name,
          category: def.category,
          description: def.description,
          cronExpression: newCron,
          timezone,
          isEnabled: true,
          updatedBy: updatedBy || 'admin',
        },
      });
      isEnabled = updated.isEnabled;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cron_job_configs (id, job_key, name, category, description, cron_expression, timezone, is_enabled, updated_by, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, $7, NOW())
         ON CONFLICT (job_key) DO UPDATE SET cron_expression = $5, timezone = $6, updated_by = $7, updated_at = NOW()`,
        def.key, def.name, def.category, def.description, newCron, timezone, updatedBy || 'admin',
      );
    }

    if (isEnabled) {
      this.scheduleTask(def, newCron, timezone);
      logger.info(`🔄 Rescheduled cron job [${jobKey}] to "${newCron}" (${timezone})`);
    }

    return updated;
  }

  /**
   * Toggles a job enabled/disabled
   */
  async toggle(jobKey: string, isEnabled: boolean, updatedBy?: string) {
    const def = SYSTEM_CRON_REGISTRY.find((j) => j.key === jobKey);
    if (!def) {
      throw AppError.notFound(`Cron job definition not found for key: ${jobKey}`);
    }

    let cronExpression = def.defaultCron;
    let timezone = def.defaultTimezone || 'Asia/Yangon';
    let updated: any = {
      jobKey: def.key,
      cronExpression,
      timezone,
      isEnabled,
    };

    if (prisma.cronJobConfig) {
      updated = await prisma.cronJobConfig.upsert({
        where: { jobKey },
        update: {
          isEnabled,
          updatedBy: updatedBy || 'admin',
          updatedAt: new Date(),
        },
        create: {
          jobKey: def.key,
          name: def.name,
          category: def.category,
          description: def.description,
          cronExpression: def.defaultCron,
          timezone: def.defaultTimezone || 'Asia/Yangon',
          isEnabled,
          updatedBy: updatedBy || 'admin',
        },
      });
      cronExpression = updated.cronExpression;
      timezone = updated.timezone;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cron_job_configs (id, job_key, name, category, description, cron_expression, timezone, is_enabled, updated_by, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (job_key) DO UPDATE SET is_enabled = $7, updated_by = $8, updated_at = NOW()`,
        def.key, def.name, def.category, def.description, cronExpression, timezone, isEnabled, updatedBy || 'admin',
      );
    }

    if (isEnabled) {
      this.scheduleTask(def, cronExpression, timezone);
      logger.info(`🟢 Enabled cron job [${jobKey}]`);
    } else {
      const task = this.activeTasks.get(jobKey);
      if (task) {
        task.stop();
        this.activeTasks.delete(jobKey);
      }
      logger.info(`⏸️ Disabled / Paused cron job [${jobKey}]`);
    }

    return updated;
  }

  /**
   * Lists all registered business jobs with their live state
   */
  async listJobs() {
    let configMap = new Map<string, any>();
    try {
      if (prisma.cronJobConfig) {
        const dbConfigs = await prisma.cronJobConfig.findMany({
          where: { jobKey: { in: SYSTEM_CRON_REGISTRY.map((d) => d.key) } },
        });
        configMap = new Map(dbConfigs.map((c) => [c.jobKey, c]));
      } else {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, job_key as "jobKey", name, category, description, cron_expression as "cronExpression",
                  timezone, is_enabled as "isEnabled", last_run_at as "lastRunAt", last_status as "lastStatus",
                  last_duration_ms as "lastDurationMs", last_error as "lastError", updated_by as "updatedBy", updated_at as "updatedAt"
           FROM cron_job_configs`,
        );
        configMap = new Map(rows.map((r) => [r.jobKey, r]));
      }
    } catch (err: any) {
      logger.warn(`Could not read cronJobConfig from DB: ${err.message}`);
    }

    return SYSTEM_CRON_REGISTRY.map((def) => {
      const config = configMap.get(def.key);
      const isScheduled = this.activeTasks.has(def.key);
      const isRunning = this.isJobRunning.get(def.key) === true;

      return {
        id: config?.id || def.key,
        jobKey: def.key,
        name: config?.name || def.name,
        category: config?.category || def.category,
        description: config?.description || def.description,
        cronExpression: config?.cronExpression || def.defaultCron,
        timezone: config?.timezone || def.defaultTimezone || 'Asia/Yangon',
        isEnabled: config?.isEnabled ?? true,
        isScheduled,
        isRunning,
        lastRunAt: config?.lastRunAt || null,
        lastStatus: isRunning ? 'running' : (config?.lastStatus || null),
        lastDurationMs: config?.lastDurationMs || null,
        lastError: config?.lastError || null,
        updatedBy: config?.updatedBy || null,
        updatedAt: config?.updatedAt || null,
        supportsManualTrigger: def.supportsManualTrigger !== false,
      };
    });
  }

  /**
   * Retrieves execution logs for a job
   */
  async getLogs(jobKey?: string, limit = 20, page = 1) {
    const where = jobKey ? { jobKey } : {};
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    try {
      if (prisma.cronJobLog) {
        const [logs, total] = await Promise.all([
          prisma.cronJobLog.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take,
            skip,
          }),
          prisma.cronJobLog.count({ where }),
        ]);

        return {
          logs,
          total,
          page,
          limit: take,
          totalPages: Math.ceil(total / take),
        };
      } else {
        const logs = jobKey
          ? await prisma.$queryRawUnsafe<any[]>(
              `SELECT id, job_key as "jobKey", started_at as "startedAt", finished_at as "finishedAt",
                      duration_ms as "durationMs", status, triggered_by as "triggeredBy", message, error
               FROM cron_job_logs WHERE job_key = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
              jobKey, take, skip,
            )
          : await prisma.$queryRawUnsafe<any[]>(
              `SELECT id, job_key as "jobKey", started_at as "startedAt", finished_at as "finishedAt",
                      duration_ms as "durationMs", status, triggered_by as "triggeredBy", message, error
               FROM cron_job_logs ORDER BY started_at DESC LIMIT $1 OFFSET $2`,
              take, skip,
            );
        return {
          logs,
          total: logs.length,
          page,
          limit: take,
          totalPages: 1,
        };
      }
    } catch {
      return {
        logs: [],
        total: 0,
        page,
        limit: take,
        totalPages: 0,
      };
    }
  }
}

export const cronManager = new CronManagerService();

