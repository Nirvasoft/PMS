import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

class MallService {
  // ═══════════════════════════════════════
  //  MALL PROPERTY CONFIG
  // ═══════════════════════════════════════

  async getMallProperty(propertyId: string, companyId: string) {
    return prisma.mallProperty.findFirst({ where: { propertyId, companyId } });
  }

  async upsertMallProperty(propertyId: string, companyId: string, data: any) {
    return prisma.mallProperty.upsert({
      where: { propertyId },
      create: { propertyId, companyId, ...data },
      update: data,
    });
  }

  // ═══════════════════════════════════════
  //  SHOP PROFILES
  // ═══════════════════════════════════════

  async listShops(companyId: string, params: {
    propertyId?: string; tradeCategory?: string; shopZone?: string;
    isAnchor?: boolean; page?: number; limit?: number;
  }) {
    const { propertyId, tradeCategory, shopZone, isAnchor, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (tradeCategory) where.tradeCategory = tradeCategory;
    if (shopZone) where.shopZone = shopZone;
    if (isAnchor !== undefined) where.isAnchor = isAnchor;

    const [data, total] = await Promise.all([
      prisma.shopProfile.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { shopNumber: 'asc' },
        include: {
          unit: {
            select: {
              unitNumber: true, status: true, areaSqft: true, floorLabel: true,
              leases: {
                where: { status: 'active' },
                take: 1,
                select: {
                  id: true, leaseNumber: true, endDate: true, rentAmount: true,
                  tenant: { select: { companyName: true } },
                  commercialLease: {
                    select: { hasPercentageRent: true, percentageRentRate: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.shopProfile.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getShopProfile(unitId: string, companyId: string) {
    return prisma.shopProfile.findFirst({
      where: { unitId, companyId },
      include: {
        unit: {
          select: {
            unitNumber: true, status: true, areaSqft: true, floorLabel: true,
            leases: {
              where: { status: 'active' }, take: 1,
              include: { tenant: true, commercialLease: true },
            },
          },
        },
      },
    });
  }

  async upsertShopProfile(unitId: string, companyId: string, data: any) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, companyId } });
    if (!unit) throw AppError.notFound('Unit');

    return prisma.shopProfile.upsert({
      where: { unitId },
      create: { unitId, companyId, propertyId: unit.propertyId, ...data },
      update: data,
    });
  }

  async getTenantMix(propertyId: string, companyId: string) {
    const shops = await prisma.shopProfile.findMany({
      where: { propertyId, companyId },
      include: { unit: { select: { areaSqft: true, status: true } } },
    });

    const totalShops = shops.length;
    const totalGla = shops.reduce((s, sp) => s + Number(sp.unit.areaSqft || 0), 0);
    const occupiedShops = shops.filter(s => s.unit.status === 'occupied').length;
    const occupancyRate = totalShops > 0 ? (occupiedShops / totalShops) * 100 : 0;

    const catMap = new Map<string, { count: number; gla: number }>();
    for (const sp of shops) {
      const cat = sp.tradeCategory || 'Other';
      const existing = catMap.get(cat) || { count: 0, gla: 0 };
      existing.count++;
      existing.gla += Number(sp.unit.areaSqft || 0);
      catMap.set(cat, existing);
    }

    const byCategory = Array.from(catMap.entries())
      .map(([category, { count, gla }]) => ({
        category, shopCount: count, glaSqft: gla,
        pct: totalGla > 0 ? Math.round((gla / totalGla) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.glaSqft - a.glaSqft);

    const anchorTenants = shops
      .filter(s => s.isAnchor)
      .map(s => ({
        brandName: s.brandName, glaSqft: Number(s.unit.areaSqft || 0), zone: s.shopZone,
      }));

    return { totalShops, totalGlaSqft: totalGla, occupancyRate, byCategory, anchorTenants };
  }

  // ═══════════════════════════════════════
  //  COMMERCIAL LEASES
  // ═══════════════════════════════════════

  async getCommercialLease(leaseId: string, companyId: string) {
    return prisma.commercialLease.findFirst({
      where: { leaseId, companyId },
    });
  }

  async upsertCommercialLease(leaseId: string, companyId: string, data: any) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');

    const mapped: any = { ...data };
    if (data.fitOutStartDate) mapped.fitOutStartDate = new Date(data.fitOutStartDate);
    if (data.fitOutEndDate) mapped.fitOutEndDate = new Date(data.fitOutEndDate);

    return prisma.commercialLease.upsert({
      where: { leaseId },
      create: { leaseId, companyId, ...mapped },
      update: mapped,
    });
  }

  // ═══════════════════════════════════════
  //  GTO SUBMISSIONS
  // ═══════════════════════════════════════

  async submitGto(companyId: string, submittedBy: string, data: any) {
    const lease = await prisma.lease.findFirst({
      where: { id: data.leaseId, companyId },
    });
    if (!lease) throw AppError.notFound('Lease');

    const commLease = await prisma.commercialLease.findUnique({
      where: { leaseId: data.leaseId },
    });

    let percentageRent = 0;
    let naturalBreakpoint: number | null = null;
    let gtoAboveBreakpoint: number | null = null;
    let totalRentDue = Number(lease.rentAmount);

    if (commLease?.hasPercentageRent && commLease.percentageRentRate) {
      const rate = Number(commLease.percentageRentRate);
      const breakpoint = commLease.percentageRentType === 'artificial' && commLease.artificialBreakpoint
        ? Number(commLease.artificialBreakpoint)
        : Number(lease.rentAmount) / rate;

      naturalBreakpoint = breakpoint;
      gtoAboveBreakpoint = Math.max(0, data.grossTurnover - breakpoint);
      percentageRent = gtoAboveBreakpoint * rate;
      totalRentDue = Number(lease.rentAmount) + percentageRent;
    }

    return prisma.gtoSubmission.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        unitId: data.unitId,
        leaseId: data.leaseId,
        tenantId: data.tenantId,
        submissionMonth: data.submissionMonth,
        submissionYear: data.submissionYear,
        grossTurnover: data.grossTurnover,
        currency: data.currency || 'USD',
        cashSales: data.cashSales,
        cardSales: data.cardSales,
        onlineSales: data.onlineSales,
        otherSales: data.otherSales,
        submittedBy,
        submissionMethod: 'manual',
        baseRent: lease.rentAmount,
        naturalBreakpoint,
        gtoAboveBreakpoint,
        percentageRent,
        totalRentDue,
        notes: data.notes,
      },
    });
  }

  async listGtoSubmissions(companyId: string, params: {
    propertyId?: string; leaseId?: string; month?: number;
    year?: number; verified?: boolean; page?: number; limit?: number;
  }) {
    const { propertyId, leaseId, month, year, verified, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (leaseId) where.leaseId = leaseId;
    if (month) where.submissionMonth = month;
    if (year) where.submissionYear = year;
    if (verified !== undefined) where.verified = verified;

    const [data, total] = await Promise.all([
      prisma.gtoSubmission.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ submissionYear: 'desc' }, { submissionMonth: 'desc' }],
        include: {
          unit: { select: { unitNumber: true } },
          tenant: { select: { companyName: true } },
          lease: { select: { leaseNumber: true } },
        },
      }),
      prisma.gtoSubmission.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async verifyGto(id: string, companyId: string, verifiedBy: string, data: any) {
    const gto = await prisma.gtoSubmission.findFirst({ where: { id, companyId } });
    if (!gto) throw AppError.notFound('GTO submission');

    return prisma.gtoSubmission.update({
      where: { id },
      data: {
        verified: data.verified,
        verifiedBy,
        verifiedAt: new Date(),
        variancePct: data.variancePct,
        notes: data.notes || gto.notes,
      },
    });
  }

  async getGtoSummary(propertyId: string, companyId: string, month: number, year: number) {
    const submissions = await prisma.gtoSubmission.findMany({
      where: { propertyId, companyId, submissionMonth: month, submissionYear: year },
    });

    const totalShopsRequired = await prisma.commercialLease.count({
      where: {
        companyId,
        turnoverReportingRequired: true,
        lease: { status: 'active', propertyId },
      },
    });

    const totalGto = submissions.reduce((s, g) => s + Number(g.grossTurnover), 0);
    const totalBaseRent = submissions.reduce((s, g) => s + Number(g.baseRent || 0), 0);
    const totalPercentageRent = submissions.reduce((s, g) => s + Number(g.percentageRent), 0);

    return {
      month, year,
      totalShopsRequired,
      submitted: submissions.length,
      pending: totalShopsRequired - submissions.length,
      totalGto,
      totalBaseRent,
      totalPercentageRent,
      totalRent: totalBaseRent + totalPercentageRent,
    };
  }

  // ═══════════════════════════════════════
  //  CAM COST POOLS
  // ═══════════════════════════════════════

  async listCamPools(companyId: string, propertyId: string, year?: number) {
    const where: any = { companyId, propertyId };
    if (year && !isNaN(year)) where.year = year;
    return prisma.camCostPool.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { billings: true } } },
    });
  }

  async createCamPool(companyId: string, data: any) {
    return prisma.camCostPool.create({
      data: { companyId, ...data },
    });
  }

  async updateCamPool(id: string, companyId: string, data: any) {
    const pool = await prisma.camCostPool.findFirst({ where: { id, companyId } });
    if (!pool) throw AppError.notFound('CAM pool');
    return prisma.camCostPool.update({ where: { id }, data });
  }

  async listCamBillings(companyId: string, params: {
    propertyId?: string; month?: number; year?: number; unitId?: string;
  }) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;
    if (params.month) where.billingMonth = params.month;
    if (params.year) where.billingYear = params.year;
    if (params.unitId) where.unitId = params.unitId;

    return prisma.camBilling.findMany({
      where,
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      include: {
        pool: { select: { name: true, poolType: true } },
        unit: { select: { unitNumber: true } },
        tenant: { select: { companyName: true } },
      },
    });
  }

  async listCamReconciliations(companyId: string, propertyId: string, year: number) {
    return prisma.camReconciliation.findMany({
      where: { companyId, propertyId, reconYear: year },
      include: {
        pool: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        tenant: { select: { companyName: true } },
      },
    });
  }

  // ═══════════════════════════════════════
  //  MALL EVENTS
  // ═══════════════════════════════════════

  async listEvents(companyId: string, params: {
    propertyId?: string; status?: string; from?: string; to?: string;
    page?: number; limit?: number;
  }) {
    const { propertyId, status, from, to, page = 1, limit = 20 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to) where.startDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.mallEvent.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { startDate: 'desc' },
        include: { _count: { select: { booths: true } } },
      }),
      prisma.mallEvent.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async createEvent(companyId: string, createdBy: string, data: any) {
    return prisma.mallEvent.create({
      data: {
        companyId, createdBy,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
  }

  async updateEvent(id: string, companyId: string, data: any) {
    const ev = await prisma.mallEvent.findFirst({ where: { id, companyId } });
    if (!ev) throw AppError.notFound('Event');

    const mapped: any = { ...data };
    if (data.startDate) mapped.startDate = new Date(data.startDate);
    if (data.endDate) mapped.endDate = new Date(data.endDate);

    return prisma.mallEvent.update({ where: { id }, data: mapped });
  }

  async getEventDetail(id: string, companyId: string) {
    return prisma.mallEvent.findFirst({
      where: { id, companyId },
      include: {
        booths: {
          include: { tenant: { select: { companyName: true } } },
          orderBy: { boothNumber: 'asc' },
        },
      },
    });
  }

  async createBooth(eventId: string, companyId: string, data: any) {
    const event = await prisma.mallEvent.findFirst({ where: { id: eventId, companyId } });
    if (!event) throw AppError.notFound('Event');

    const days = Math.ceil(
      (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 86400000
    ) + 1;
    const totalAmount = data.dailyRate ? data.dailyRate * days : null;

    return prisma.boothRental.create({
      data: {
        eventId, companyId, propertyId: event.propertyId,
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalAmount,
      },
    });
  }

  async updateBooth(id: string, companyId: string, data: any) {
    const booth = await prisma.boothRental.findFirst({ where: { id, companyId } });
    if (!booth) throw AppError.notFound('Booth');
    return prisma.boothRental.update({ where: { id }, data });
  }

  // ═══════════════════════════════════════
  //  FOOTFALL SENSORS
  // ═══════════════════════════════════════

  async listSensors(companyId: string, propertyId: string) {
    return prisma.footfallSensor.findMany({
      where: { companyId, propertyId },
      orderBy: { name: 'asc' },
    });
  }

  async createSensor(companyId: string, data: any) {
    return prisma.footfallSensor.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        sensorId: data.sensorId,
        name: data.name,
        location: data.location,
        zone: data.zone,
        floor: data.floor,
        sensorType: data.sensorType || 'stereo',
        vendor: data.vendor,
        apiEndpoint: data.apiEndpoint,
        apiKeyEnc: data.apiKey, // In production, encrypt this
      },
    });
  }

  async updateSensor(id: string, companyId: string, data: any) {
    const sensor = await prisma.footfallSensor.findFirst({ where: { id, companyId } });
    if (!sensor) throw AppError.notFound('Sensor');
    return prisma.footfallSensor.update({ where: { id }, data });
  }

  // ═══════════════════════════════════════
  //  MALL DASHBOARD STATS
  // ═══════════════════════════════════════

  async getDashboardStats(companyId: string, propertyId: string) {
    const now = new Date();
    const thisMonth = now.getMonth() + 1;
    const thisYear = now.getFullYear();

    const [
      mallProp, tenantMix, gtoSummary, activePools, upcomingEvents, totalSensors,
    ] = await Promise.all([
      this.getMallProperty(propertyId, companyId),
      this.getTenantMix(propertyId, companyId),
      this.getGtoSummary(propertyId, companyId, thisMonth, thisYear),
      prisma.camCostPool.count({ where: { propertyId, companyId, year: thisYear, isActive: true } }),
      prisma.mallEvent.findMany({
        where: { propertyId, companyId, startDate: { gte: now }, status: { in: ['planned', 'active'] } },
        take: 5, orderBy: { startDate: 'asc' },
      }),
      prisma.footfallSensor.count({ where: { propertyId, companyId, isActive: true } }),
    ]);

    return {
      mallProperty: mallProp,
      tenantMix,
      gtoSummary,
      activeCamPools: activePools,
      upcomingEvents,
      activeSensors: totalSensors,
    };
  }
}

export const mallService = new MallService();
