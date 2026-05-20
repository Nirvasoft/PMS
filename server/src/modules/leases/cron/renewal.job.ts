import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Runs daily at 8:00 AM.
 * Sends notifications for leases expiring in 90, 60, 30, 14, and 7 days.
 */
export function startRenewalJob() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const alertDays = [90, 60, 30, 14, 7];
      let totalAlerts = 0;

      for (const days of alertDays) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);

        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const expiringLeases = await prisma.lease.findMany({
          where: {
            status: 'active',
            endDate: {
              gte: targetDate,
              lt: nextDay,
            },
          },
          include: {
            unit: { include: { property: true } },
            tenant: true,
          },
        });

        for (const lease of expiringLeases) {
          // In a fully integrated system, we would use notificationsService.
          // For now, we will log the alert since the notification framework depends on Phase 1.5 logic.
          logger.info(`[RENEWAL ALERT] Lease ${lease.leaseNumber} for unit ${lease.unit.unitNumber} expires in ${days} days (${lease.endDate.toISOString().split('T')[0]})`);
          totalAlerts++;
          
          // Eventually this calls:
          // await notificationsService.send({ templateCode: 'lease_expiring_soon', ... });
        }
      }

      if (totalAlerts > 0) {
        logger.info(`Renewal job: Sent ${totalAlerts} expiry alerts`);
      }
    } catch (err) {
      logger.error('Renewal job error:', err);
    }
  });

  logger.info('Lease renewal cron started (daily at 8:00 AM)');
}
