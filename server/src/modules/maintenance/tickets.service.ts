import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { slaService, addSlaHours } from './sla.service';
import { io } from '../../common/socket';
import { notificationService } from '../notifications/services/notification.service';
import { webhookTicketCreated, webhookTicketAssigned, webhookTicketRated } from '../../common/webhookHooks';

export class TicketsService {
  // ── Query ───────────────────────────────────

  async findAll(companyId: string, filters: {
    propertyId?: string; unitId?: string; status?: string; priority?: string;
    categoryId?: string; assignedTo?: string; source?: string; search?: string;
    from?: string; to?: string; page?: number; limit?: number;
    sort?: string; order?: string;
  }) {
    const { propertyId, unitId, status, priority, categoryId, assignedTo, source,
      search, from, to, page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = filters;
    const where: any = { companyId, deletedAt: null };

    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (assignedTo) where.assignedToId = assignedTo;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: any = { [sort]: order };

    const [data, total] = await Promise.all([
      prisma.maintenanceTicket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, icon: true } },
          property: { select: { id: true, name: true } },
          unit: { select: { id: true, unitNumber: true } },
          assignedTo: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          _count: { select: { workOrders: true, photos: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.maintenanceTicket.count({ where }),
    ]);

    // Add computed SLA status
    const now = new Date();
    const enriched = data.map((t) => {
      let slaStatus: 'on_track' | 'at_risk' | 'breached' | 'met' | null = null;
      let hoursUntilSla: number | null = null;

      if (t.slaResolveDueAt && !['completed', 'closed', 'cancelled'].includes(t.status)) {
        const remaining = (t.slaResolveDueAt.getTime() - now.getTime()) / 3600000;
        hoursUntilSla = Math.round(remaining * 10) / 10;
        const totalSlaHours = t.slaResponseDueAt
          ? (t.slaResolveDueAt.getTime() - t.createdAt.getTime()) / 3600000
          : 72;
        const pctRemaining = remaining / totalSlaHours;

        if (remaining <= 0) slaStatus = 'breached';
        else if (pctRemaining < 0.2) slaStatus = 'at_risk';
        else if (pctRemaining < 0.5) slaStatus = 'at_risk';
        else slaStatus = 'on_track';
      } else if (t.slaResolveMet === true) {
        slaStatus = 'met';
      } else if (t.slaResolveMet === false) {
        slaStatus = 'breached';
      }

      return { ...t, slaStatus, hoursUntilSla };
    });

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        reportedByTenant: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        reportedByUser: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        assignedTo: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
            technicianProfile: { select: { skills: true, hourlyRate: true } },
          },
        },
        escalatedTo: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        photos: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, url: true, photoType: true, caption: true, createdAt: true },
        },
        workOrders: {
          include: {
            assignedTo: {
              select: {
                id: true, email: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
            materials: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
        slaBreachEvents: { orderBy: { breachedAt: 'desc' } },
      },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');
    return ticket;
  }

  // ── Ticket Number ──────────────────────────

  private async generateTicketNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;

    const last = await prisma.maintenanceTicket.findFirst({
      where: { companyId, ticketNumber: { startsWith: prefix } },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.ticketNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── Create ─────────────────────────────────

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const ticketNumber = await this.generateTicketNumber(companyId);
    const priority = (dto.priority as string) || 'P3';

    // Resolve SLA deadlines
    const slaConfig = await slaService.getSlaConfig(
      companyId,
      dto.propertyId as string,
      dto.categoryId as string,
      priority,
    );

    const now = new Date();
    const workingOnly = slaConfig?.workingHoursOnly ?? false;
    const slaResponseDueAt = slaConfig
      ? addSlaHours(now, slaConfig.responseHours, workingOnly)
      : null;
    const slaResolveDueAt = slaConfig
      ? addSlaHours(now, slaConfig.resolutionHours, workingOnly)
      : null;

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        unitId: (dto.unitId as string) || null,
        ticketNumber,
        title: dto.title as string,
        description: (dto.description as string) || null,
        categoryId: dto.categoryId as string,
        priority,
        status: 'open',
        source: (dto.source as string) || 'staff',
        reportedByTenantId: (dto.reportedByTenantId as string) || null,
        reportedByUserId: userId,
        locationDetail: (dto.locationDetail as string) || null,
        isUrgent: (dto.isUrgent as boolean) || false,
        requiresAccess: dto.requiresAccess !== undefined ? (dto.requiresAccess as boolean) : true,
        estimatedCost: dto.estimatedCost ? Number(dto.estimatedCost) : null,
        slaResponseDueAt,
        slaResolveDueAt,
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    // Emit real-time event
    this.emitEvent('ticket:created', ticket);

    logger.info(`Maintenance ticket ${ticketNumber} created (${priority}) by user ${userId}`);

    // Notify maintenance supervisors / admins about the new ticket
    this.notifyTicketCreated(companyId, ticket).catch((err) =>
      logger.warn(`Notification failed for ticket ${ticketNumber}: ${err.message}`),
    );

    // Auto-assign P1/P2 tickets immediately (spec: emergency/urgent get instant assignment)
    if (priority === 'P1' || priority === 'P2') {
      try {
        const assigned = await this.autoAssign(ticket.id, companyId, userId);
        logger.info(`Auto-assigned ${priority} ticket ${ticketNumber} to technician`);
        return assigned;
      } catch (err: any) {
        // Don't fail ticket creation if no tech available — leave as open
        logger.warn(`Auto-assign failed for ${priority} ticket ${ticketNumber}: ${err.message}`);
      }
    }

    webhookTicketCreated(ticket);
    return ticket;
  }

  // ── Update ─────────────────────────────────

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.locationDetail !== undefined) data.locationDetail = dto.locationDetail;
    if (dto.isUrgent !== undefined) data.isUrgent = dto.isUrgent;
    if (dto.requiresAccess !== undefined) data.requiresAccess = dto.requiresAccess;
    if (dto.accessGranted !== undefined) data.accessGranted = dto.accessGranted;
    if (dto.estimatedCost !== undefined) data.estimatedCost = dto.estimatedCost;

    return prisma.maintenanceTicket.update({ where: { id }, data });
  }

  // ── Assign ─────────────────────────────────

  async assign(id: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');
    if (!['open', 'reopened'].includes(ticket.status)) {
      throw AppError.validation('Can only assign open or reopened tickets');
    }

    const techProfile = await prisma.technicianProfile.findUnique({
      where: { userId: dto.technicianId as string },
    });

    const scheduledStart = new Date(dto.scheduledStart as string);
    const estimatedHours = 2; // default
    const scheduledEnd = new Date(scheduledStart.getTime() + estimatedHours * 3600000);

    // Generate WO number
    const woNumber = await this.generateWoNumber(companyId);

    const [updatedTicket, workOrder] = await prisma.$transaction([
      prisma.maintenanceTicket.update({
        where: { id },
        data: {
          status: 'assigned',
          assignedToId: dto.technicianId as string,
          assignedAt: new Date(),
          firstResponseAt: ticket.firstResponseAt ?? new Date(),
          slaResponseMet: ticket.slaResponseDueAt
            ? new Date() <= ticket.slaResponseDueAt
            : null,
        },
      }),
      prisma.workOrder.create({
        data: {
          ticketId: id,
          companyId,
          propertyId: ticket.propertyId,
          woNumber,
          title: ticket.title,
          description: (dto.notes as string) || ticket.description,
          assignedToId: dto.technicianId as string,
          status: 'pending',
          scheduledStart,
          scheduledEnd,
          estimatedHours,
          laborRate: techProfile?.hourlyRate ?? null,
        },
      }),
    ]);

    this.emitEvent('ticket:assigned', { ticketId: id, technicianId: dto.technicianId, woId: workOrder.id });

    logger.info(`Ticket ${ticket.ticketNumber} assigned to tech ${dto.technicianId}, WO ${woNumber}`);

    // Notify the assigned technician
    this.notifyWorkOrderAssigned(companyId, ticket, woNumber, dto.technicianId as string, scheduledStart).catch((err) =>
      logger.warn(`Notification failed for WO ${woNumber}: ${err.message}`),
    );

    webhookTicketAssigned(id, ticket.ticketNumber, dto.technicianId as string, companyId);
    return this.findById(id, companyId);
  }

  // ── Auto Assign ────────────────────────────

  async autoAssign(id: string, companyId: string, userId: string) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { category: true },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');

    const requiredSkill = ticket.category.name.toLowerCase().replace(/\s+/g, '_');

    // Find available technicians for this property
    const techs = await prisma.technicianProfile.findMany({
      where: {
        companyId,
        isAvailable: true,
        OR: [
          { propertyId: ticket.propertyId },
          { propertyId: null },  // company-wide techs
        ],
      },
    });

    if (techs.length === 0) {
      throw AppError.validation('No available technicians found for this property');
    }

    // Score each tech: skill match (40%) + workload (40%) + recency (20%)
    const scored = await Promise.all(techs.map(async (tech) => {
      const skillMatch = tech.skills.includes(requiredSkill) ? 40 : 0;

      const openJobs = await prisma.workOrder.count({
        where: { assignedToId: tech.userId, status: { notIn: ['completed', 'cancelled'] } },
      });
      const workloadScore = Math.max(0, 40 - (openJobs / tech.maxConcurrentJobs) * 40);

      const lastJob = await prisma.workOrder.findFirst({
        where: { assignedToId: tech.userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const hoursSinceLast = lastJob
        ? (Date.now() - lastJob.createdAt.getTime()) / 3600000
        : 24;
      const recencyScore = Math.min(20, hoursSinceLast);

      return { userId: tech.userId, score: skillMatch + workloadScore + recencyScore };
    }));

    scored.sort((a, b) => b.score - a.score);
    const bestTech = scored[0];

    // Auto-assign with scheduled start = now + 1 hour
    const scheduledStart = new Date(Date.now() + 3600000);
    return this.assign(id, companyId, {
      technicianId: bestTech.userId,
      scheduledStart: scheduledStart.toISOString(),
    }, userId);
  }

  // ── Escalate ───────────────────────────────

  async escalate(id: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');

    const escalateToId = dto.escalateTo as string | undefined;

    // Transaction: update ticket + reassign open work orders to new escalation target
    const [updated] = await prisma.$transaction(async (tx) => {
      // 1. Update the ticket
      const updatedTicket = await tx.maintenanceTicket.update({
        where: { id },
        data: {
          escalationLevel: { increment: 1 },
          escalatedAt: new Date(),
          escalatedToId: escalateToId || null,
          // Reassign the ticket itself if an escalation target is provided
          ...(escalateToId ? { assignedToId: escalateToId, assignedAt: new Date() } : {}),
        },
      });

      // 2. Reassign all non-completed work orders to the new escalation target
      if (escalateToId) {
        const reassigned = await tx.workOrder.updateMany({
          where: {
            ticketId: id,
            status: { in: ['pending', 'accepted', 'in_progress', 'on_hold'] },
          },
          data: {
            assignedToId: escalateToId,
          },
        });

        if (reassigned.count > 0) {
          logger.info(`Reassigned ${reassigned.count} work order(s) to ${escalateToId} on escalation`);
        }
      }

      return [updatedTicket];
    });

    this.emitEvent('ticket:escalated', { ticketId: id, escalatedTo: dto.escalateTo });

    logger.info(`Ticket ${ticket.ticketNumber} escalated to level ${updated.escalationLevel}`);

    // Notify the escalation target
    if (escalateToId) {
      notificationService.send({
        templateCode: 'ticket_escalated',
        companyId,
        recipientIds: [escalateToId],
        channels: ['in_app', 'email', 'push'],
        variables: {
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          priority: ticket.priority,
          escalationLevel: updated.escalationLevel,
          reason: (dto.reason as string) || 'Escalated by supervisor',
        },
        entityType: 'maintenance_ticket',
        entityId: id,
      }).catch((err) => logger.warn(`Escalation notification failed: ${err.message}`));
    }

    return this.findById(id, companyId);
  }

  // ── Cancel ─────────────────────────────────

  async cancel(id: string, companyId: string, reason: string, userId: string) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');
    if (['completed', 'closed', 'cancelled'].includes(ticket.status)) {
      throw AppError.validation('Cannot cancel a completed/closed/cancelled ticket');
    }

    // Cancel any open work orders
    await prisma.workOrder.updateMany({
      where: { ticketId: id, status: { notIn: ['completed', 'cancelled'] } },
      data: { status: 'cancelled', cancelledReason: reason },
    });

    return prisma.maintenanceTicket.update({
      where: { id },
      data: {
        status: 'cancelled',
        resolutionNotes: reason,
      },
    });
  }

  // ── Rate ───────────────────────────────────

  async rate(id: string, companyId: string, dto: Record<string, unknown>) {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!ticket) throw AppError.notFound('Maintenance ticket');
    if (ticket.status !== 'completed') {
      throw AppError.validation('Can only rate completed tickets');
    }

    const updated = await prisma.maintenanceTicket.update({
      where: { id },
      data: {
        rating: dto.rating as number,
        ratingComment: (dto.comment as string) || null,
        ratedAt: new Date(),
        status: 'closed',
      },
    });

    webhookTicketRated(id, dto.rating as number, companyId);
    return updated;
  }

  // ── Stats ──────────────────────────────────

  async getStats(companyId: string, filters: { propertyId?: string; from?: string; to?: string }) {
    const where: any = { companyId, deletedAt: null };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [total, open, assigned, inProgress, pendingParts, completed, cancelled, closed] =
      await Promise.all([
        prisma.maintenanceTicket.count({ where }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'open' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'assigned' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'in_progress' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'pending_parts' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'completed' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'cancelled' } }),
        prisma.maintenanceTicket.count({ where: { ...where, status: 'closed' } }),
      ]);

    // SLA compliance
    const slaResponseMet = await prisma.maintenanceTicket.count({
      where: { ...where, slaResponseMet: true },
    });
    const slaResponseTotal = await prisma.maintenanceTicket.count({
      where: { ...where, slaResponseMet: { not: null } },
    });
    const slaResolveMet = await prisma.maintenanceTicket.count({
      where: { ...where, slaResolveMet: true },
    });
    const slaResolveTotal = await prisma.maintenanceTicket.count({
      where: { ...where, slaResolveMet: { not: null } },
    });

    const totalBreaches = await prisma.slaBreachEvent.count({
      where: { companyId, ...(filters.propertyId ? { ticket: { propertyId: filters.propertyId } } : {}) },
    });

    // By priority
    const byPriority: Record<string, number> = {};
    for (const p of ['P1', 'P2', 'P3', 'P4']) {
      byPriority[p] = await prisma.maintenanceTicket.count({ where: { ...where, priority: p } });
    }

    // By category (top 10)
    const categoryGroups = await prisma.maintenanceTicket.groupBy({
      by: ['categoryId'],
      where,
      _count: true,
      orderBy: { _count: { categoryId: 'desc' } },
      take: 10,
    });
    const categoryIds = categoryGroups.map(g => g.categoryId);
    const categories = await prisma.maintenanceCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const byCategory = categoryGroups.map(g => ({
      category: categoryMap.get(g.categoryId) || 'Unknown',
      count: g._count,
      pct: total > 0 ? Math.round((g._count / total) * 1000) / 10 : 0,
    }));

    // Avg resolution hours (from resolved tickets)
    const resolvedTickets = await prisma.maintenanceTicket.findMany({
      where: { ...where, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });
    const avgResolutionHours = resolvedTickets.length > 0
      ? Math.round(resolvedTickets.reduce((sum, t) =>
          sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000, 0,
        ) / resolvedTickets.length * 10) / 10
      : 0;

    // Avg rating
    const ratingAgg = await prisma.maintenanceTicket.aggregate({
      where: { ...where, rating: { not: null } },
      _avg: { rating: true },
    });

    // Total cost
    const costAgg = await prisma.maintenanceTicket.aggregate({
      where: { ...where, actualCost: { not: null } },
      _sum: { actualCost: true },
    });

    // Overdue count
    const overdue = await prisma.maintenanceTicket.count({
      where: {
        ...where,
        slaResolveDueAt: { lt: new Date() },
        status: { notIn: ['completed', 'closed', 'cancelled'] },
      },
    });

    return {
      ticketSummary: { total, open, assigned, inProgress, pendingParts, completed, cancelled, closed, overdue },
      slaCompliance: {
        responseRate: slaResponseTotal > 0 ? Math.round((slaResponseMet / slaResponseTotal) * 1000) / 10 : 100,
        resolutionRate: slaResolveTotal > 0 ? Math.round((slaResolveMet / slaResolveTotal) * 1000) / 10 : 100,
        totalBreaches,
      },
      avgResolutionHours,
      avgRating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      byPriority,
      byCategory,
      totalCost: Number(costAgg._sum.actualCost || 0),
    };
  }

  // ── SLA Report ─────────────────────────────

  async getSlaReport(companyId: string, filters: {
    propertyId?: string; from?: string; to?: string;
    groupBy?: 'priority' | 'property' | 'category' | 'technician';
  }) {
    const where: any = { companyId, deletedAt: null };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    // Get all tickets with SLA data
    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      select: {
        id: true, priority: true,
        slaResponseMet: true, slaResolveMet: true,
        createdAt: true, resolvedAt: true,
        assignedToId: true,
        categoryId: true, propertyId: true,
        property: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        slaBreachEvents: { select: { breachType: true } },
      },
    });

    // Get breach counts
    const breachWhere: any = { companyId };
    if (filters.propertyId) breachWhere.ticket = { propertyId: filters.propertyId };

    // Determine grouping key
    type GroupKey = string;
    const getGroupKey = (t: typeof tickets[0]): GroupKey => {
      switch (filters.groupBy) {
        case 'priority': return t.priority;
        case 'property': return t.property?.name || 'Unknown';
        case 'category': return t.category?.name || 'Unknown';
        case 'technician': {
          if (!t.assignedTo) return 'Unassigned';
          return t.assignedTo.profile
            ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}`
            : t.assignedToId || 'Unknown';
        }
        default: return 'All';
      }
    };

    // Group tickets
    const groups = new Map<string, typeof tickets>();
    for (const t of tickets) {
      const key = getGroupKey(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    // Calculate per-group stats
    const report = Array.from(groups.entries()).map(([group, tix]) => {
      const total = tix.length;
      const respMet = tix.filter(t => t.slaResponseMet === true).length;
      const respTotal = tix.filter(t => t.slaResponseMet !== null).length;
      const resMet = tix.filter(t => t.slaResolveMet === true).length;
      const resTotal = tix.filter(t => t.slaResolveMet !== null).length;
      const breaches = tix.reduce((sum, t) => sum + t.slaBreachEvents.length, 0);

      const resolved = tix.filter(t => t.resolvedAt);
      const avgResHours = resolved.length > 0
        ? Math.round(resolved.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000, 0) / resolved.length * 10) / 10
        : null;

      return {
        group,
        totalTickets: total,
        slaResponse: {
          met: respMet,
          total: respTotal,
          rate: respTotal > 0 ? Math.round((respMet / respTotal) * 1000) / 10 : 100,
        },
        slaResolution: {
          met: resMet,
          total: resTotal,
          rate: resTotal > 0 ? Math.round((resMet / resTotal) * 1000) / 10 : 100,
        },
        breaches,
        avgResolutionHours: avgResHours,
      };
    });

    // Sort by worst resolution rate first
    report.sort((a, b) => a.slaResolution.rate - b.slaResolution.rate);

    // Overall summary
    const overallRespMet = tickets.filter(t => t.slaResponseMet === true).length;
    const overallRespTotal = tickets.filter(t => t.slaResponseMet !== null).length;
    const overallResMet = tickets.filter(t => t.slaResolveMet === true).length;
    const overallResTotal = tickets.filter(t => t.slaResolveMet !== null).length;

    return {
      groupBy: filters.groupBy || 'all',
      totalTickets: tickets.length,
      overall: {
        responseRate: overallRespTotal > 0 ? Math.round((overallRespMet / overallRespTotal) * 1000) / 10 : 100,
        resolutionRate: overallResTotal > 0 ? Math.round((overallResMet / overallResTotal) * 1000) / 10 : 100,
        totalBreaches: tickets.reduce((s, t) => s + t.slaBreachEvents.length, 0),
      },
      groups: report,
    };
  }

  // ── Helpers ─────────────────────────────────

  private async generateWoNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WO-${year}-`;
    const last = await prisma.workOrder.findFirst({
      where: { companyId, woNumber: { startsWith: prefix } },
      orderBy: { woNumber: 'desc' },
      select: { woNumber: true },
    });
    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.woNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  private emitEvent(event: string, data: unknown) {
    try {
      if (io) io.emit(event, data);
    } catch {
      // Socket not initialized yet — ignore
    }
  }

  // ── Notification Helpers ───────────────────

  /**
   * Notify maintenance supervisors / admins about a new ticket.
   * Finds users with admin roles in the same company as recipients.
   */
  private async notifyTicketCreated(companyId: string, ticket: {
    ticketNumber: string; title: string; priority: string;
    property?: { name: string } | null; unit?: { unitNumber: string } | null;
  }) {
    // Find admin/manager users in this company to notify
    const admins = await prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        userRoles: {
          some: {
            role: { name: { in: ['Admin', 'Super Admin', 'Property Manager'] } },
          },
        },
      },
      select: { id: true },
      take: 10,  // cap to avoid spam
    });

    if (admins.length === 0) return;

    await notificationService.send({
      templateCode: 'ticket_created',
      companyId,
      recipientIds: admins.map((a) => a.id),
      channels: ['in_app', 'push'],
      variables: {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        priority: ticket.priority,
        propertyName: ticket.property?.name || 'N/A',
        unitNumber: ticket.unit?.unitNumber || 'N/A',
      },
      entityType: 'maintenance_ticket',
      entityId: ticket.ticketNumber,
    });
  }

  /**
   * Notify the assigned technician about a new work order.
   */
  private async notifyWorkOrderAssigned(
    companyId: string,
    ticket: { ticketNumber: string; title: string; priority: string; propertyId: string },
    woNumber: string,
    technicianId: string,
    scheduledStart: Date,
  ) {
    // Get property name for the notification
    const property = await prisma.property.findUnique({
      where: { id: ticket.propertyId },
      select: { name: true },
    });

    await notificationService.send({
      templateCode: 'work_order_assigned',
      companyId,
      recipientIds: [technicianId],
      channels: ['in_app', 'push', 'email'],
      variables: {
        woNumber,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        priority: ticket.priority,
        propertyName: property?.name || 'N/A',
        scheduledStart: scheduledStart.toLocaleString(),
      },
      entityType: 'work_order',
      entityId: woNumber,
    });
  }
}

export const ticketsService = new TicketsService();
