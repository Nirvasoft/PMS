import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';
import { notificationService } from '../../notifications/services/notification.service';

/**
 * Viewing Reminder Job — Runs every 15 minutes.
 *
 * Finds scheduled viewings happening in the next 1 hour that haven't had
 * a reminder sent yet, and sends notifications to:
 *   1. The assigned agent (if any)
 *   2. The lead's assigned-to user (if different from agent)
 *
 * Also sends a 24-hour advance reminder for viewings the next day.
 *
 * Uses the `reminderSent` flag on LeadViewing to avoid duplicate 1-hour notifications.
 */
export function startViewingReminderJob() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await processViewingReminders();
    } catch (err) {
      logger.error('Viewing reminder job error:', err);
    }
  });

  logger.info('📅 Viewing reminder job started (every 15 minutes)');
}

async function processViewingReminders() {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const twentyThreeHoursFromNow = new Date(now.getTime() + 23 * 60 * 60 * 1000);

  // ─── 1-Hour Reminders ───────────────────────────
  // Find viewings in the next hour that haven't been reminded
  const urgentViewings = await prisma.leadViewing.findMany({
    where: {
      status: 'scheduled',
      reminderSent: false,
      scheduledAt: {
        gte: now,
        lte: oneHourFromNow,
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyId: true,
          assignedTo: true,
        },
      },
      unit: { select: { unitNumber: true } },
      property: { select: { name: true } },
      agent: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  let reminders1h = 0;

  for (const viewing of urgentViewings) {
    try {
      const leadName = [viewing.lead.firstName, viewing.lead.lastName].filter(Boolean).join(' ') || 'Unknown';
      const unitInfo = viewing.unit ? `Unit ${viewing.unit.unitNumber}` : 'N/A';
      const propertyInfo = viewing.property?.name || '';
      const scheduledTime = viewing.scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Collect unique recipient IDs
      const recipientIds = new Set<string>();
      if (viewing.agentId) recipientIds.add(viewing.agentId);
      if (viewing.lead.assignedTo) recipientIds.add(viewing.lead.assignedTo);

      if (recipientIds.size > 0) {
        // Send notification via the notification service
        try {
          await notificationService.send({
            templateCode: 'viewing_reminder_1h',
            companyId: viewing.lead.companyId,
            recipientIds: Array.from(recipientIds),
            variables: {
              leadName,
              unitInfo,
              propertyName: propertyInfo,
              scheduledTime,
              durationMinutes: viewing.durationMinutes,
            },
            entityType: 'lead_viewing',
            entityId: viewing.id,
          });
        } catch {
          // Template may not exist — create inline notification log as fallback
          for (const recipientId of recipientIds) {
            await prisma.notificationLog.create({
              data: {
                companyId: viewing.lead.companyId,
                recipientId,
                channel: 'in_app',
                subject: `⏰ Viewing in less than 1 hour`,
                body: `Viewing with ${leadName} — ${unitInfo}${propertyInfo ? ` at ${propertyInfo}` : ''} at ${scheduledTime}. Duration: ${viewing.durationMinutes} minutes.`,
                status: 'sent',
                sentAt: new Date(),
                entityType: 'lead_viewing',
                entityId: viewing.id,
                metadata: {
                  viewingId: viewing.id,
                  leadId: viewing.lead.id,
                  leadName,
                  scheduledAt: viewing.scheduledAt.toISOString(),
                  reminderType: '1h',
                },
              },
            });
          }
        }

        reminders1h++;
      }

      // Mark reminder as sent (prevents duplicate 1h reminders)
      await prisma.leadViewing.update({
        where: { id: viewing.id },
        data: { reminderSent: true },
      });
    } catch (err: any) {
      logger.error(`Failed to send viewing reminder for ${viewing.id}:`, err.message);
    }
  }

  // ─── 24-Hour Advance Reminders ──────────────────
  // Find viewings 23-24 hours away (to catch them in the 15-min window)
  const advanceViewings = await prisma.leadViewing.findMany({
    where: {
      status: 'scheduled',
      reminderSent: false,
      scheduledAt: {
        gte: twentyThreeHoursFromNow,
        lte: twentyFourHoursFromNow,
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyId: true,
          assignedTo: true,
        },
      },
      unit: { select: { unitNumber: true } },
      property: { select: { name: true } },
      agent: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  let reminders24h = 0;

  for (const viewing of advanceViewings) {
    try {
      const leadName = [viewing.lead.firstName, viewing.lead.lastName].filter(Boolean).join(' ') || 'Unknown';
      const unitInfo = viewing.unit ? `Unit ${viewing.unit.unitNumber}` : 'N/A';
      const propertyInfo = viewing.property?.name || '';
      const scheduledDate = viewing.scheduledAt.toLocaleDateString();
      const scheduledTime = viewing.scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const recipientIds = new Set<string>();
      if (viewing.agentId) recipientIds.add(viewing.agentId);
      if (viewing.lead.assignedTo) recipientIds.add(viewing.lead.assignedTo);

      if (recipientIds.size > 0) {
        try {
          await notificationService.send({
            templateCode: 'viewing_reminder_24h',
            companyId: viewing.lead.companyId,
            recipientIds: Array.from(recipientIds),
            variables: {
              leadName,
              unitInfo,
              propertyName: propertyInfo,
              scheduledDate,
              scheduledTime,
              durationMinutes: viewing.durationMinutes,
            },
            entityType: 'lead_viewing',
            entityId: viewing.id,
          });
        } catch {
          // Fallback inline notification
          for (const recipientId of recipientIds) {
            await prisma.notificationLog.create({
              data: {
                companyId: viewing.lead.companyId,
                recipientId,
                channel: 'in_app',
                subject: `📅 Viewing tomorrow`,
                body: `Reminder: Viewing with ${leadName} — ${unitInfo}${propertyInfo ? ` at ${propertyInfo}` : ''} scheduled for ${scheduledDate} at ${scheduledTime} (${viewing.durationMinutes} min).`,
                status: 'sent',
                sentAt: new Date(),
                entityType: 'lead_viewing',
                entityId: viewing.id,
                metadata: {
                  viewingId: viewing.id,
                  leadId: viewing.lead.id,
                  leadName,
                  scheduledAt: viewing.scheduledAt.toISOString(),
                  reminderType: '24h',
                },
              },
            });
          }
        }

        reminders24h++;
        // Note: Don't set reminderSent=true for 24h — the 1-hour reminder still needs to fire
      }
    } catch (err: any) {
      logger.error(`Failed to send 24h viewing reminder for ${viewing.id}:`, err.message);
    }
  }

  if (reminders1h > 0 || reminders24h > 0) {
    logger.info(`📅 Viewing reminders sent: ${reminders1h} (1h), ${reminders24h} (24h advance)`);
  }
}
