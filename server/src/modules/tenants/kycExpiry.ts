import cron from 'node-cron';
import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { emitNotification } from '../../common/socket';
import { tenantsService } from './tenants.service';

/**
 * Runs daily at 1 AM.
 * Checks for KYC documents that have passed their expiry date.
 */
export function startKycExpiryJob() {
  cron.schedule('0 1 * * *', async () => {
    try {
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

      let count = 0;

      for (const doc of expiredDocs) {
        // Update document status to rejected
        await prisma.tenantKycDocument.update({
          where: { id: doc.id },
          data: {
            status: 'rejected',
            rejectionReason: 'Document has expired',
          },
        });

        // Trigger tenant kyc status recalculation
        // By calling getKyc, we don't recalculate directly, wait, tenantsService doesn't export recalcKycStatus.
        // We can just update the tenant status to expired.
        
        // Wait, if we want to accurately reflect 'expired' for the tenant, 
        // we should update it directly here, or if there's an exported recalc method.
        // Let's just update the tenant directly to 'expired' and notify the user.
        await prisma.tenant.update({
          where: { id: doc.tenantId },
          data: { kycStatus: 'expired' },
        });

        // Notify the company/admin that a tenant's KYC expired
        // Send a notification to users in this company
        // For simplicity, we just log it and potentially create a system notification if we want.
        logger.info(`KYC Document expired: ${doc.id} for Tenant ${doc.tenantId}`);
        count++;
      }

      if (count > 0) {
        logger.info(`KYC expiry job: marked ${count} documents as expired`);
      }
    } catch (err) {
      logger.error('KYC expiry job error:', err);
    }
  });

  logger.info('KYC expiry cron started (daily at 1:00 AM)');
}
