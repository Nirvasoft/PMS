import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Notification Queue Processor — runs every 10 seconds.
 * Picks pending items from notification_queue, dispatches them,
 * and handles retry with exponential backoff.
 */
export function startNotificationQueueJob() {
  // Run every 10 seconds using setInterval (node-cron min is 1 minute)
  setInterval(async () => {
    try {
      await processQueue();
    } catch (err) {
      logger.error('Notification queue processor error:', err);
    }
  }, 10_000);

  logger.info('Notification queue processor started (every 10s)');
}

async function processQueue() {
  // Pick up to 20 pending items (FIFO, highest priority first)
  const items = await prisma.notificationQueueItem.findMany({
    where: {
      OR: [
        { status: 'pending' },
        {
          status: 'failed',
          nextRetryAt: { lte: new Date() },
        },
      ],
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: 20,
  });

  if (items.length === 0) return;

  // Lazy import to avoid circular dependency
  const { notificationService } = await import('../services/notification.service');

  for (const item of items) {
    // Skip if too many attempts
    if (item.attempts >= item.maxAttempts) {
      await prisma.notificationQueueItem.update({
        where: { id: item.id },
        data: { status: 'failed', errorMessage: 'Max attempts exceeded' },
      });
      continue;
    }

    // Mark as processing
    await prisma.notificationQueueItem.update({
      where: { id: item.id },
      data: { status: 'processing', attempts: { increment: 1 } },
    });

    try {
      // Dispatch using the service's internal sendImmediate method
      await notificationService.sendImmediate({
        templateCode: item.templateCode,
        companyId: item.companyId,
        recipientIds: item.recipientIds as string[],
        variables: (item.variables as Record<string, unknown>) || {},
        channels: item.channels.length > 0 ? item.channels : undefined,
        entityType: item.entityType || undefined,
        entityId: item.entityId || undefined,
      });

      // Mark as sent
      await prisma.notificationQueueItem.update({
        where: { id: item.id },
        data: { status: 'sent', processedAt: new Date(), errorMessage: null },
      });
    } catch (err: any) {
      const newAttempts = item.attempts + 1;
      const backoffMs = Math.min(
        1000 * 60 * Math.pow(3, newAttempts - 1), // 1m, 3m, 9m
        1000 * 60 * 15,                            // cap at 15 minutes
      );

      await prisma.notificationQueueItem.update({
        where: { id: item.id },
        data: {
          status: newAttempts >= item.maxAttempts ? 'failed' : 'failed',
          errorMessage: err.message?.substring(0, 500) || 'Unknown error',
          nextRetryAt: newAttempts < item.maxAttempts
            ? new Date(Date.now() + backoffMs)
            : null,
        },
      });

      logger.error(`Queue item ${item.id} failed (attempt ${newAttempts}/${item.maxAttempts}):`, err.message);
    }
  }
}
