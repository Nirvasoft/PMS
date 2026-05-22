import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { notificationService } from '../notifications/services/notification.service';

/** Default SLA hours when no config is found */
const DEFAULT_SLA: Record<string, { responseHours: number; resolutionHours: number }> = {
  P1: { responseHours: 2, resolutionHours: 8 },
  P2: { responseHours: 4, resolutionHours: 24 },
  P3: { responseHours: 8, resolutionHours: 72 },
  P4: { responseHours: 24, resolutionHours: 168 },
};

export class SlaService {
  /**
   * Resolve the SLA config for a ticket using a fallback chain:
   *  property+category → property → category → company-global → defaults
   */
  async getSlaConfig(companyId: string, propertyId: string, categoryId: string, priority: string) {
    // Try most specific first: property + category + priority
    let config = await prisma.maintenanceSlaConfig.findFirst({
      where: { companyId, propertyId, categoryId, priority },
    });
    if (config) return config;

    // Fallback: property + priority (any category)
    config = await prisma.maintenanceSlaConfig.findFirst({
      where: { companyId, propertyId, categoryId: null, priority },
    });
    if (config) return config;

    // Fallback: category + priority (any property)
    config = await prisma.maintenanceSlaConfig.findFirst({
      where: { companyId, propertyId: null, categoryId, priority },
    });
    if (config) return config;

    // Fallback: company-global (any property + any category)
    config = await prisma.maintenanceSlaConfig.findFirst({
      where: { companyId, propertyId: null, categoryId: null, priority },
    });
    if (config) return config;

    // Absolute fallback: hardcoded defaults
    const defaults = DEFAULT_SLA[priority] || DEFAULT_SLA['P3'];
    return {
      id: null,
      companyId,
      propertyId: null,
      categoryId: null,
      priority,
      ...defaults,
      workingHoursOnly: false,
      escalationContactId: null,
      createdAt: new Date(),
    };
  }

  /** List all SLA configs for a company */
  async findAllConfigs(companyId: string) {
    return prisma.maintenanceSlaConfig.findMany({
      where: { companyId },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        escalationContact: {
          select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Create an SLA config */
  async createConfig(companyId: string, dto: Record<string, unknown>) {
    return prisma.maintenanceSlaConfig.create({
      data: {
        companyId,
        propertyId: (dto.propertyId as string) || null,
        categoryId: (dto.categoryId as string) || null,
        priority: dto.priority as string,
        responseHours: dto.responseHours as number,
        resolutionHours: dto.resolutionHours as number,
        workingHoursOnly: (dto.workingHoursOnly as boolean) || false,
        escalationContactId: (dto.escalationContactId as string) || null,
      },
    });
  }

  /**
   * SLA breach check — called by cron job.
   * Finds tickets that have breached response or resolution SLA deadlines
   * and haven't been recorded as breaches yet.
   *
   * NOTE: This is a simple cron implementation. The function is designed
   * to be easily swapped to a Bull/BullMQ queue processor by wrapping
   * this same logic inside a queue worker `process()` callback.
   */
  async checkBreaches() {
    const now = new Date();

    // Response SLA breaches: no first response and past response deadline
    const responseBreaches = await prisma.maintenanceTicket.findMany({
      where: {
        slaResponseDueAt: { lt: now },
        slaResponseMet: null,  // not yet evaluated
        firstResponseAt: null,  // no response yet
        status: { notIn: ['completed', 'closed', 'cancelled'] },
        deletedAt: null,
      },
      select: { id: true, companyId: true, ticketNumber: true, priority: true, assignedToId: true },
    });

    for (const ticket of responseBreaches) {
      // Check if breach already recorded
      const existing = await prisma.slaBreachEvent.findFirst({
        where: { ticketId: ticket.id, breachType: 'response' },
      });
      if (existing) continue;

      await prisma.$transaction([
        prisma.maintenanceTicket.update({
          where: { id: ticket.id },
          data: { slaResponseMet: false, escalationLevel: { increment: 1 } },
        }),
        prisma.slaBreachEvent.create({
          data: {
            companyId: ticket.companyId,
            ticketId: ticket.id,
            breachType: 'response',
            notified: true,
          },
        }),
      ]);
      logger.warn(`SLA response breach: ticket ${ticket.ticketNumber} (${ticket.priority})`);

      // Notify assigned tech + escalation contact
      this.notifySlaBreach(ticket.companyId, ticket.id, ticket.ticketNumber, ticket.priority, 'response', ticket.assignedToId);
    }

    // Resolution SLA breaches: not resolved and past resolution deadline
    const resolveBreaches = await prisma.maintenanceTicket.findMany({
      where: {
        slaResolveDueAt: { lt: now },
        slaResolveMet: null,
        resolvedAt: null,
        status: { notIn: ['completed', 'closed', 'cancelled'] },
        deletedAt: null,
      },
      select: { id: true, companyId: true, ticketNumber: true, priority: true, assignedToId: true },
    });

    for (const ticket of resolveBreaches) {
      const existing = await prisma.slaBreachEvent.findFirst({
        where: { ticketId: ticket.id, breachType: 'resolution' },
      });
      if (existing) continue;

      await prisma.$transaction([
        prisma.maintenanceTicket.update({
          where: { id: ticket.id },
          data: { slaResolveMet: false, escalationLevel: { increment: 1 } },
        }),
        prisma.slaBreachEvent.create({
          data: {
            companyId: ticket.companyId,
            ticketId: ticket.id,
            breachType: 'resolution',
            notified: true,
          },
        }),
      ]);
      logger.warn(`SLA resolution breach: ticket ${ticket.ticketNumber} (${ticket.priority})`);

      // Notify assigned tech + escalation contact
      this.notifySlaBreach(ticket.companyId, ticket.id, ticket.ticketNumber, ticket.priority, 'resolution', ticket.assignedToId);
    }

    const totalBreaches = responseBreaches.length + resolveBreaches.length;
    if (totalBreaches > 0) {
      logger.info(`SLA monitor: found ${totalBreaches} new breach(es)`);
    }
    return totalBreaches;
  }

  /**
   * Send breach notification to assigned tech + escalation contact (if configured).
   * Fire-and-forget — errors are logged but don't interrupt breach processing.
   */
  private async notifySlaBreach(
    companyId: string, ticketId: string, ticketNumber: string,
    priority: string, breachType: 'response' | 'resolution', assignedToId: string | null,
  ) {
    try {
      const recipientIds: string[] = [];

      if (assignedToId) recipientIds.push(assignedToId);

      // Find escalation contact from SLA config
      const slaConfig = await prisma.maintenanceSlaConfig.findFirst({
        where: { companyId, priority, escalationContactId: { not: null } },
        select: { escalationContactId: true },
      });
      if (slaConfig?.escalationContactId && !recipientIds.includes(slaConfig.escalationContactId)) {
        recipientIds.push(slaConfig.escalationContactId);
      }

      if (recipientIds.length === 0) return;

      await notificationService.send({
        templateCode: 'ticket_sla_breach',
        companyId,
        recipientIds,
        channels: ['in_app', 'email', 'push'],
        variables: {
          ticketNumber,
          priority,
          breachType: breachType === 'response' ? 'Response SLA' : 'Resolution SLA',
        },
        entityType: 'maintenance_ticket',
        entityId: ticketId,
      });
    } catch (err: any) {
      logger.warn(`SLA breach notification failed for ${ticketNumber}: ${err.message}`);
    }
  }
}

export const slaService = new SlaService();
