import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';
import { penaltyService } from '../penalty.service';

/**
 * Runs daily at 3:00 AM.
 * Checks overdue invoices and applies late payment penalties.
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startPenaltyCheckJob() {
  cron.schedule('0 3 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      for (const company of companies) {
        try {
          await setTenantContext(company.id);
          await penaltyService.checkAndApplyPenalties();
        } catch (err: any) {
          logger.error(`Penalty check job error for company ${company.code}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error('Penalty check job error:', err);
    }
  });

  logger.info('Penalty check cron started (daily at 3:00 AM)');
}
