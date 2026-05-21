import cron from 'node-cron';
import { prisma, setTenantContext } from '../../common/database';
import { logger } from '../../common/logger';
import { emitNotification } from '../../common/socket';

/**
 * Runs daily at 8 AM.
 * Checks for documents approaching their expiry date and sends notifications.
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startDocumentExpiryJob() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalNotifications = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const today = new Date();

          // Find all documents with expiry dates that haven't been archived
          const documents = await prisma.document.findMany({
            where: {
              expiryDate: { not: null },
              deletedAt: null,
              status: { not: 'archived' },
            },
            select: {
              id: true, name: true, entityType: true, entityId: true,
              expiryDate: true, expiryReminderDays: true, uploadedBy: true, companyId: true,
            },
          });

          for (const doc of documents) {
            if (!doc.expiryDate) continue;

            const daysUntilExpiry = Math.ceil(
              (doc.expiryDate.getTime() - today.getTime()) / 86400000,
            );

            // Check if today matches any configured reminder day
            if (doc.expiryReminderDays.includes(daysUntilExpiry)) {
              await prisma.inAppNotification.create({
                data: {
                  userId: doc.uploadedBy,
                  companyId: company.id,
                  title: daysUntilExpiry <= 0
                    ? `📄 Document Expired: ${doc.name}`
                    : `📄 Document Expiring in ${daysUntilExpiry} days`,
                  body: daysUntilExpiry <= 0
                    ? `The document "${doc.name}" has expired and requires attention.`
                    : `The document "${doc.name}" will expire on ${doc.expiryDate.toISOString().split('T')[0]}.`,
                  icon: 'file-warning',
                  actionUrl: `/documents?id=${doc.id}`,
                  entityType: 'document',
                  entityId: doc.id,
                },
              });

              // Real-time notification
              emitNotification(doc.uploadedBy, {
                id: `doc_expiry_${doc.id}_${daysUntilExpiry}`,
                title: `📄 Document ${daysUntilExpiry <= 0 ? 'Expired' : `Expiring in ${daysUntilExpiry}d`}`,
                body: doc.name,
                icon: 'file-warning',
                actionUrl: `/documents?id=${doc.id}`,
              });

              totalNotifications++;
            }
          }
        } catch (err: any) {
          logger.error(`Document expiry error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalNotifications > 0) {
        logger.info(`Document expiry: sent ${totalNotifications} notifications`);
      }
    } catch (err) {
      logger.error('Document expiry job error:', err);
    }
  });

  logger.info('Document expiry cron started (daily at 8:00 AM)');
}
