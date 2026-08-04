import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';

/**
 * Scheduled Notification Processor — runs every minute.
 * Checks for scheduled_notifications that are due, enqueues them
 * into the notification_queue, and handles recurring schedules.
 */
export function startScheduledNotificationJob() {
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduled();
    } catch (err) {
      logger.error('Scheduled notification processor error:', err);
    }
  });

  logger.info('Scheduled notification processor started (every minute)');
}

async function processScheduled() {
  const now = new Date();

  // Find due pending scheduled notifications
  const dueItems = await prisma.scheduledNotification.findMany({
    where: {
      status: 'pending',
      scheduledAt: { lte: now },
    },
    take: 50,
  });

  if (dueItems.length === 0) return;

  for (const item of dueItems) {
    try {
      // Enqueue into the notification dispatch queue
      await prisma.notificationQueueItem.create({
        data: {
          companyId: item.companyId,
          templateCode: item.templateCode,
          recipientIds: item.recipientIds as any,
          variables: (item.variables || {}) as any,
          channels: item.channels,
          entityType: item.entityType,
          entityId: item.entityId,
          priority: 0,
        },
      });

      if (item.recurrenceCron) {
        // Recurring: calculate next scheduled time
        const nextAt = getNextCronDate(item.recurrenceCron);
        if (nextAt) {
          await prisma.scheduledNotification.update({
            where: { id: item.id },
            data: {
              scheduledAt: nextAt,
              sentAt: now,
              // Keep status 'pending' for next occurrence
            },
          });
          logger.info(`Scheduled notification ${item.id} enqueued, next at ${nextAt.toISOString()}`);
        } else {
          // Invalid cron — mark as sent
          await prisma.scheduledNotification.update({
            where: { id: item.id },
            data: { status: 'sent', sentAt: now },
          });
        }
      } else {
        // One-shot: mark as sent
        await prisma.scheduledNotification.update({
          where: { id: item.id },
          data: { status: 'sent', sentAt: now },
        });
        logger.info(`Scheduled notification ${item.id} enqueued (one-shot)`);
      }
    } catch (err: any) {
      await prisma.scheduledNotification.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          errorMessage: err.message?.substring(0, 500) || 'Unknown error',
        },
      });
      logger.error(`Scheduled notification ${item.id} failed:`, err.message);
    }
  }
}

/**
 * Calculate the next occurrence of a cron expression from now.
 * Uses a simple parser for standard 5-field cron expressions.
 */
function getNextCronDate(cronExpr: string): Date | null {
  try {
    // Use node-cron's validate to check, then calculate next time
    const cron = require('node-cron');
    if (!cron.validate(cronExpr)) return null;

    // Simple approach: iterate minute-by-minute from now to find next match
    const now = new Date();
    const parts = cronExpr.split(/\s+/);
    if (parts.length < 5) return null;

    // Try the next 24 hours (1440 minutes)
    for (let i = 1; i <= 1440; i++) {
      const candidate = new Date(now.getTime() + i * 60_000);
      if (matchesCron(candidate, parts)) {
        return candidate;
      }
    }

    // If nothing in 24h, try up to 32 days
    for (let i = 1; i <= 32 * 24 * 60; i += 60) {
      const candidate = new Date(now.getTime() + i * 60_000);
      if (matchesCron(candidate, parts)) {
        return candidate;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function matchesCron(date: Date, parts: string[]): boolean {
  const [minField, hourField, domField, monField, dowField] = parts;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  return (
    matchesField(minute, minField, 0, 59) &&
    matchesField(hour, hourField, 0, 23) &&
    matchesField(dom, domField, 1, 31) &&
    matchesField(month, monField, 1, 12) &&
    matchesField(dow, dowField, 0, 6)
  );
}

function matchesField(value: number, field: string, min: number, max: number): boolean {
  if (field === '*') return true;

  // Handle step (*/n)
  if (field.startsWith('*/')) {
    const step = parseInt(field.substring(2));
    return step > 0 && value % step === 0;
  }

  // Handle comma-separated values
  const values = field.split(',');
  for (const v of values) {
    // Handle range (a-b)
    if (v.includes('-')) {
      const [start, end] = v.split('-').map(Number);
      if (value >= start && value <= end) return true;
    } else {
      if (parseInt(v) === value) return true;
    }
  }

  return false;
}
