import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';
import { invoicesService } from '../invoices.service';

/**
 * Runs daily at 4:00 AM.
 * Transitions past-due invoices to 'overdue' status.
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startOverdueTransitionJob() {
  cron.schedule('0 4 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      for (const company of companies) {
        try {
          await setTenantContext(company.id);
          await invoicesService.transitionOverdue();
        } catch (err: any) {
          logger.error(`Overdue transition job error for company ${company.code}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error('Overdue transition job error:', err);
    }
  });

  logger.info('Overdue transition cron started (daily at 4:00 AM)');
}
