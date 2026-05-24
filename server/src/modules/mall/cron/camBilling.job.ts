import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';
import { mallService } from '../mall.service';

/**
 * CAM Billing Auto-Generate — Runs on the 1st of every month at 3:00 AM.
 *
 * For each company with active mall properties and CAM pools:
 *  1. Generate monthly CAM billings for the current month
 *  2. Creates CamBilling records (proportionate by GLA)
 */
export function startCamBillingJob() {
  cron.schedule('0 3 1 * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalGenerated = 0;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          // Find mall properties for this company
          const mallProperties = await prisma.mallProperty.findMany({
            where: { companyId: company.id },
            select: { propertyId: true },
          });

          for (const mp of mallProperties) {
            try {
              const result = await mallService.generateCamBillings(
                company.id, mp.propertyId, month, year,
              );
              totalGenerated += result.generated;
              logger.info(
                `CAM billing auto-generated for property ${mp.propertyId} ` +
                `(company ${company.code}): ${result.generated} records, ` +
                `${result.pools} pools × ${result.units} units`
              );
            } catch (err: any) {
              // Skip if no pools or no units — expected for some properties
              if (err.message?.includes('No active') || err.message?.includes('Total GLA is zero')) {
                continue;
              }
              logger.error(`CAM billing error for property ${mp.propertyId}: ${err.message}`);
            }
          }
        } catch (err: any) {
          logger.error(`CAM billing job error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalGenerated > 0) {
        logger.info(`CAM billing cron: generated ${totalGenerated} billing records across ${companies.length} companies`);
      }
    } catch (err) {
      logger.error('CAM billing cron error:', err);
    }
  });

  logger.info('CAM billing cron started (1st of each month at 3:00 AM)');
}
