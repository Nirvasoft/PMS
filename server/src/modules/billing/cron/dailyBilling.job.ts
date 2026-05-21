import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';
import { billingSchedulesService } from '../billingSchedules.service';
import { invoicesService } from '../invoices.service';

/**
 * Runs daily at 2:00 AM.
 * Generates invoices for all billing schedules due today or earlier.
 * 
 * Multi-tenant: iterates over all active companies, sets RLS context
 * for each, then processes that company's due schedules.
 */
export function startDailyBillingJob() {
  cron.schedule('0 2 * * *', async () => {
    try {
      // Get all active companies (companies table is NOT RLS-protected)
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalGenerated = 0;

      for (const company of companies) {
        try {
          // Set tenant context for this company
          await setTenantContext(company.id);

          const today = new Date();
          const dueSchedules = await billingSchedulesService.findDueSchedules(today);

          for (const schedule of dueSchedules) {
            try {
              await invoicesService.generateFromSchedule(schedule.id);
              totalGenerated++;
            } catch (err: any) {
              logger.error(`Billing job error for schedule ${schedule.id} (company ${company.code}): ${err.message}`);
            }
          }
        } catch (err: any) {
          logger.error(`Billing job error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalGenerated > 0) {
        logger.info(`Daily billing job: generated ${totalGenerated} invoices across ${companies.length} companies`);
      }
    } catch (err) {
      logger.error('Daily billing job error:', err);
    }
  });

  logger.info('Daily billing cron started (daily at 2:00 AM)');
}
