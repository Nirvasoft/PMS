import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Runs daily at 1:00 AM.
 * Applies lease rent escalations that are due today.
 */
export function startEscalationJob() {
  cron.schedule('0 1 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueEscalations = await prisma.leaseEscalationSchedule.findMany({
        where: {
          effectiveDate: { lte: today },
          applied: false,
        },
        include: { lease: true },
      });

      let count = 0;
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

        logger.info(`Applied escalation for lease ${esc.lease.leaseNumber}: Rent increased to ${esc.newRent}`);
        count++;
      }

      if (count > 0) {
        logger.info(`Escalation job: applied ${count} rent increases`);
      }
    } catch (err) {
      logger.error('Escalation job error:', err);
    }
  });

  logger.info('Lease escalation cron started (daily at 1:00 AM)');
}
