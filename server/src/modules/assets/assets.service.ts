import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

class AssetsService {
  // ── CRUD ────────────────────────────────────

  async findAll(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.category) where.category = params.category;
    if (params.status) where.status = params.status;
    if (params.propertyId) where.propertyId = params.propertyId;

    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 20, 100);

    const [data, total] = await Promise.all([
      prisma.fixedAsset.findMany({
        where,
        orderBy: { assetNumber: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fixedAsset.count({ where }),
    ]);

    // Compute netBookValue in-memory
    const enriched = data.map(a => ({
      ...a,
      netBookValue: Number(a.acquisitionCost) - Number(a.accumulatedDepreciation),
    }));

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const asset = await prisma.fixedAsset.findFirstOrThrow({
      where: { id, companyId },
      include: {
        depreciationEntries: { orderBy: { depreciationDate: 'desc' }, take: 60 },
        transfers: { orderBy: { transferDate: 'desc' } },
      },
    });
    return {
      ...asset,
      netBookValue: Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation),
    };
  }

  async create(companyId: string, data: any) {
    // Auto-generate asset number if not provided
    let assetNumber = data.assetNumber;
    if (!assetNumber) {
      const count = await prisma.fixedAsset.count({ where: { companyId } });
      assetNumber = `FA-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    }

    return prisma.fixedAsset.create({
      data: {
        companyId,
        propertyId: data.propertyId || null,
        assetNumber,
        name: data.name,
        category: data.category,
        description: data.description || null,
        acquisitionDate: new Date(data.acquisitionDate),
        acquisitionCost: data.acquisitionCost,
        usefulLifeYears: data.usefulLifeYears,
        residualValue: data.residualValue || 0,
        depreciationMethod: data.depreciationMethod || 'straight_line',
        decliningRate: data.decliningRate || null,
        currentLocation: data.currentLocation || null,
        responsiblePersonId: data.responsiblePersonId || null,
        glAssetAccountId: data.glAssetAccountId || null,
        glDepreciationAccountId: data.glDepreciationAccountId || null,
        glAccumDepAccountId: data.glAccumDepAccountId || null,
        serialNumber: data.serialNumber || null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        photoUrl: data.photoUrl || null,
      },
    });
  }

  async update(id: string, companyId: string, data: any) {
    await prisma.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
    return prisma.fixedAsset.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        description: data.description,
        currentLocation: data.currentLocation,
        responsiblePersonId: data.responsiblePersonId,
        serialNumber: data.serialNumber,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : undefined,
        photoUrl: data.photoUrl,
        glAssetAccountId: data.glAssetAccountId,
        glDepreciationAccountId: data.glDepreciationAccountId,
        glAccumDepAccountId: data.glAccumDepAccountId,
      },
    });
  }

  // ── Transfer ────────────────────────────────

  async transfer(id: string, companyId: string, userId: string, data: any) {
    const asset = await prisma.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
    if (asset.status !== 'active') throw new Error('Only active assets can be transferred');

    const [updatedAsset] = await prisma.$transaction([
      prisma.fixedAsset.update({
        where: { id },
        data: { propertyId: data.toPropertyId, currentLocation: data.currentLocation || null },
      }),
      prisma.assetTransfer.create({
        data: {
          assetId: id,
          fromPropertyId: asset.propertyId,
          toPropertyId: data.toPropertyId,
          transferDate: new Date(data.transferDate),
          reason: data.reason || null,
          transferredBy: userId,
        },
      }),
    ]);

    return updatedAsset;
  }

  // ── Dispose ─────────────────────────────────

  async dispose(id: string, companyId: string, data: any) {
    const asset = await prisma.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
    if (asset.status !== 'active') throw new Error('Only active assets can be disposed');

    return prisma.fixedAsset.update({
      where: { id },
      data: {
        status: 'disposed',
        disposalDate: new Date(data.disposalDate),
        disposalAmount: data.disposalAmount || 0,
      },
    });
  }

  // ── Depreciation ────────────────────────────

  async getDepreciationSchedule(id: string, companyId: string) {
    await prisma.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
    return prisma.depreciationEntry.findMany({
      where: { assetId: id },
      orderBy: { depreciationDate: 'asc' },
      include: { fiscalPeriod: { select: { name: true } } },
    });
  }

  async runDepreciation(companyId: string, userId: string) {
    // Find current open fiscal period
    const now = new Date();
    const period = await prisma.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: now }, endDate: { gte: now }, status: 'open' },
    });
    if (!period) throw new Error('No open fiscal period for current date');

    // Find active assets that haven't been depreciated this period
    const assets = await prisma.fixedAsset.findMany({
      where: {
        companyId,
        status: 'active',
        depreciationEntries: { none: { fiscalPeriodId: period.id } },
      },
    });

    let totalDepreciated = 0;
    const results: any[] = [];

    for (const asset of assets) {
      const nbv = Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation);
      if (nbv <= Number(asset.residualValue)) continue;

      const amount = this.calculateMonthlyDepreciation(asset);
      if (amount <= 0) continue;

      const capped = Math.min(amount, nbv - Number(asset.residualValue));
      const nbvAfter = nbv - capped;

      // Create depreciation entry
      await prisma.depreciationEntry.create({
        data: {
          assetId: asset.id,
          fiscalPeriodId: period.id,
          depreciationDate: now,
          amount: capped,
          netBookValueAfter: nbvAfter,
        },
      });

      // Update accumulated depreciation
      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { accumulatedDepreciation: Number(asset.accumulatedDepreciation) + capped },
      });

      totalDepreciated += capped;
      results.push({
        assetNumber: asset.assetNumber,
        name: asset.name,
        amount: capped,
        nbvAfter,
      });
    }

    logger.info(`Depreciation run: ${results.length} assets, total ${totalDepreciated} for period ${period.name}`);

    return {
      periodName: period.name,
      assetsProcessed: results.length,
      totalDepreciation: totalDepreciated,
      details: results,
    };
  }

  private calculateMonthlyDepreciation(asset: any): number {
    if (asset.depreciationMethod === 'straight_line') {
      const depreciableAmount = Number(asset.acquisitionCost) - Number(asset.residualValue);
      return depreciableAmount / (Number(asset.usefulLifeYears) * 12);
    } else {
      // Declining balance
      const nbv = Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation);
      return nbv * (Number(asset.decliningRate || 0) / 12);
    }
  }
}

export const assetsService = new AssetsService();
