import type { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export function createSecurityService({ prisma }: { prisma: PrismaClient }) {
  // ── Auto-generate incident number ─────
  async function nextIncidentNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const last = await prisma.securityIncident.findFirst({
      where: { companyId, incidentNumber: { startsWith: `INC-${year}` } },
      orderBy: { incidentNumber: 'desc' },
    });
    const seq = last ? parseInt(last.incidentNumber.split('-')[2]) + 1 : 1;
    return `INC-${year}-${String(seq).padStart(5, '0')}`;
  }

  // ── Incidents ──────────────────────────
  async function listIncidents(companyId: string, params: any) {
    const { propertyId, severity, status, incidentType, page = 1, limit = 20 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (incidentType) where.incidentType = incidentType;

    const [data, total] = await Promise.all([
      prisma.securityIncident.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          reportedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { incidentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.securityIncident.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async function getIncidentById(companyId: string, id: string) {
    return prisma.securityIncident.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });
  }

  async function createIncident(companyId: string, userId: string, data: any) {
    const incidentNumber = await nextIncidentNumber(companyId);
    return prisma.securityIncident.create({
      data: {
        ...data,
        companyId,
        incidentNumber,
        reportedById: userId,
        incidentAt: new Date(data.incidentAt),
      },
    });
  }

  async function updateIncident(companyId: string, id: string, data: any) {
    return prisma.securityIncident.update({ where: { id }, data });
  }

  async function resolveIncident(companyId: string, id: string, data: any) {
    return prisma.securityIncident.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution: data.resolution,
        policeReportNo: data.policeReportNo,
        resolvedAt: new Date(),
      },
    });
  }

  // ── Checkpoints ────────────────────────
  async function listCheckpoints(companyId: string, propertyId?: string) {
    return prisma.patrolCheckpoint.findMany({
      where: { companyId, ...(propertyId && { propertyId }), isActive: true },
      include: { property: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async function createCheckpoint(companyId: string, data: any) {
    const qrCode = `CHKPT-${crypto.randomUUID()}`;
    return prisma.patrolCheckpoint.create({ data: { ...data, companyId, qrCode } });
  }

  // ── Patrol Schedules ───────────────────
  async function listPatrolSchedules(companyId: string, propertyId?: string) {
    return prisma.patrolSchedule.findMany({
      where: { companyId, ...(propertyId && { propertyId }), isActive: true },
      include: {
        property: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async function createPatrolSchedule(companyId: string, data: any) {
    return prisma.patrolSchedule.create({ data: { ...data, companyId } });
  }

  // ── Patrol Logs ────────────────────────
  async function listPatrolLogs(companyId: string, params: any) {
    const { propertyId, guardId, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (guardId) where.guardId = guardId;

    const [data, total] = await Promise.all([
      prisma.patrolLog.findMany({
        where,
        include: {
          checkpoint: { select: { id: true, name: true, location: true, floor: true } },
          guard: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          property: { select: { id: true, name: true } },
        },
        orderBy: { scannedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.patrolLog.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async function scanCheckpoint(companyId: string, guardId: string, data: any) {
    const checkpoint = await prisma.patrolCheckpoint.findUnique({ where: { qrCode: data.qrCode } });
    if (!checkpoint) throw Object.assign(new Error('Invalid checkpoint QR code'), { status: 404 });

    return prisma.patrolLog.create({
      data: {
        companyId,
        propertyId: checkpoint.propertyId,
        checkpointId: checkpoint.id,
        guardId,
        lat: data.lat,
        lng: data.lng,
        notes: data.notes,
      },
    });
  }

  // ── Stats ──────────────────────────────
  async function getStats(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;

    const incidents = await prisma.securityIncident.findMany({ where, select: { status: true, severity: true, incidentType: true } });

    const incidentSummary = {
      total: incidents.length,
      open: incidents.filter((i) => i.status === 'open').length,
      investigating: incidents.filter((i) => i.status === 'investigating').length,
      resolved: incidents.filter((i) => i.status === 'resolved').length,
      closed: incidents.filter((i) => i.status === 'closed').length,
    };

    const bySeverity = {
      low: incidents.filter((i) => i.severity === 'low').length,
      medium: incidents.filter((i) => i.severity === 'medium').length,
      high: incidents.filter((i) => i.severity === 'high').length,
      critical: incidents.filter((i) => i.severity === 'critical').length,
    };

    const typeMap: Record<string, number> = {};
    incidents.forEach((i) => { typeMap[i.incidentType] = (typeMap[i.incidentType] || 0) + 1; });
    const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

    const checkpoints = await prisma.patrolCheckpoint.count({ where: { ...where, isActive: true } });

    return { incidentSummary, bySeverity, byType, checkpoints };
  }

  return {
    listIncidents, getIncidentById, createIncident, updateIncident, resolveIncident,
    listCheckpoints, createCheckpoint,
    listPatrolSchedules, createPatrolSchedule,
    listPatrolLogs, scanCheckpoint,
    getStats,
  };
}
