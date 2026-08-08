import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

class VisitorsService {
  /**
   * Pre-register a visitor (tenant portal).
   */
  async preRegister(companyId: string, userId: string, data: {
    propertyId: string;
    hostUnitId: string;
    visitorName: string;
    visitorIc?: string;
    visitorMobile?: string;
    visitorCompany?: string;
    visitPurpose?: string;
    validFrom: string;
    validTo: string;
    expectedDurationHours?: number;
    passType?: string;
    maxUses?: number;
    vehiclePlate?: string;
    vehicleMake?: string;
    parkingSlotId?: string;
    notes?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    // Verify the unit belongs to the resident
    if (resident.unitId !== data.hostUnitId) {
      throw AppError.forbidden('You can only register visitors for your own unit');
    }

    // Check blacklist
    const blacklisted = await this.checkBlacklist(
      companyId, data.visitorName, data.visitorIc, data.visitorMobile,
    );
    if (blacklisted) {
      throw AppError.validation(`Visitor "${data.visitorName}" is on the blacklist: ${blacklisted.reason}`);
    }

    // Generate QR token
    const rawToken = `VIS-${data.propertyId.slice(0, 8)}-${uuidv4()}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const visitor = await prisma.visitor.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        hostUnitId: data.hostUnitId,
        hostResidentId: resident.id,
        hostUserId: userId,
        visitorName: data.visitorName,
        visitorIc: data.visitorIc,
        visitorMobile: data.visitorMobile,
        visitorCompany: data.visitorCompany,
        visitPurpose: data.visitPurpose,
        validFrom: new Date(data.validFrom),
        validTo: new Date(data.validTo),
        expectedDurationHours: data.expectedDurationHours || 2,
        passType: data.passType || 'single',
        maxUses: data.maxUses || 1,
        qrToken: rawToken,
        qrTokenHash: tokenHash,
        status: 'approved',
        vehiclePlate: data.vehiclePlate,
        vehicleMake: data.vehicleMake,
        parkingSlotId: data.parkingSlotId,
        notes: data.notes,
      },
    });

    return {
      ...visitor,
      qrPassUrl: `/visitor-pass/${rawToken}`,
    };
  }

  /**
   * Get public visitor pass info by QR token.
   */
  async getPassByToken(token: string) {
    const visitor = await prisma.visitor.findUnique({
      where: { qrToken: token },
      include: {
        hostUnit: { select: { unitNumber: true } },
        property: { select: { name: true, addressLine1: true, city: true, state: true } },
      },
    });

    if (!visitor) throw AppError.notFound('Visitor pass');

    return {
      propertyName: visitor.property.name,
      propertyAddress: [visitor.property.addressLine1, visitor.property.city, visitor.property.state]
        .filter(Boolean).join(', '),
      visitorName: visitor.visitorName,
      hostUnit: visitor.hostUnit.unitNumber,
      validFrom: visitor.validFrom,
      validTo: visitor.validTo,
      status: visitor.status,
      qrToken: visitor.qrToken,
    };
  }

  /**
   * Scan QR code at gate — check-in or check-out.
   */
  async scanQrCode(companyId: string, guardUserId: string, data: {
    qrToken: string;
    gateId: string;
  }) {
    const tokenHash = crypto.createHash('sha256').update(data.qrToken).digest('hex');

    const visitor = await prisma.visitor.findUnique({
      where: { qrTokenHash: tokenHash },
      include: {
        hostUnit: { select: { unitNumber: true } },
      },
    });

    if (!visitor) return { authorized: false, reason: 'INVALID_QR', message: 'Invalid QR code.' };
    if (visitor.companyId !== companyId) return { authorized: false, reason: 'INVALID_QR', message: 'Invalid QR code.' };

    const now = new Date();
    if (now < visitor.validFrom) return { authorized: false, reason: 'PASS_NOT_YET_VALID', message: 'This pass is not yet valid.' };
    if (now > visitor.validTo) return { authorized: false, reason: 'PASS_EXPIRED', message: 'This visitor pass has expired.' };
    if (visitor.status === 'cancelled') return { authorized: false, reason: 'PASS_CANCELLED', message: 'This pass was cancelled.' };
    if (visitor.status === 'denied') return { authorized: false, reason: 'PASS_DENIED', message: 'This pass was denied.' };

    if (visitor.passType === 'single' && visitor.useCount >= (visitor.maxUses ?? 1)) {
      return { authorized: false, reason: 'PASS_ALREADY_USED', message: 'This pass has already been used.' };
    }

    // Check-in
    if (['approved', 'pending'].includes(visitor.status)) {
      await prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          status: 'checked_in',
          checkedInAt: now,
          checkInGate: data.gateId,
          checkInGuardId: guardUserId,
          useCount: { increment: 1 },
        },
      });

      const minutesRemaining = Math.ceil((visitor.validTo.getTime() - now.getTime()) / 60000);

      return {
        authorized: true,
        action: 'check_in',
        visitor: {
          name: visitor.visitorName,
          hostUnit: visitor.hostUnit.unitNumber,
          validTo: visitor.validTo,
          minutesRemaining,
        },
      };
    }

    // Check-out
    if (visitor.status === 'checked_in') {
      const durationMinutes = visitor.checkedInAt
        ? Math.ceil((now.getTime() - visitor.checkedInAt.getTime()) / 60000)
        : 0;

      await prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          status: 'checked_out',
          checkedOutAt: now,
          actualDurationMinutes: durationMinutes,
          isOverstay: now > visitor.validTo,
        },
      });

      return {
        authorized: true,
        action: 'check_out',
        visitor: { name: visitor.visitorName, durationMinutes },
      };
    }

    return { authorized: false, reason: 'INVALID_STATE', message: 'Pass is in an unexpected state.' };
  }

  /**
   * Walk-in request (security creates, waits for host approval).
   */
  async requestWalkIn(companyId: string, guardUserId: string, data: {
    propertyId: string;
    hostUnitId: string;
    visitorName: string;
    visitorIc?: string;
    visitorMobile?: string;
    visitorCompany?: string;
    visitPurpose?: string;
  }) {
    const rawToken = `WALKIN-${uuidv4()}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();

    const visitor = await prisma.visitor.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        hostUnitId: data.hostUnitId,
        visitorName: data.visitorName,
        visitorIc: data.visitorIc,
        visitorMobile: data.visitorMobile,
        visitorCompany: data.visitorCompany,
        visitPurpose: data.visitPurpose,
        validFrom: now,
        validTo: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours
        qrToken: rawToken,
        qrTokenHash: tokenHash,
        passType: 'single',
        status: 'pending',
      },
    });

    const timeoutAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    const approval = await prisma.walkinApproval.create({
      data: {
        companyId,
        visitorId: visitor.id,
        timeoutAt,
      },
    });

    return {
      approvalId: approval.id,
      visitorId: visitor.id,
      timeoutAt,
      message: `Approval request sent. Waiting for response (5 minutes)...`,
    };
  }

  /**
   * Host responds to walk-in approval.
   */
  async respondToWalkIn(companyId: string, userId: string, data: {
    approvalId: string;
    response: 'approved' | 'rejected';
    reason?: string;
  }) {
    const approval = await prisma.walkinApproval.findFirst({
      where: { id: data.approvalId, companyId },
      include: { visitor: true },
    });

    if (!approval) throw AppError.notFound('Walk-in approval request');
    if (approval.response) throw AppError.validation('Already responded');

    const now = new Date();
    const isApproved = data.response === 'approved';

    await prisma.$transaction([
      prisma.walkinApproval.update({
        where: { id: approval.id },
        data: {
          response: data.response,
          respondedBy: userId,
          reason: data.reason,
          ...(isApproved ? { approvedAt: now } : { rejectedAt: now }),
        },
      }),
      prisma.visitor.update({
        where: { id: approval.visitorId },
        data: { status: isApproved ? 'approved' : 'denied' },
      }),
    ]);

    return { success: true, response: data.response };
  }

  /**
   * Get visitors for portal user's unit.
   */
  async getPortalVisitors(companyId: string, userId: string, filters: {
    status?: string; page?: number; limit?: number;
  }) {
    const resident = await this.getActiveResident(companyId, userId);
    const { page = 1, limit = 20 } = filters;

    const where: any = {
      companyId,
      hostUnitId: resident.unitId,
    };
    if (filters.status && filters.status !== 'all') {
      where.status = { in: filters.status.split(',') };
    }

    const [data, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.visitor.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Cancel a visitor pass.
   */
  async cancelVisitor(companyId: string, userId: string, visitorId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    const visitor = await prisma.visitor.findFirst({
      where: {
        id: visitorId,
        companyId,
        hostUnitId: resident.unitId,
        status: { in: ['pending', 'approved'] },
      },
    });

    if (!visitor) throw AppError.notFound('Visitor pass');

    return prisma.visitor.update({
      where: { id: visitorId },
      data: { status: 'cancelled' },
    });
  }

  /**
   * Get active/checked-in visitors for security dashboard.
   */
  async getActiveVisitors(companyId: string, propertyId?: string) {
    const where: any = {
      companyId,
      status: { in: ['checked_in', 'approved'] },
    };
    if (propertyId) where.propertyId = propertyId;

    return prisma.visitor.findMany({
      where,
      include: {
        hostUnit: { select: { unitNumber: true } },
        property: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Helpers ──────────────────────────────────

  private async checkBlacklist(
    companyId: string, name?: string, ic?: string, mobile?: string,
  ) {
    const conditions: any[] = [];
    if (ic) conditions.push({ visitorIc: ic, isActive: true });
    if (mobile) conditions.push({ visitorMobile: mobile, isActive: true });

    if (conditions.length === 0) return null;

    return prisma.visitorBlacklist.findFirst({
      where: {
        companyId,
        isActive: true,
        OR: conditions,
      },
    });
  }

  // ══════════════════════════════════════════════
  //  BLACKLIST ADMIN CRUD
  // ══════════════════════════════════════════════

  async getBlacklist(companyId: string, filters: {
    propertyId?: string; search?: string; isActive?: string; page?: number; limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.isActive === 'true') where.isActive = true;
    else if (filters.isActive === 'false') where.isActive = false;
    if (filters.search) {
      where.OR = [
        { visitorName: { contains: filters.search, mode: 'insensitive' } },
        { visitorIc: { contains: filters.search, mode: 'insensitive' } },
        { visitorMobile: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.visitorBlacklist.findMany({
        where,
        include: {
          addedByUser: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { addedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.visitorBlacklist.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async createBlacklistEntry(companyId: string, userId: string, data: {
    propertyId?: string; visitorName?: string; visitorIc?: string;
    visitorMobile?: string; reason: string;
  }) {
    if (!data.visitorName && !data.visitorIc && !data.visitorMobile) {
      throw AppError.validation('At least one identifier (name, IC, or mobile) is required');
    }
    return prisma.visitorBlacklist.create({
      data: {
        companyId,
        propertyId: data.propertyId || null,
        visitorName: data.visitorName || null,
        visitorIc: data.visitorIc || null,
        visitorMobile: data.visitorMobile || null,
        reason: data.reason,
        addedBy: userId,
      },
      include: {
        addedByUser: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async updateBlacklistEntry(companyId: string, entryId: string, data: {
    visitorName?: string; visitorIc?: string; visitorMobile?: string;
    reason?: string; isActive?: boolean;
  }) {
    const entry = await prisma.visitorBlacklist.findFirst({ where: { id: entryId, companyId } });
    if (!entry) throw AppError.notFound('Blacklist entry');

    return prisma.visitorBlacklist.update({
      where: { id: entryId },
      data: {
        ...(data.visitorName !== undefined ? { visitorName: data.visitorName } : {}),
        ...(data.visitorIc !== undefined ? { visitorIc: data.visitorIc } : {}),
        ...(data.visitorMobile !== undefined ? { visitorMobile: data.visitorMobile } : {}),
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: {
        addedByUser: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async deleteBlacklistEntry(companyId: string, entryId: string) {
    const entry = await prisma.visitorBlacklist.findFirst({ where: { id: entryId, companyId } });
    if (!entry) throw AppError.notFound('Blacklist entry');
    await prisma.visitorBlacklist.delete({ where: { id: entryId } });
    return { success: true };
  }

  private async getActiveResident(companyId: string, userId: string) {
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
    });
    if (!resident) throw AppError.notFound('No active residence found for this user');
    return resident;
  }
}

export const visitorsService = new VisitorsService();
