import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { facilityService } from '../facility/facility.service';

export class WorkOrdersService {
  // ── Query ───────────────────────────────────

  async findAll(companyId: string, filters: {
    assignedTo?: string; status?: string; propertyId?: string;
    scheduledFrom?: string; scheduledTo?: string;
    page?: number; limit?: number;
  }) {
    const { assignedTo, status, propertyId, scheduledFrom, scheduledTo, page = 1, limit = 20 } = filters;
    const where: any = { companyId };

    if (assignedTo) where.assignedToId = assignedTo;
    if (status) where.status = status;
    if (propertyId) where.propertyId = propertyId;
    if (scheduledFrom || scheduledTo) {
      where.scheduledStart = {};
      if (scheduledFrom) where.scheduledStart.gte = new Date(scheduledFrom);
      if (scheduledTo) where.scheduledStart.lte = new Date(scheduledTo);
    }

    const [data, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true, ticketNumber: true, priority: true, status: true,
              category: { select: { id: true, name: true, icon: true } },
              unit: { select: { id: true, unitNumber: true } },
              property: { select: { id: true, name: true } },
            },
          },
          assignedTo: {
            select: {
              id: true, email: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          _count: { select: { materials: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workOrder.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const wo = await prisma.workOrder.findFirst({
      where: { id, companyId },
      include: {
        ticket: {
          select: {
            id: true, ticketNumber: true, title: true, priority: true, status: true,
            locationDetail: true,
            category: { select: { id: true, name: true, icon: true } },
            unit: { select: { id: true, unitNumber: true } },
            property: { select: { id: true, name: true } },
          },
        },
        assignedTo: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
            technicianProfile: { select: { skills: true, hourlyRate: true } },
          },
        },
        materials: { orderBy: { createdAt: 'asc' } },
        photos: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!wo) throw AppError.notFound('Work order');
    return wo;
  }

  // ── Update ─────────────────────────────────

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const wo = await prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!wo) throw AppError.notFound('Work order');

    const data: any = {};
    if (dto.scheduledStart !== undefined) data.scheduledStart = new Date(dto.scheduledStart as string);
    if (dto.scheduledEnd !== undefined) data.scheduledEnd = new Date(dto.scheduledEnd as string);
    if (dto.estimatedHours !== undefined) data.estimatedHours = dto.estimatedHours;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.checklist !== undefined) data.checklist = dto.checklist;

    return prisma.workOrder.update({ where: { id }, data });
  }

  // ── Start ──────────────────────────────────

  async start(id: string, companyId: string, notes: string | undefined, userId: string) {
    const wo = await prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!wo) throw AppError.notFound('Work order');
    if (!['pending', 'accepted'].includes(wo.status)) {
      throw AppError.validation('Can only start pending/accepted work orders');
    }
    if (wo.assignedToId !== userId) {
      throw AppError.forbidden('Only the assigned technician can start this work order');
    }

    const [updatedWo] = await prisma.$transaction([
      prisma.workOrder.update({
        where: { id },
        data: {
          status: 'in_progress',
          actualStart: new Date(),
          completionNotes: notes || null,
        },
      }),
      prisma.maintenanceTicket.update({
        where: { id: wo.ticketId },
        data: { status: 'in_progress' },
      }),
    ]);

    return updatedWo;
  }

  // ── Complete ───────────────────────────────

  async complete(id: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const wo = await prisma.workOrder.findFirst({
      where: { id, companyId },
      include: { ticket: true },
    });
    if (!wo) throw AppError.notFound('Work order');
    if (wo.status !== 'in_progress') {
      throw AppError.validation('Can only complete in-progress work orders');
    }

    // Calculate labor cost
    const actualHours = dto.actualHours as number | undefined;
    const hours = actualHours ?? (wo.actualStart
      ? (Date.now() - wo.actualStart.getTime()) / 3600000
      : 0);

    const techProfile = await prisma.technicianProfile.findUnique({
      where: { userId: wo.assignedToId },
    });
    const laborCost = Math.round(hours * Number(techProfile?.hourlyRate ?? 0) * 100) / 100;

    // Create material entries if provided
    const materialsUsed = (dto.materialsUsed as Array<{
      itemName: string; quantity: number; unitCost: number;
      inventoryItemId?: string; issuedFromStock?: boolean;
    }>) || [];

    let materialsCost = Number(wo.materialsCost);

    const materialEntries = materialsUsed.map((m) => {
      const total = Math.round(m.quantity * m.unitCost * 100) / 100;
      materialsCost += total;
      return {
        companyId,
        workOrderId: id,
        itemName: m.itemName,
        quantity: m.quantity,
        unitCost: m.unitCost,
        totalCost: total,
        inventoryItemId: m.inventoryItemId || null,
        issuedFromStock: m.issuedFromStock ?? true,
      };
    });

    const totalCost = laborCost + materialsCost;

    await prisma.$transaction([
      // Update work order
      prisma.workOrder.update({
        where: { id },
        data: {
          status: 'completed',
          actualEnd: new Date(),
          actualHours: Math.round(hours * 100) / 100,
          completionNotes: (dto.completionNotes as string) || null,
          checklist: (dto.checklist ?? wo.checklist) || undefined,
          laborCost,
          materialsCost,
          totalCost,
        },
      }),
      // Create material entries
      ...(materialEntries.length > 0
        ? [prisma.workOrderMaterial.createMany({ data: materialEntries })]
        : []),
      // Update ticket
      prisma.maintenanceTicket.update({
        where: { id: wo.ticketId },
        data: {
          status: 'completed',
          resolvedAt: new Date(),
          resolvedById: userId,
          actualCost: totalCost,
          slaResolveMet: wo.ticket.slaResolveDueAt
            ? new Date() <= wo.ticket.slaResolveDueAt
            : null,
        },
      }),
    ]);

    logger.info(`Work order ${wo.woNumber} completed. Cost: ${totalCost}`);

    // Auto-create CAM cost entry if totalCost > 0 (Gap 9)
    if (totalCost > 0 && wo.ticket?.propertyId) {
      facilityService.autoCreateCamFromWorkOrder({
        companyId, propertyId: wo.ticket.propertyId,
        totalCost, woNumber: wo.woNumber, ticketTitle: wo.ticket.title,
      }).catch((err: any) => logger.warn(`Auto-CAM creation failed for WO ${wo.woNumber}: ${err.message}`));
    }

    return this.findById(id, companyId);
  }

  // ── On Hold ────────────────────────────────

  async onHold(id: string, companyId: string, reason: string, userId: string) {
    const wo = await prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!wo) throw AppError.notFound('Work order');
    if (wo.status !== 'in_progress') {
      throw AppError.validation('Can only put in-progress work orders on hold');
    }

    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id },
        data: { status: 'on_hold', onHoldReason: reason },
      }),
      prisma.maintenanceTicket.update({
        where: { id: wo.ticketId },
        data: { status: 'pending_parts' },
      }),
    ]);

    return this.findById(id, companyId);
  }

  // ── Resume (from on-hold) ──────────────────

  async resume(id: string, companyId: string, userId: string) {
    const wo = await prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!wo) throw AppError.notFound('Work order');
    if (wo.status !== 'on_hold') {
      throw AppError.validation('Can only resume on-hold work orders');
    }

    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id },
        data: { status: 'in_progress', onHoldReason: null },
      }),
      prisma.maintenanceTicket.update({
        where: { id: wo.ticketId },
        data: { status: 'in_progress' },
      }),
    ]);

    return this.findById(id, companyId);
  }
}

export const workOrdersService = new WorkOrdersService();
