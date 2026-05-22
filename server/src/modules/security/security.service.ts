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
    const incident = await prisma.securityIncident.create({
      data: {
        ...data,
        companyId,
        incidentNumber,
        reportedById: userId,
        incidentAt: new Date(data.incidentAt),
      },
    });

    // Gap 9: Notify security managers + property managers
    try {
      const { notificationService } = await import('../notifications/services/notification.service');
      const managers = await prisma.user.findMany({
        where: { companyId, isActive: true, role: { in: ['admin', 'manager', 'security'] } },
        select: { id: true },
      });
      if (managers.length > 0) {
        const channels = data.severity === 'critical'
          ? ['email', 'push', 'in_app'] : ['push', 'in_app'];
        await notificationService.send({
          templateCode: 'security_incident_reported',
          companyId,
          recipientIds: managers.map((m: any) => m.id),
          channels,
          variables: {
            incidentNumber, incidentType: data.incidentType,
            severity: data.severity, location: data.locationDetail || '',
            description: (data.description || '').substring(0, 100),
          },
          entityType: 'security_incident',
          entityId: incident.id,
        });
      }
    } catch { /* notification optional */ }

    return incident;
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

    const log = await prisma.patrolLog.create({
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

    // Gap 10: Check for patrol gap > 90 minutes
    try {
      const lastLog = await prisma.patrolLog.findFirst({
        where: { propertyId: checkpoint.propertyId, guardId, id: { not: log.id } },
        orderBy: { scannedAt: 'desc' },
      });
      if (lastLog) {
        const gapMinutes = (Date.now() - new Date(lastLog.scannedAt).getTime()) / 60000;
        if (gapMinutes > 90) {
          const { notificationService } = await import('../notifications/services/notification.service');
          const managers = await prisma.user.findMany({
            where: { companyId, isActive: true, role: { in: ['admin', 'manager', 'security'] } },
            select: { id: true },
          });
          if (managers.length > 0) {
            const guard = await prisma.user.findUnique({
              where: { id: guardId },
              include: { profile: { select: { firstName: true, lastName: true } } },
            });
            const guardName = guard?.profile ? `${guard.profile.firstName} ${guard.profile.lastName}` : 'Guard';
            await notificationService.send({
              templateCode: 'patrol_gap_detected',
              companyId,
              recipientIds: managers.map((m: any) => m.id),
              channels: ['push', 'in_app'],
              variables: { guardName, gapMinutes: Math.round(gapMinutes), propertyId: checkpoint.propertyId },
              entityType: 'patrol_log',
              entityId: log.id,
            });
          }
        }
      }
    } catch { /* gap detection optional */ }

    return log;
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

    // Gap 12: Patrol compliance
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const patrolLogsToday = await prisma.patrolLog.count({
      where: { ...where, scannedAt: { gte: dayStart } },
    });
    const activeSchedules = await prisma.patrolSchedule.count({ where: { ...where, isActive: true } });
    // Estimate expected patrols: schedules × expected per day (assume ~6 for hourly)
    const expectedPatrols = activeSchedules * 6;
    const patrolCompliance = {
      scheduled: expectedPatrols,
      completed: patrolLogsToday,
      missed: Math.max(0, expectedPatrols - patrolLogsToday),
      complianceRate: expectedPatrols > 0 ? Math.round((patrolLogsToday / expectedPatrols) * 100 * 10) / 10 : 100,
    };

    // Gap 12: Access denied in last 24h
    const accessDenied24h = await prisma.accessControlEvent.count({
      where: { ...where, eventType: 'access_denied', eventAt: { gte: new Date(Date.now() - 86400000) } },
    }).catch(() => 0);

    return { incidentSummary, bySeverity, byType, checkpoints, patrolCompliance, accessDenied24h };
  }

  // ── Access Control Events (Gap 11) ──────
  async function listAccessEvents(companyId: string, params: any) {
    const { propertyId, eventType, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (eventType) where.eventType = eventType;

    const [data, total] = await Promise.all([
      prisma.accessControlEvent.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { eventAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.accessControlEvent.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async function handleAccessWebhook(companyId: string, data: any) {
    const event = await prisma.accessControlEvent.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        doorName: data.doorName,
        cardNumber: data.cardNumber,
        userId: data.userId || null,
        tenantId: data.tenantId || null,
        eventType: data.eventType,
        eventAt: new Date(data.eventAt),
        denialReason: data.denialReason,
      },
    });

    // Auto-create security incident on door_forced
    if (data.eventType === 'door_forced') {
      await createIncident(companyId, '00000000-0000-0000-0000-000000000000', {
        propertyId: data.propertyId,
        incidentType: 'trespassing',
        severity: 'high',
        title: `Door forced open — ${data.doorName || 'Unknown'}`,
        description: `Access control detected forced door opening at ${data.doorName || 'Unknown'}. Device: ${data.deviceId}`,
        locationDetail: data.doorName,
        incidentAt: data.eventAt,
      });
    }

    return event;
  }

  return {
    listIncidents, getIncidentById, createIncident, updateIncident, resolveIncident,
    listCheckpoints, createCheckpoint,
    listPatrolSchedules, createPatrolSchedule,
    listPatrolLogs, scanCheckpoint,
    getStats,
    listAccessEvents, handleAccessWebhook,
  };
}
