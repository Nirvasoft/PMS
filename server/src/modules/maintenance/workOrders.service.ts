import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { facilityService } from '../facility/facility.service';
import { glService } from '../gl/gl.service';
import { emitToCompany } from '../../common/socket';

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

    emitToCompany(companyId, 'ticket:updated', {
      ticketId: wo.ticketId, status: 'in_progress', woId: id, woStatus: 'in_progress',
    });

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

    emitToCompany(companyId, 'ticket:completed', {
      ticketId: wo.ticketId, status: 'completed', woId: id, woStatus: 'completed',
      totalCost,
    });

    // Auto-post GL journal when totalCost > 0
    // Dr: 5100 Maintenance & Repairs (expense)
    // Cr: 2300 Accrued Expenses (liability) — until matched to AP invoice
    if (totalCost > 0) {
      this.postGlJournal(companyId, userId, wo.woNumber, wo.ticketId, wo.ticket.title, totalCost)
        .catch((err: any) => logger.warn(`GL posting failed for WO ${wo.woNumber}: ${err.message}`));
    }

    // Auto-create CAM cost entry if totalCost > 0
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

    emitToCompany(companyId, 'ticket:updated', {
      ticketId: wo.ticketId, status: 'pending_parts', woId: id, woStatus: 'on_hold',
    });

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

    emitToCompany(companyId, 'ticket:updated', {
      ticketId: wo.ticketId, status: 'in_progress', woId: id, woStatus: 'in_progress',
    });

    return this.findById(id, companyId);
  }

  // ── GL Journal Posting ─────────────────────

  /**
   * Post a GL journal entry for a completed work order.
   * Dr: 5100 Maintenance & Repairs (expense)
   * Cr: 2300 Accrued Expenses (liability)
   * Then auto-posts the entry and marks ticket.gl_posted = true.
   */
  private async postGlJournal(
    companyId: string, userId: string,
    woNumber: string, ticketId: string, ticketTitle: string,
    totalCost: number,
  ) {
    try {
      const je = await glService.createJournalEntry(companyId, userId, {
        entryDate: new Date().toISOString(),
        entryType: 'auto',
        description: `Maintenance cost — ${woNumber}: ${ticketTitle}`,
        referenceType: 'work_order',
        referenceId: ticketId,
        lines: [
          { accountCode: '5100', debit: totalCost, credit: 0, description: `Labor + materials — ${woNumber}` },
          { accountCode: '2300', debit: 0, credit: totalCost, description: `Accrued payable — ${woNumber}` },
        ],
      });

      // Auto-post the journal entry
      await glService.postJournalEntry(je.id, companyId, userId);

      // Mark ticket as GL-posted
      await prisma.maintenanceTicket.update({
        where: { id: ticketId },
        data: { glPosted: true },
      });

      logger.info(`GL journal ${je.journalNumber} posted for WO ${woNumber} (${totalCost})`);
    } catch (err: any) {
      logger.error(`GL journal posting failed for WO ${woNumber}: ${err.message}`);
      // Don't throw — GL posting failure should not block WO completion
    }
  }
}

export const workOrdersService = new WorkOrdersService();
