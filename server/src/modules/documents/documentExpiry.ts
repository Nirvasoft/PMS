import cron from 'node-cron';
import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { emitNotification } from '../../common/socket';

/**
 * Runs daily at 8 AM.
 * Checks for documents approaching their expiry date and sends notifications.
 */
export function startDocumentExpiryJob() {
  cron.schedule('0 8 * * *', async () => {
    try {
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

      let notificationCount = 0;

      for (const doc of documents) {
        if (!doc.expiryDate) continue;

        const daysUntilExpiry = Math.ceil(
          (doc.expiryDate.getTime() - today.getTime()) / 86400000,
        );

        // Check if today matches any configured reminder day
        if (doc.expiryReminderDays.includes(daysUntilExpiry)) {
          // Create in-app notification
          const user = await prisma.user.findUnique({
            where: { id: doc.uploadedBy },
            select: { companyId: true },
          });

          if (user) {
            await prisma.inAppNotification.create({
              data: {
                userId: doc.uploadedBy,
                companyId: user.companyId,
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

            notificationCount++;
          }
        }
      }

      if (notificationCount > 0) {
        logger.info(`Document expiry: sent ${notificationCount} notifications`);
      }
    } catch (err) {
      logger.error('Document expiry job error:', err);
    }
  });

  logger.info('Document expiry cron started (daily at 8:00 AM)');
}
