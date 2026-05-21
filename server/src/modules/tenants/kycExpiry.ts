import cron from 'node-cron';
import { prisma, setTenantContext } from '../../common/database';
import { logger } from '../../common/logger';
import { emitNotification } from '../../common/socket';
import { tenantsService } from './tenants.service';

/**
 * Runs daily at 1 AM.
 * Checks for KYC documents that have passed their expiry date.
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startKycExpiryJob() {
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
          // Set to midnight to just check the date portion
          today.setHours(0, 0, 0, 0);

          // Find all approved documents with expiry dates in the past
          const expiredDocs = await prisma.tenantKycDocument.findMany({
            where: {
              status: 'approved',
              expiryDate: { lt: today },
            },
            include: {
              requirement: true,
              tenant: true,
            },
          });

          for (const doc of expiredDocs) {
            // Update document status to rejected
            await prisma.tenantKycDocument.update({
              where: { id: doc.id },
              data: {
                status: 'rejected',
                rejectionReason: 'Document has expired',
              },
            });

            // Update the tenant's kyc status to 'expired'
            await prisma.tenant.update({
              where: { id: doc.tenantId },
              data: { kycStatus: 'expired' },
            });

            logger.info(`KYC Document expired: ${doc.id} for Tenant ${doc.tenantId} (${company.code})`);
            totalCount++;
          }
        } catch (err: any) {
          logger.error(`KYC expiry error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalCount > 0) {
        logger.info(`KYC expiry job: marked ${totalCount} documents as expired`);
      }
    } catch (err) {
      logger.error('KYC expiry job error:', err);
    }
  });

  logger.info('KYC expiry cron started (daily at 1:00 AM)');
}
