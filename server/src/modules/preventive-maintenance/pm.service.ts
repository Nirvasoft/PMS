import { prisma, setTenantContext } from '../../common/database';
import { AppError } from '../../common/errors';
import { Prisma } from '@prisma/client';
import { logger } from '../../common/logger';

// ── Helpers ─────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── PM Service ──────────────────────────

class PmService {
  // ── Schedules CRUD ─────────────────────

  async findAllSchedules(companyId: string, params: {
    propertyId?: string;
    status?: string;
    frequencyType?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    await setTenantContext(companyId);

    const where: Prisma.PmScheduleWhereInput = {
      companyId,
      ...(params.propertyId && { propertyId: params.propertyId }),
      ...(params.status && { status: params.status }),
      ...(params.frequencyType && { frequencyType: params.frequencyType }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' as const } },
          { description: { contains: params.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.pmSchedule.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          asset: { select: { id: true, assetNumber: true, name: true, assetType: true, location: true } },
          assignedTo: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { nextDueDate: 'asc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.pmSchedule.count({ where }),
    ]);

    const today = new Date();
    const enriched = data.map((s) => ({
      ...s,
      daysUntilDue: Math.ceil(
        (new Date(s.nextDueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    return {
      data: enriched,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async findScheduleById(id: string, companyId: string) {
    await setTenantContext(companyId);

    const schedule = await prisma.pmSchedule.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        asset: { select: { id: true, assetNumber: true, name: true, assetType: true, location: true } },
        assignedTo: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        createdBy: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!schedule) throw AppError.notFound('PM Schedule');
    return schedule;
  }

  async createSchedule(companyId: string, data: any, createdById: string) {
    await setTenantContext(companyId);

    return prisma.pmSchedule.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        assetId: data.assetId || null,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        frequencyType: data.frequencyType,
        frequencyValue: data.frequencyValue ?? 1,
        customDays: data.customDays,
        estimatedHours: data.estimatedHours ?? 1,
        assignedToId: data.assignedToId,
        assignedRole: data.assignedRole,
        nextDueDate: new Date(data.nextDueDate),
        advanceDays: data.advanceDays ?? 7,
        priority: data.priority || 'P3',
        notes: data.notes,
        checklistTemplate: data.checklistTemplate || [],
        createdById,
      },
      include: {
        property: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async updateSchedule(id: string, companyId: string, data: any) {
    await setTenantContext(companyId);

    const existing = await prisma.pmSchedule.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('PM Schedule');

    const updateData: any = {};
    const fields = [
      'name', 'description', 'categoryId', 'assetId', 'frequencyType', 'frequencyValue',
      'customDays', 'estimatedHours', 'assignedToId', 'assignedRole',
      'advanceDays', 'priority', 'notes', 'checklistTemplate',
    ];
    for (const f of fields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.nextDueDate) updateData.nextDueDate = new Date(data.nextDueDate);

    return prisma.pmSchedule.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async pauseSchedule(id: string, companyId: string) {
    await setTenantContext(companyId);
    const s = await prisma.pmSchedule.findFirst({ where: { id, companyId } });
    if (!s) throw AppError.notFound('PM Schedule');
    if (s.status !== 'active') throw AppError.validation('Schedule is not active');
    return prisma.pmSchedule.update({ where: { id }, data: { status: 'paused' } });
  }

  async resumeSchedule(id: string, companyId: string) {
    await setTenantContext(companyId);
    const s = await prisma.pmSchedule.findFirst({ where: { id, companyId } });
    if (!s) throw AppError.notFound('PM Schedule');
    if (s.status !== 'paused') throw AppError.validation('Schedule is not paused');
    return prisma.pmSchedule.update({ where: { id }, data: { status: 'active' } });
  }

  // ── Work Order Generation ─────────────

  async generateWorkOrder(scheduleId: string, companyId: string) {
    await setTenantContext(companyId);

    const schedule = await prisma.pmSchedule.findFirst({
      where: { id: scheduleId, companyId },
      include: { property: true },
    });
    if (!schedule) throw AppError.notFound('PM Schedule');

    // Idempotency: check if WO already exists for this due date
    const existing = await prisma.pmWorkOrder.findFirst({
      where: {
        scheduleId,
        dueDate: schedule.nextDueDate,
        status: { notIn: ['skipped'] },
      },
    });
    if (existing) throw AppError.validation('Work order already exists for this due date');

    // Create maintenance ticket with source='preventive'
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        companyId,
        propertyId: schedule.propertyId,
        title: `[PM] ${schedule.name}`,
        description: schedule.description || `Scheduled preventive maintenance: ${schedule.name}`,
        categoryId: schedule.categoryId!,
        priority: schedule.priority,
        source: 'preventive',
        status: 'open',
        ticketNumber: `PM-${Date.now().toString(36).toUpperCase()}`,
      },
    });

    // Assign to technician if configured
    if (schedule.assignedToId) {
      await prisma.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { assignedToId: schedule.assignedToId, status: 'assigned' },
      });
    }

    // Create PM work order
    const pmWo = await prisma.pmWorkOrder.create({
      data: {
        companyId,
        scheduleId,
        ticketId: ticket.id,
        dueDate: schedule.nextDueDate,
        status: 'scheduled',
      },
      include: {
        schedule: { select: { id: true, name: true } },
        ticket: { select: { id: true, ticketNumber: true } },
      },
    });

    return pmWo;
  }

  // ── Complete PM Work Order ────────────

  async completePmWorkOrder(id: string, companyId: string, data: any, userId: string) {
    await setTenantContext(companyId);

    const pmWo = await prisma.pmWorkOrder.findFirst({
      where: { id, companyId },
      include: { schedule: true },
    });
    if (!pmWo) throw AppError.notFound('PM Work Order');
    if (pmWo.status === 'completed') throw AppError.validation('Already completed');

    const nextDueDate = this.computeNextDueDate(pmWo.schedule, new Date(pmWo.dueDate));

    // Update PM work order
    const updated = await prisma.pmWorkOrder.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedById: userId,
        checklistResults: data.checklistResults || [],
        findings: data.findings,
        nextDueDate: new Date(nextDueDate),
      },
    });

    // Advance schedule's next due date
    await prisma.pmSchedule.update({
      where: { id: pmWo.scheduleId },
      data: {
        nextDueDate: new Date(nextDueDate),
        lastPerformedAt: new Date(),
      },
    });

    // Close the linked ticket
    if (pmWo.ticketId) {
      await prisma.maintenanceTicket.update({
        where: { id: pmWo.ticketId },
        data: { status: 'completed', resolvedById: userId, resolvedAt: new Date() },
      });
    }

    // If findings indicate issue, auto-create reactive ticket
    if (data.findings && (data.severity === 'requires_repair' || data.severity === 'critical')) {
      const priority = data.severity === 'critical' ? 'P1' : 'P2';
      await prisma.maintenanceTicket.create({
        data: {
          companyId,
          propertyId: pmWo.schedule.propertyId,
          title: `[Follow-up] ${pmWo.schedule.name} — Repair Required`,
          description: data.findings,
          categoryId: pmWo.schedule.categoryId!,
          priority,
          source: 'inspection',
          status: 'open',
          ticketNumber: `FU-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      logger.info(`Auto-created follow-up ticket for PM WO ${id} (severity: ${data.severity})`);
    }

    return updated;
  }

  // ── History & Upcoming ─────────────────

  async getScheduleHistory(scheduleId: string, companyId: string) {
    await setTenantContext(companyId);

    const schedule = await prisma.pmSchedule.findFirst({ where: { id: scheduleId, companyId } });
    if (!schedule) throw AppError.notFound('PM Schedule');

    return prisma.pmWorkOrder.findMany({
      where: { scheduleId, companyId },
      include: {
        completedBy: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        ticket: { select: { id: true, ticketNumber: true, status: true } },
      },
      orderBy: { dueDate: 'desc' },
    });
  }

  async findAllWorkOrders(companyId: string, params: {
    scheduleId?: string;
    status?: string;
    propertyId?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    await setTenantContext(companyId);

    const where: Prisma.PmWorkOrderWhereInput = {
      companyId,
      ...(params.scheduleId && { scheduleId: params.scheduleId }),
      ...(params.status && { status: params.status }),
      ...(params.propertyId && { schedule: { propertyId: params.propertyId } }),
      ...(params.from && { dueDate: { gte: new Date(params.from) } }),
      ...(params.to && { dueDate: { ...((params.from ? { gte: new Date(params.from) } : {})), lte: new Date(params.to) } }),
    };

    const [data, total] = await Promise.all([
      prisma.pmWorkOrder.findMany({
        where,
        include: {
          schedule: { select: { id: true, name: true, priority: true, frequencyType: true, property: { select: { id: true, name: true } } } },
          completedBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          ticket: { select: { id: true, ticketNumber: true, status: true } },
        },
        orderBy: { dueDate: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.pmWorkOrder.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async findWorkOrderById(id: string, companyId: string) {
    await setTenantContext(companyId);
    const wo = await prisma.pmWorkOrder.findFirst({
      where: { id, companyId },
      include: {
        schedule: {
          include: {
            property: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        completedBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        ticket: { select: { id: true, ticketNumber: true, status: true } },
      },
    });
    if (!wo) throw AppError.notFound('PM Work Order');
    return wo;
  }

  async getUpcoming(companyId: string, params: { propertyId?: string; days: number }) {
    await setTenantContext(companyId);
    const cutoff = addDays(new Date(), params.days || 30);

    return prisma.pmSchedule.findMany({
      where: {
        companyId,
        status: 'active',
        nextDueDate: { lte: cutoff },
        ...(params.propertyId && { propertyId: params.propertyId }),
      },
      include: {
        property: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assignedTo: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  // ── Skip PM Work Order ────────────────

  async skipPmWorkOrder(id: string, companyId: string, reason: string, userId: string) {
    await setTenantContext(companyId);

    const pmWo = await prisma.pmWorkOrder.findFirst({
      where: { id, companyId },
      include: { schedule: true },
    });
    if (!pmWo) throw AppError.notFound('PM Work Order');
    if (pmWo.status === 'completed') throw AppError.validation('Cannot skip a completed work order');
    if (pmWo.status === 'skipped') throw AppError.validation('Already skipped');

    const nextDueDate = this.computeNextDueDate(pmWo.schedule, new Date(pmWo.dueDate));

    // Skip the WO and advance the schedule
    const updated = await prisma.pmWorkOrder.update({
      where: { id },
      data: {
        status: 'skipped',
        findings: reason || 'Skipped by user',
        completedById: userId,
        completedAt: new Date(),
        nextDueDate: new Date(nextDueDate),
      },
    });

    await prisma.pmSchedule.update({
      where: { id: pmWo.scheduleId },
      data: { nextDueDate: new Date(nextDueDate) },
    });

    // Close the linked ticket if exists
    if (pmWo.ticketId) {
      await prisma.maintenanceTicket.update({
        where: { id: pmWo.ticketId },
        data: { status: 'cancelled', resolutionNotes: reason || 'PM work order skipped' },
      }).catch(() => {}); // ignore if ticket doesn't exist
    }

    logger.info(`PM WO ${id} skipped. Next due: ${nextDueDate}`);
    return updated;
  }

  // ── Asset Service History ─────────────

  async getAssetServiceHistory(assetId: string, companyId: string) {
    await setTenantContext(companyId);

    // Get all PM work orders for schedules linked to this asset
    const pmHistory = await prisma.pmWorkOrder.findMany({
      where: {
        companyId,
        status: { in: ['completed', 'skipped'] },
        schedule: { assetId },
      },
      select: {
        id: true, dueDate: true, status: true, completedAt: true, findings: true,
        checklistResults: true,
        schedule: { select: { id: true, name: true, frequencyType: true } },
        completedBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { dueDate: 'desc' },
      take: 50,
    });

    return pmHistory.map(wo => ({
      id: wo.id,
      type: 'preventive' as const,
      scheduleName: wo.schedule.name,
      scheduleId: wo.schedule.id,
      frequencyType: wo.schedule.frequencyType,
      dueDate: wo.dueDate,
      completedAt: wo.completedAt,
      status: wo.status,
      findings: wo.findings,
      technician: wo.completedBy?.profile
        ? `${wo.completedBy.profile.firstName} ${wo.completedBy.profile.lastName}`
        : null,
    }));
  }

  // ── Frequency Calculator ──────────────

  private computeNextDueDate(schedule: { frequencyType: string; frequencyValue: number; customDays: number | null }, currentDue: Date): string {
    const base = new Date(currentDue);
    switch (schedule.frequencyType) {
      case 'daily':        return toDateString(addDays(base, schedule.frequencyValue ?? 1));
      case 'weekly':       return toDateString(addDays(base, (schedule.frequencyValue ?? 1) * 7));
      case 'monthly':      return toDateString(addMonths(base, schedule.frequencyValue ?? 1));
      case 'quarterly':    return toDateString(addMonths(base, 3));
      case 'semi_annual':  return toDateString(addMonths(base, 6));
      case 'annual':       return toDateString(addMonths(base, 12));
      case 'custom_days':  return toDateString(addDays(base, schedule.customDays ?? 30));
      default:             return toDateString(addMonths(base, 1));
    }
  }
}

export const pmService = new PmService();
