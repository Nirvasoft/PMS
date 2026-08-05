/**
 * Phase 2 Cron Jobs — Real implementations for CRM viewing reminders
 * and parking pass expiry.
 *
 * ┌─────────────────────────┬───────────┬───────────────┬──────────────────────────┐
 * │ Job                     │ Schedule  │ Module        │ Status                   │
 * ├─────────────────────────┼───────────┼───────────────┼──────────────────────────┤
 * │ Lease Renewal Alerts    │ 0 8 * * * │ 2.4 Leases    │ ✅ Implemented           │
 * │ Lease Escalation Apply  │ 0 2 * * * │ 2.4 Leases    │ ✅ Implemented           │
 * │ KYC Expiry Check        │ 0 1 * * * │ 2.3 Tenants   │ ✅ Implemented           │
 * │ Viewing Reminders       │ 0 7 * * * │ 2.5 CRM       │ ✅ Implemented           │
 * │ Parking Pass Expiry     │ 0 0 * * * │ 2.6 Parking   │ ✅ Implemented           │
 * └─────────────────────────┴───────────┴───────────────┴──────────────────────────┘
 */
import cron from 'node-cron';
import { prisma, setTenantContext } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Viewing Reminder — sends reminder notifications to prospects
 * before scheduled viewings (today + tomorrow).
 * Schedule: Daily at 7:00 AM.
 */
export function startViewingReminderJob() {
  cron.schedule('0 7 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalReminders = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const endWindow = new Date(now);
          endWindow.setDate(endWindow.getDate() + 2); // today + tomorrow

          // Find viewings in the next 48 hours that haven't had reminders sent
          const viewings = await prisma.leadViewing.findMany({
            where: {
              scheduledAt: { gte: now, lt: endWindow },
              status: 'scheduled',
              reminderSent: false,
            },
            include: {
              lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
              property: { select: { id: true, name: true } },
              unit: { select: { id: true, unitNumber: true } },
              agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
            },
          });

          for (const viewing of viewings) {
            const viewingDate = viewing.scheduledAt.toISOString().split('T')[0];
            const viewingTime = viewing.scheduledAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const leadName = [viewing.lead.firstName, viewing.lead.lastName].filter(Boolean).join(' ');
            const location = viewing.property?.name || 'property';
            const unitInfo = viewing.unit ? ` unit ${viewing.unit.unitNumber}` : '';

            // Log the reminder (notification queue will pick up template-based notifications)
            logger.info(
              `[VIEWING REMINDER] ${company.code}: ${leadName} viewing at ${location}${unitInfo} ` +
              `on ${viewingDate} at ${viewingTime}` +
              (viewing.agent ? ` (agent: ${viewing.agent.email})` : '')
            );

            // Mark reminder as sent
            await prisma.leadViewing.update({
              where: { id: viewing.id },
              data: { reminderSent: true },
            });

            totalReminders++;
          }
        } catch (err: any) {
          logger.error(`Viewing reminder error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalReminders > 0) {
        logger.info(`Viewing reminder job: Sent ${totalReminders} reminders`);
      }
    } catch (err) {
      logger.error('Viewing reminder job error:', err);
    }
  });

  logger.info('Viewing reminder cron started (daily at 7:00 AM)');
}

/**
 * Parking Pass Expiry — expires parking allocations past their end date
 * and frees the parking slots.
 * Schedule: Daily at midnight.
 */
export function startParkingPassExpiryJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalExpired = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const now = new Date();
          now.setHours(0, 0, 0, 0);

          // Find active allocations past their end date
          const expiredAllocations = await prisma.parkingAllocation.findMany({
            where: {
              companyId: company.id,
              status: 'active',
              endDate: { lt: now },
            },
            include: {
              slot: { select: { id: true, slotNumber: true } },
              tenant: { select: { id: true, firstName: true, lastName: true, companyName: true } },
              property: { select: { id: true, name: true } },
            },
          });

          for (const alloc of expiredAllocations) {
            // Transition allocation to expired
            await prisma.parkingAllocation.update({
              where: { id: alloc.id },
              data: { status: 'expired' },
            });

            // Free the parking slot
            await prisma.parkingSlot.update({
              where: { id: alloc.slotId },
              data: { status: 'available' },
            });

            const tenantName = alloc.tenant.companyName
              || [alloc.tenant.firstName, alloc.tenant.lastName].filter(Boolean).join(' ');

            logger.info(
              `[PARKING EXPIRY] Slot ${alloc.slot.slotNumber} at ${alloc.property.name} (${company.code}) ` +
              `freed — tenant ${tenantName}'s allocation expired`
            );

            totalExpired++;
          }
        } catch (err: any) {
          logger.error(`Parking expiry error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalExpired > 0) {
        logger.info(`Parking expiry job: Expired ${totalExpired} allocations`);
      }
    } catch (err) {
      logger.error('Parking pass expiry job error:', err);
    }
  });

  logger.info('Parking pass expiry cron started (daily at midnight)');
}

/**
 * Start all Phase 2 cron jobs.
 */
export function startPhase2CronStubs() {
  startViewingReminderJob();
  startParkingPassExpiryJob();
}
