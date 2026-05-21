import cron from 'node-cron';
import { prisma, setTenantContext } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Runs daily at 1:00 AM.
 * Applies lease rent escalations that are due today.
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startEscalationJob() {
  cron.schedule('0 1 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalCount = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

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

            logger.info(`Applied escalation for lease ${esc.lease.leaseNumber} (${company.code}): Rent increased to ${esc.newRent}`);
            totalCount++;
          }
        } catch (err: any) {
          logger.error(`Escalation job error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalCount > 0) {
        logger.info(`Escalation job: applied ${totalCount} rent increases`);
      }
    } catch (err) {
      logger.error('Escalation job error:', err);
    }
  });

  logger.info('Lease escalation cron started (daily at 1:00 AM)');
}
