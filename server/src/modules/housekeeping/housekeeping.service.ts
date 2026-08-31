import type { PrismaClient } from '@prisma/client';

export function createHousekeepingService({ prisma }: { prisma: PrismaClient }) {
  // ── Zones ─────────────────────────────
  async function listZones(companyId: string, propertyId?: string) {
    return prisma.housekeepingZone.findMany({
      where: { companyId, ...(propertyId && { propertyId }), isActive: true },
      include: { property: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async function createZone(companyId: string, data: any) {
    return prisma.housekeepingZone.create({ data: { ...data, companyId } });
  }

  // ── Schedules ─────────────────────────
  async function listSchedules(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;
    if (params.status) where.status = params.status;
    return prisma.cleaningSchedule.findMany({
      where,
      include: {
        zone: { select: { id: true, name: true, zoneType: true } },
        property: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async function createSchedule(companyId: string, data: any) {
    return prisma.cleaningSchedule.create({
      data: { ...data, companyId },
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  // ── Tasks ─────────────────────────────
  async function listTasks(companyId: string, params: any) {
    const { propertyId, date, assignedTo, status, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (date) where.taskDate = new Date(date);
    if (assignedTo) where.assignedToId = assignedTo;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.cleaningTask.findMany({
        where,
        include: {
          zone: { select: { id: true, name: true, zoneType: true, floor: true } },
          property: { select: { id: true, name: true } },
          schedule: { select: { id: true, name: true, cleaningType: true, checklist: true } },
          assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: [{ scheduledTime: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cleaningTask.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async function startTask(companyId: string, taskId: string) {
    return prisma.cleaningTask.update({
      where: { id: taskId },
      data: { status: 'in_progress', startedAt: new Date() },
    });
  }

  async function completeTask(companyId: string, taskId: string, data: any) {
    return prisma.cleaningTask.update({
      where: { id: taskId },
      data: {
        status: 'completed', completedAt: new Date(),
        checklistResults: data.checklistResults ?? [],
        notes: data.notes, qualityScore: data.qualityScore,
        photos: data.photos ?? [],
      },
    });
  }

  // ── Inspections ───────────────────────
  async function listInspections(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;
    return prisma.housekeepingInspection.findMany({
      where,
      include: {
        zone: { select: { id: true, name: true } },
        property: { select: { id: true, name: true } },
        inspectedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { inspectionDate: 'desc' },
      take: 50,
    });
  }

  async function createInspection(companyId: string, userId: string, data: any) {
    const inspection = await prisma.housekeepingInspection.create({
      data: { ...data, companyId, inspectedById: userId, inspectionDate: new Date(data.inspectionDate) },
    });

    // Gap 8: Auto-create maintenance ticket when action is required
    if (data.actionRequired && Array.isArray(data.issuesFound) && data.issuesFound.length > 0) {
      try {
        const zone = data.zoneId
          ? await prisma.housekeepingZone.findUnique({ where: { id: data.zoneId }, select: { name: true } })
          : null;
        const zoneName = zone?.name || 'Unknown zone';

        // Generate ticket number
        const year = new Date().getFullYear();
        const lastTicket = await prisma.maintenanceTicket.findFirst({
          where: { companyId, ticketNumber: { startsWith: `MNT-${year}` } },
          orderBy: { ticketNumber: 'desc' },
        });
        const seq = lastTicket ? parseInt(lastTicket.ticketNumber.split('-')[2]) + 1 : 1;
        const ticketNumber = `MNT-${year}-${String(seq).padStart(5, '0')}`;

        const category = await prisma.maintenanceCategory.findFirst({
          where: { companyId, name: 'General' },
        }) || await prisma.maintenanceCategory.findFirst({ where: { companyId } });
        if (!category) throw new Error('No maintenance category configured for this company');

        const ticket = await prisma.maintenanceTicket.create({
          data: {
            companyId,
            propertyId: data.propertyId,
            categoryId: category.id,
            ticketNumber,
            title: `Housekeeping issue — ${zoneName}`,
            description: `Issues found during inspection:\n${data.issuesFound.join('\n')}`,
            source: 'inspection',
            priority: 'medium',
            status: 'open',
            reportedByUserId: userId,
          },
        });

        // Link ticket to inspection
        await prisma.housekeepingInspection.update({
          where: { id: inspection.id },
          data: { ticketId: ticket.id },
        });
      } catch { /* ticket creation is best-effort */ }
    }

    return inspection;
  }

  // ── Stats ─────────────────────────────
  async function getStats(companyId: string, params: any) {
    const today = new Date().toISOString().split('T')[0];
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;

    const todayTasks = await prisma.cleaningTask.findMany({
      where: { ...where, taskDate: new Date(today) },
    });

    const total = todayTasks.length;
    const completed = todayTasks.filter((t) => t.status === 'completed').length;
    const inProgress = todayTasks.filter((t) => t.status === 'in_progress').length;
    const pending = todayTasks.filter((t) => t.status === 'pending').length;
    const missed = todayTasks.filter((t) => t.status === 'missed').length;

    const zones = await prisma.housekeepingZone.count({ where: { ...where, isActive: true } });
    const schedules = await prisma.cleaningSchedule.count({ where: { ...where, status: 'active' } });

    return {
      today: { total, completed, inProgress, pending, missed, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 },
      zones, schedules,
    };
  }

  return {
    listZones, createZone,
    listSchedules, createSchedule,
    listTasks, startTask, completeTask,
    listInspections, createInspection,
    getStats,
  };
}
