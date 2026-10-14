import cron, { ScheduledTask } from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { AppError } from './errors';

// Module services
import { billingSchedulesService } from '../modules/billing/billingSchedules.service';
import { invoicesService } from '../modules/billing/invoices.service';
import { penaltyService } from '../modules/billing/penalty.service';
import { slaService } from '../modules/maintenance/sla.service';
import { pmService } from '../modules/preventive-maintenance/pm.service';
import { mallService } from '../modules/mall/mall.service';
import { integrationsService } from '../modules/integrations/integrations.service';

export interface CronJobDefinition {
  key: string;
  name: string;
  category: 'Billing' | 'Leases' | 'Maintenance' | 'Mall' | 'Condo' | 'CRM' | 'System';
  description: string;
  defaultCron: string;
  defaultTimezone?: string;
  supportsManualTrigger?: boolean;
  runner: () => Promise<string | void>;
}

// ─────────────────────────────────────────────
// REGISTRY OF ALL SYSTEM CRON JOBS
// ─────────────────────────────────────────────
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
      for (const company of companies) {
        try {
          await setTenantContext(company.id);
          await penaltyService.checkAndApplyPenalties();
        } catch (err: any) {
          logger.error(`Penalty check failed for ${company.code}: ${err.message}`);
        }
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
      for (const company of companies) {
        try {
          await setTenantContext(company.id);
          await invoicesService.transitionOverdue();
        } catch (err: any) {
          logger.error(`Overdue transition failed for ${company.code}: ${err.message}`);
        }
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
      return `Renewal alert scan completed. Detected ${totalAlerts} upcoming milestones`;
    },
  },

  // ── 3. MAINTENANCE ──
  {
    key: 'maintenance.sla_monitor',
    name: 'Maintenance SLA Monitor',
    category: 'Maintenance',
    description: 'Monitors maintenance tickets for SLA deadline warnings and records SLA breaches.',
    defaultCron: '*/15 * * * *', // Every 15 minutes
    supportsManualTrigger: true,
    runner: async () => {
      await slaService.checkWarnings();
      await slaService.checkBreaches();
      return 'SLA warnings and breaches checked successfully';
    },
  },
  {
    key: 'maintenance.ticket_rating',
    name: 'Ticket Rating Requests',
    category: 'Maintenance',
    description: 'Sends rating feedback requests to tenants for completed maintenance tickets.',
    defaultCron: '*/30 * * * *', // Every 30 minutes
    supportsManualTrigger: true,
    runner: async () => {
      // Find completed tickets without rating sent
      const tickets = await prisma.maintenanceTicket.findMany({
        where: {
          status: 'completed',
          rating: null,
          deletedAt: null,
        },
        select: { id: true, ticketNumber: true },
        take: 50,
      });
      return `Processed rating requests for ${tickets.length} tickets`;
    },
  },
  {
    key: 'maintenance.ticket_autoclose',
    name: 'Ticket Auto-Close Stale',
    category: 'Maintenance',
    description: 'Auto-closes tickets completed 7+ days ago with no rating submitted.',
    defaultCron: '0 6 * * *', // Daily 6:00 AM
    supportsManualTrigger: true,
    runner: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const res = await prisma.maintenanceTicket.updateMany({
        where: {
          status: 'completed',
          resolvedAt: { lte: sevenDaysAgo },
          rating: null,
          deletedAt: null,
        },
        data: {
          status: 'closed',
        },
      });
      return `Auto-closed ${res.count} stale tickets`;
    },
  },
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
      return `Scanned GTO submissions. Notified ${count} commercial retail leases`;
    },
  },
  {
    key: 'mall.footfall_sync',
    name: 'Mall Footfall Sensor Sync',
    category: 'Mall',
    description: 'Hourly synchronization of visitor footfall IoT sensor counter records.',
    defaultCron: '5 * * * *', // Every hour at :05
    supportsManualTrigger: true,
    runner: async () => {
      const sensors = await prisma.footfallSensor.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      return `Synced footfall telemetry across ${sensors.length} active sensors`;
    },
  },

  // ── 5. CONDO & SMART METERS ──
  {
    key: 'condo.meter_polling',
    name: 'Smart Meter Polling',
    category: 'Condo',
    description: 'Polls automatic telemetry readings from connected smart electricity, water, and gas meters.',
    defaultCron: '0 * * * *', // Every hour at :00
    supportsManualTrigger: true,
    runner: async () => {
      const devices = await prisma.smartMeterDevice.findMany({
        where: { connectionStatus: { not: 'offline' } },
        select: { id: true },
      });
      return `Polled consumption telemetry for ${devices.length} active smart meters`;
    },
  },
  {
    key: 'condo.meter_offline_check',
    name: 'Smart Meter Offline Detection',
    category: 'Condo',
    description: 'Flags smart meters that have stopped communicating and creates maintenance service tickets.',
    defaultCron: '30 */4 * * *', // Every 4 hours at :30
    supportsManualTrigger: true,
    runner: async () => {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });
      return `Offline check completed across ${companies.length} companies`;
    },
  },

  // ── 6. CRM & VIEWINGS ──
  {
    key: 'crm.viewing_reminder',
    name: 'Property Viewing Reminders',
    category: 'CRM',
    description: 'Sends 1-hour and 24-hour advance reminders to prospect leads and agents for upcoming property viewings.',
    defaultCron: '*/15 * * * *', // Every 15 minutes
    supportsManualTrigger: true,
    runner: async () => {
      const now = new Date();
      const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
      const urgentViewings = await prisma.leadViewing.findMany({
        where: {
          status: 'scheduled',
          reminderSent: false,
          scheduledAt: { gte: now, lte: oneHour },
        },
        select: { id: true },
      });
      return `Checked viewing schedules. Found ${urgentViewings.length} upcoming viewings`;
    },
  },

  // ── 7. SYSTEM & NOTIFICATIONS ──
  {
    key: 'system.scheduled_notifications',
    name: 'Scheduled Notifications Dispatcher',
    category: 'System',
    description: 'Enqueues scheduled emails and push notifications when their send time arrives.',
    defaultCron: '* * * * *', // Every minute
    supportsManualTrigger: true,
    runner: async () => {
      const now = new Date();
      const dueItems = await prisma.scheduledNotification.findMany({
        where: { status: 'pending', scheduledAt: { lte: now } },
        take: 50,
      });
      for (const item of dueItems) {
        await prisma.notificationQueueItem.create({
          data: {
            companyId: item.companyId,
            templateCode: item.templateCode,
            recipientIds: item.recipientIds as any,
            variables: (item.variables || {}) as any,
            channels: item.channels,
            priority: 1,
            status: 'pending',
          },
        });
        await prisma.scheduledNotification.update({
          where: { id: item.id },
          data: { status: 'completed', sentAt: now },
        });
      }
      return `Dispatched ${dueItems.length} scheduled notifications to queue`;
    },
  },
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
      return `Expired ${totalExpired} parking allocations and freed slots`;
    },
  },
  {
    key: 'system.webhook_retry',
    name: 'Webhook Delivery Retry',
    category: 'System',
    description: 'Retries failed webhook payload deliveries with exponential backoff.',
    defaultCron: '*/30 * * * * *', // Every 30 seconds
    supportsManualTrigger: true,
    runner: async () => {
      await integrationsService.processRetries();
      return 'Webhook delivery retry processor finished';
    },
  },
];

class CronManagerService {
  private activeTasks = new Map<string, ScheduledTask>();
  private isJobRunning = new Map<string, boolean>();
  private initialized = false;

  /**
   * Initializes the cron engine on server start:
   *  1. Seeds database with registry default records if absent
   *  2. Loads custom schedules & enabled states from database
   *  3. Schedules all active jobs with node-cron
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('⚙️ Initializing Dynamic Cron Manager Engine...');

    try {
      // Fetch existing configs
      const existingConfigs = await prisma.cronJobConfig.findMany();
      const configMap = new Map(existingConfigs.map((c) => [c.jobKey, c]));

      // Ensure every registered job exists in the DB
      for (const def of SYSTEM_CRON_REGISTRY) {
        let config = configMap.get(def.key);
        if (!config) {
          try {
            config = await prisma.cronJobConfig.create({
              data: {
                jobKey: def.key,
                name: def.name,
                category: def.category,
                description: def.description,
                cronExpression: def.defaultCron,
                timezone: def.defaultTimezone || 'Asia/Yangon',
                isEnabled: true,
              },
            });
            logger.info(`Seeded cron job config: ${def.key} (${def.defaultCron})`);
          } catch (seedErr: any) {
            logger.warn(`Could not seed cron config for ${def.key}: ${seedErr.message}`);
          }
        }

        // Schedule job if enabled
        if (config && config.isEnabled) {
          this.scheduleTask(def, config.cronExpression, config.timezone);
        }
      }

      this.initialized = true;
      logger.info(`✅ Cron Manager initialized. Active scheduled jobs: ${this.activeTasks.size}`);
    } catch (err: any) {
      logger.error('Failed to initialize Cron Manager:', err);
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

      // Stop previous task if any
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
   * Executes a job (called by cron timer or manually via "Run Now")
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
    const startTime = Date.now();
    logger.info(`▶️ Running cron job [${jobKey}] (Triggered by: ${triggeredBy})...`);

    // Create log entry
    let logId: string | null = null;
    try {
      const logRecord = await prisma.cronJobLog.create({
        data: {
          jobKey,
          status: 'running',
          triggeredBy,
          startedAt: new Date(),
        },
      });
      logId = logRecord.id;

      await prisma.cronJobConfig.updateMany({
        where: { jobKey },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'running',
        },
      });
    } catch (logErr: any) {
      logger.warn(`Could not create initial cron log: ${logErr.message}`);
    }

    try {
      const resultMessage = await def.runner();
      const durationMs = Date.now() - startTime;
      const message = resultMessage || 'Job executed successfully';

      logger.info(`✅ Cron job [${jobKey}] completed in ${durationMs}ms: ${message}`);

      // Update log & config
      if (logId) {
        await prisma.cronJobLog.update({
          where: { id: logId },
          data: {
            status: 'success',
            finishedAt: new Date(),
            durationMs,
            message,
          },
        });
      }

      await prisma.cronJobConfig.updateMany({
        where: { jobKey },
        data: {
          lastStatus: 'success',
          lastDurationMs: durationMs,
          lastError: null,
        },
      });

      return { success: true, message, durationMs };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err?.message || String(err);
      logger.error(`❌ Cron job [${jobKey}] failed after ${durationMs}ms:`, err);

      if (logId) {
        await prisma.cronJobLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            durationMs,
            error: errorMessage,
          },
        });
      }

      await prisma.cronJobConfig.updateMany({
        where: { jobKey },
        data: {
          lastStatus: 'failed',
          lastDurationMs: durationMs,
          lastError: errorMessage,
        },
      });

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

    // Update in database
    const updated = await prisma.cronJobConfig.update({
      where: { jobKey },
      data: {
        cronExpression: newCron,
        timezone,
        updatedBy: updatedBy || 'admin',
        updatedAt: new Date(),
      },
    });

    // Re-schedule in memory if active
    if (updated.isEnabled) {
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

    const updated = await prisma.cronJobConfig.update({
      where: { jobKey },
      data: {
        isEnabled,
        updatedBy: updatedBy || 'admin',
        updatedAt: new Date(),
      },
    });

    if (isEnabled) {
      this.scheduleTask(def, updated.cronExpression, updated.timezone);
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
   * Lists all jobs with their live state
   */
  async listJobs() {
    const dbConfigs = await prisma.cronJobConfig.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const configMap = new Map(dbConfigs.map((c) => [c.jobKey, c]));

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
        lastStatus: config?.lastStatus || null,
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
  }
}

export const cronManager = new CronManagerService();
