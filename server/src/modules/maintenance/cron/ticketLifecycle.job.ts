import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';
import { notificationService } from '../../notifications/services/notification.service';

/**
 * Ticket Lifecycle Cron Job
 *
 * Handles two post-completion lifecycle events:
 *
 * 1. Rating Request (every 30 minutes):
 *    - Finds tickets completed ≥ 2 hours ago that were reported by a tenant
 *    - Sends a rating request notification to the reporting tenant's linked user
 *    - Marks the ticket so it's not re-notified
 *
 * 2. Auto-Close (daily at 6 AM):
 *    - Finds tickets completed ≥ 7 days ago that have no rating
 *    - Automatically closes them with status 'closed'
 */

// ── Rating Request (Gap 6) ─────────────────────

async function sendRatingRequests() {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600000);

  // Find completed tickets reported by tenants, completed ≥2h ago, not yet rated, not yet notified
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      status: 'completed',
      reportedByTenantId: { not: null },
      resolvedAt: { lte: twoHoursAgo },
      rating: null,
      ratedAt: null,
      deletedAt: null,
      // Use ratingComment as a "notified" flag — null means not yet notified
      // We'll set ratingComment to '__rating_requested__' to prevent re-sending
      ratingComment: null,
    },
    select: {
      id: true,
      companyId: true,
      ticketNumber: true,
      title: true,
      priority: true,
      reportedByTenant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userId: true,
        },
      },
      property: { select: { name: true } },
    },
    take: 50, // batch limit
  });

  if (tickets.length === 0) return;

  let sent = 0;
  for (const ticket of tickets) {
    const tenant = ticket.reportedByTenant;
    if (!tenant?.userId) continue;

    try {
      await notificationService.send({
        templateCode: 'rating_request',
        companyId: ticket.companyId,
        recipientIds: [tenant.userId],
        channels: ['in_app', 'push'],
        variables: {
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
          propertyName: ticket.property?.name || 'N/A',
        },
        entityType: 'maintenance_ticket',
        entityId: ticket.id,
      });

      // Mark as notified to prevent re-sending
      await prisma.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { ratingComment: '__rating_requested__' },
      });

      sent++;
    } catch (err: any) {
      logger.warn(`Rating request failed for ${ticket.ticketNumber}: ${err.message}`);
    }
  }

  if (sent > 0) {
    logger.info(`Sent ${sent} rating request notification(s)`);
  }
}

// ── Auto-Close (Gap 7) ──────────────────────────

async function autoCloseStaleTickets() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);

  // Close tickets completed ≥7 days ago with no rating (single raw query)
  const closed = await prisma.$executeRaw`
    UPDATE maintenance_tickets
    SET status = 'closed',
        rating_comment = CASE 
          WHEN rating_comment IS NULL OR rating_comment = '__rating_requested__' 
          THEN 'Auto-closed after 7 days without rating'
          ELSE rating_comment 
        END,
        updated_at = NOW()
    WHERE status = 'completed'
      AND resolved_at <= ${sevenDaysAgo}
      AND rating IS NULL
      AND deleted_at IS NULL
  `;

  if (closed > 0) {
    logger.info(`Auto-closed ${closed} stale ticket(s) (completed ≥7 days, no rating)`);
  }
}

// ── Cron Registration ───────────────────────────

export function startTicketLifecycleJobs() {
  // Rating request: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await sendRatingRequests();
    } catch (err: any) {
      logger.error(`Rating request job failed: ${err.message}`);
    }
  });
  logger.info('Rating request cron started (every 30 minutes)');

  // Auto-close: daily at 6 AM
  cron.schedule('0 6 * * *', async () => {
    try {
      await autoCloseStaleTickets();
    } catch (err: any) {
      logger.error(`Auto-close job failed: ${err.message}`);
    }
  });
  logger.info('Auto-close cron started (daily at 6:00 AM)');
}
