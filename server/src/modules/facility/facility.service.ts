import { prisma, setTenantContext } from '../../common/database';
import { AppError } from '../../common/errors';
import { Prisma } from '@prisma/client';

// ── Facility Service ──────────────────────────

class FacilityService {

  // ── Assets CRUD ──────────────────────────────

  async findAllAssets(companyId: string, params: {
    propertyId?: string; assetType?: string; status?: string;
    serviceOverdue?: boolean; search?: string;
    page: number; limit: number;
  }) {
    await setTenantContext(companyId);

    const today = new Date();
    const where: Prisma.FacilityAssetWhereInput = {
      companyId,
      ...(params.propertyId && { propertyId: params.propertyId }),
      ...(params.assetType && { assetType: params.assetType }),
      ...(params.status && { status: params.status }),
      ...(params.serviceOverdue && {
        nextServiceDue: { lt: today },
        status: { not: 'decommissioned' },
      }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' as const } },
          { assetNumber: { contains: params.search, mode: 'insensitive' as const } },
          { location: { contains: params.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.facilityAsset.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          responsiblePerson: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { assetNumber: 'asc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.facilityAsset.count({ where }),
    ]);

    // Enrich with computed fields
    const enriched = data.map((a) => ({
      ...a,
      daysUntilWarrantyExpiry: a.warrantyExpiry
        ? Math.ceil((new Date(a.warrantyExpiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      daysUntilService: a.nextServiceDue
        ? Math.ceil((new Date(a.nextServiceDue).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    }));

    return {
      data: enriched,
      meta: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async findAssetById(id: string, companyId: string) {
    await setTenantContext(companyId);
    const asset = await prisma.facilityAsset.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        responsiblePerson: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!asset) throw AppError.notFound('Facility Asset');
    return asset;
  }

  async createAsset(companyId: string, data: any) {
    await setTenantContext(companyId);
    const asset = await prisma.facilityAsset.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        assetNumber: data.assetNumber,
        name: data.name,
        assetType: data.assetType,
        make: data.make,
        model: data.model,
        serialNumber: data.serialNumber,
        installationDate: data.installationDate ? new Date(data.installationDate) : undefined,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : undefined,
        expectedLifespanYears: data.expectedLifespanYears,
        location: data.location,
        floor: data.floor,
        unitId: data.unitId,
        responsiblePersonId: data.responsiblePersonId,
        vendorName: data.vendorName,
        vendorContact: data.vendorContact,
        serviceContractNo: data.serviceContractNo,
        serviceContractExpiry: data.serviceContractExpiry ? new Date(data.serviceContractExpiry) : undefined,
        purchaseCost: data.purchaseCost,
        notes: data.notes,
      },
    });

    // Auto-generate QR code
    await prisma.facilityAsset.update({
      where: { id: asset.id },
      data: { qrCode: `ASSET-${asset.id}` },
    });

    return { ...asset, qrCode: `ASSET-${asset.id}` };
  }

  async updateAsset(id: string, companyId: string, data: any) {
    await setTenantContext(companyId);
    const existing = await prisma.facilityAsset.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Facility Asset');

    const updateData: any = {};
    const fields = [
      'name', 'assetType', 'make', 'model', 'serialNumber',
      'expectedLifespanYears', 'location', 'floor', 'unitId', 'status',
      'responsiblePersonId', 'vendorName', 'vendorContact',
      'serviceContractNo', 'purchaseCost', 'currentValue', 'notes',
    ];
    for (const f of fields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    // Date fields
    for (const f of ['installationDate', 'warrantyExpiry', 'serviceContractExpiry', 'nextServiceDue']) {
      if (data[f] !== undefined) updateData[f] = data[f] ? new Date(data[f]) : null;
    }

    return prisma.facilityAsset.update({
      where: { id },
      data: updateData,
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async deleteAsset(id: string, companyId: string) {
    await setTenantContext(companyId);
    const existing = await prisma.facilityAsset.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Facility Asset');
    await prisma.facilityAsset.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Service Due / Warranty Expiring ──────────

  async getServiceDue(companyId: string, params: { propertyId?: string; days: number }) {
    await setTenantContext(companyId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (params.days || 30));

    return prisma.facilityAsset.findMany({
      where: {
        companyId,
        nextServiceDue: { lte: cutoff },
        status: { not: 'decommissioned' },
        ...(params.propertyId && { propertyId: params.propertyId }),
      },
      include: {
        property: { select: { id: true, name: true } },
        responsiblePerson: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { nextServiceDue: 'asc' },
    });
  }

  async getWarrantyExpiring(companyId: string, params: { days: number }) {
    await setTenantContext(companyId);
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (params.days || 90));

    return prisma.facilityAsset.findMany({
      where: {
        companyId,
        warrantyExpiry: { gte: today, lte: cutoff },
      },
      include: {
        property: { select: { id: true, name: true } },
      },
      orderBy: { warrantyExpiry: 'asc' },
    });
  }

  // ── CAM Costs ────────────────────────────────

  async getCamCosts(companyId: string, params: {
    propertyId?: string; year?: number; month?: number;
    page: number; limit: number;
  }) {
    await setTenantContext(companyId);

    const where: Prisma.CamCostEntryWhereInput = {
      companyId,
      ...(params.propertyId && { propertyId: params.propertyId }),
      ...(params.year && { periodYear: params.year }),
      ...(params.month && { periodMonth: params.month }),
    };

    const [data, total] = await Promise.all([
      prisma.camCostEntry.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          createdBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.camCostEntry.count({ where }),
    ]);

    return {
      data,
      meta: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async createCamCost(companyId: string, data: any, createdById: string) {
    await setTenantContext(companyId);
    return prisma.camCostEntry.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        costCategory: data.costCategory,
        description: data.description,
        amount: data.amount,
        currency: data.currency || 'USD',
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        createdById,
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async getCamCostSummary(companyId: string, params: { propertyId: string; year: number; month: number }) {
    await setTenantContext(companyId);

    const rows = await prisma.camCostEntry.groupBy({
      by: ['costCategory'],
      where: {
        companyId,
        propertyId: params.propertyId,
        periodYear: params.year,
        periodMonth: params.month,
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const categories = rows.map((r) => ({
      category: r.costCategory,
      total: Number(r._sum.amount || 0),
      count: r._count.id,
    }));
    const total = categories.reduce((s, c) => s + c.total, 0);

    return { year: params.year, month: params.month, propertyId: params.propertyId, categories, total };
  }

  async updateCamCost(id: string, companyId: string, data: any) {
    await setTenantContext(companyId);
    const existing = await prisma.camCostEntry.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('CAM Cost Entry');

    const fields = ['costCategory', 'description', 'amount', 'currency', 'periodMonth', 'periodYear', 'sourceType'];
    const updateData: any = {};
    for (const f of fields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }

    return prisma.camCostEntry.update({
      where: { id },
      data: updateData,
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async deleteCamCost(id: string, companyId: string) {
    await setTenantContext(companyId);
    const existing = await prisma.camCostEntry.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('CAM Cost Entry');
    await prisma.camCostEntry.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Stats ────────────────────────────────────

  async getAssetStats(companyId: string, propertyId?: string) {
    await setTenantContext(companyId);
    const where: Prisma.FacilityAssetWhereInput = {
      companyId,
      ...(propertyId && { propertyId }),
    };

    const today = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const [total, operational, fault, serviceDue, warrantyExpiring] = await Promise.all([
      prisma.facilityAsset.count({ where }),
      prisma.facilityAsset.count({ where: { ...where, status: 'operational' } }),
      prisma.facilityAsset.count({ where: { ...where, status: 'fault' } }),
      prisma.facilityAsset.count({
        where: { ...where, nextServiceDue: { lte: thirtyDays }, status: { not: 'decommissioned' } },
      }),
      prisma.facilityAsset.count({
        where: { ...where, warrantyExpiry: { gte: today, lte: thirtyDays } },
      }),
    ]);

    return { total, operational, fault, serviceDue, warrantyExpiring };
  }
  // ── QR Scan Landing ──────────────────────────

  async scanAsset(assetId: string) {
    // Public endpoint — no tenant context required, minimal auth
    const asset = await prisma.facilityAsset.findUnique({
      where: { id: assetId },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        responsiblePerson: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        pmSchedules: {
          where: { status: 'active' },
          select: {
            id: true, name: true, frequencyType: true, nextDueDate: true, priority: true,
            assignedTo: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { nextDueDate: 'asc' },
        },
      },
    });
    if (!asset) throw AppError.notFound('Facility Asset');

    // Get recent service history (last 5 completed PM WOs)
    const recentHistory = await prisma.pmWorkOrder.findMany({
      where: {
        status: 'completed',
        schedule: { assetId },
      },
      select: {
        id: true, dueDate: true, completedAt: true, findings: true,
        schedule: { select: { name: true } },
        completedBy: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
    });

    const today = new Date();
    return {
      asset: {
        ...asset,
        daysUntilWarrantyExpiry: asset.warrantyExpiry
          ? Math.ceil((new Date(asset.warrantyExpiry).getTime() - today.getTime()) / 86400000)
          : null,
        daysUntilService: asset.nextServiceDue
          ? Math.ceil((new Date(asset.nextServiceDue).getTime() - today.getTime()) / 86400000)
          : null,
      },
      pmSchedules: asset.pmSchedules,
      recentHistory,
    };
  }

  // ── Auto-create CAM entry from WO ──────────

  async autoCreateCamFromWorkOrder(workOrder: {
    companyId: string; propertyId: string; totalCost: number;
    woNumber: string; ticketTitle?: string;
  }) {
    if (!workOrder.totalCost || workOrder.totalCost <= 0) return null;

    const today = new Date();
    return prisma.camCostEntry.create({
      data: {
        companyId: workOrder.companyId,
        propertyId: workOrder.propertyId,
        costCategory: 'repairs',
        description: `Work order ${workOrder.woNumber}${workOrder.ticketTitle ? `: ${workOrder.ticketTitle}` : ''}`,
        amount: workOrder.totalCost,
        currency: 'USD',
        periodMonth: today.getMonth() + 1,
        periodYear: today.getFullYear(),
        sourceType: 'work_order',
      },
    });
  }

  // ── Utility Systems ──────────────────────────

  async findAllUtilitySystems(companyId: string, params: { propertyId?: string }) {
    await setTenantContext(companyId);
    return prisma.utilitySystem.findMany({
      where: {
        companyId,
        ...(params.propertyId && { propertyId: params.propertyId }),
      },
      include: { property: { select: { id: true, name: true } } },
      orderBy: { systemType: 'asc' },
    });
  }

  async createUtilitySystem(companyId: string, data: any) {
    await setTenantContext(companyId);
    return prisma.utilitySystem.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        systemType: data.systemType,
        meterId: data.meterId,
        capacity: data.capacity,
        unitOfMeasure: data.unitOfMeasure,
        notes: data.notes,
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async updateUtilitySystem(id: string, companyId: string, data: any) {
    await setTenantContext(companyId);
    const existing = await prisma.utilitySystem.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Utility System');

    const fields = ['systemType', 'meterId', 'capacity', 'unitOfMeasure', 'notes'];
    const updateData: any = {};
    for (const f of fields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }

    return prisma.utilitySystem.update({
      where: { id },
      data: updateData,
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async deleteUtilitySystem(id: string, companyId: string) {
    await setTenantContext(companyId);
    const existing = await prisma.utilitySystem.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Utility System');
    await prisma.utilitySystem.delete({ where: { id } });
    return { deleted: true };
  }
}

export const facilityService = new FacilityService();
