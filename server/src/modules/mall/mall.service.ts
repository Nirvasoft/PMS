import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { invoicesService } from '../billing/invoices.service';
import { logger } from '../../common/logger';

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

  async listAvailableUnits(companyId: string, propertyId: string) {
    return prisma.unit.findMany({
      where: {
        companyId,
        propertyId,
        isActive: true,
        shopProfile: { is: null }, // units without a shop profile
      },
      select: {
        id: true,
        unitNumber: true,
        unitType: true,
        floorLabel: true,
        floorNumber: true,
        areaSqft: true,
        status: true,
      },
      orderBy: { unitNumber: 'asc' },
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
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, companyId },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!lease) throw AppError.notFound('Lease');

    const mapped: any = { ...data };
    if (data.fitOutStartDate) mapped.fitOutStartDate = new Date(data.fitOutStartDate);
    if (data.fitOutEndDate) mapped.fitOutEndDate = new Date(data.fitOutEndDate);

    // Exclusivity enforcement: check for conflicts
    let exclusivityWarning: string | null = null;
    if (data.exclusivityCategory) {
      const conflicting = await prisma.commercialLease.findMany({
        where: {
          companyId,
          exclusivityCategory: data.exclusivityCategory,
          leaseId: { not: leaseId },
          lease: { status: 'active', propertyId: lease.propertyId },
        },
        include: {
          lease: {
            select: { leaseNumber: true, tenant: { select: { companyName: true } }, unit: { select: { unitNumber: true } } },
          },
        },
      });

      if (conflicting.length > 0) {
        const conflicts = conflicting.map(c =>
          `${c.lease.tenant?.companyName || 'Unknown'} (Unit ${c.lease.unit?.unitNumber}, Lease ${c.lease.leaseNumber})`
        ).join('; ');
        exclusivityWarning = `Exclusivity conflict for "${data.exclusivityCategory}": ${conflicts}`;
        logger.warn(`Exclusivity conflict on property ${lease.property?.name}: ${exclusivityWarning}`);
      }
    }

    const result = await prisma.commercialLease.upsert({
      where: { leaseId },
      create: { leaseId, companyId, ...mapped },
      update: mapped,
    });

    return { ...result, exclusivityWarning };
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

    const submission = await prisma.gtoSubmission.create({
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

    // Generate supplementary invoice for percentage rent if > 0
    if (percentageRent > 0.01) {
      try {
        // Find or create PERCENTAGE_RENT charge type
        let chargeType = await prisma.chargeType.findFirst({
          where: { code: 'PERCENTAGE_RENT' },
        });
        if (!chargeType) {
          chargeType = await prisma.chargeType.create({
            data: {
              code: 'PERCENTAGE_RENT',
              name: 'Percentage Rent',
              category: 'rent',
              glAccountCode: '4100',
              isTaxable: false,
              isSystem: true,
              companyId: null,
            },
          });
        }

        const monthName = new Date(2025, data.submissionMonth - 1).toLocaleString('default', { month: 'long' });
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 14);

        const invoice = await invoicesService.createManual(
          companyId,
          {
            propertyId: data.propertyId,
            unitId: data.unitId,
            tenantId: data.tenantId,
            leaseId: data.leaseId,
            invoiceDate: today.toISOString().split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            currency: data.currency || 'USD',
            notes: `Percentage rent — ${monthName} ${data.submissionYear} (GTO: ${data.currency || 'USD'} ${Number(data.grossTurnover).toLocaleString()})`,
            lines: [{
              chargeTypeId: chargeType.id,
              description: `Percentage Rent — ${monthName} ${data.submissionYear} (GTO above breakpoint: ${data.currency || 'USD'} ${gtoAboveBreakpoint?.toLocaleString()})`,
              quantity: 1,
              unitPrice: percentageRent,
              taxRate: 0,
            }],
          },
          submittedBy,
        );

        // Link invoice to GTO submission
        await prisma.gtoSubmission.update({
          where: { id: submission.id },
          data: { invoiceId: invoice.id },
        });

        logger.info(`GTO submission ${submission.id}: Created percentage rent invoice ${invoice.invoiceNumber} for ${data.currency || 'USD'} ${percentageRent.toFixed(2)}`);

        return { ...submission, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
      } catch (err: any) {
        logger.error(`GTO submission ${submission.id}: Failed to create percentage rent invoice: ${err.message}`);
        // Return the submission even if invoice creation fails — don't block the GTO
      }
    }

    return submission;
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
    const gto = await prisma.gtoSubmission.findFirst({
      where: { id, companyId },
      include: { unit: { include: { shopProfile: true } } },
    });
    if (!gto) throw AppError.notFound('GTO submission');

    let posValidated = false;
    let variancePct = data.variancePct ?? null;

    // Auto POS cross-validation:
    // If the shop has a POS system configured, compare sales breakdown vs GTO total
    if (gto.unit?.shopProfile?.posSystem) {
      const salesBreakdown = [
        Number(gto.cashSales || 0),
        Number(gto.cardSales || 0),
        Number(gto.onlineSales || 0),
        Number(gto.otherSales || 0),
      ];
      const breakdownTotal = salesBreakdown.reduce((s, v) => s + v, 0);
      const reportedGto = Number(gto.grossTurnover);

      if (breakdownTotal > 0 && reportedGto > 0) {
        // Calculate variance between sum of sales channels and reported total
        variancePct = Math.abs((breakdownTotal - reportedGto) / reportedGto);
        posValidated = variancePct <= 0.05; // within 5% = POS validated

        logger.info(
          `GTO ${id} POS cross-check: breakdown=${breakdownTotal}, reported=${reportedGto}, ` +
          `variance=${(variancePct * 100).toFixed(2)}%, validated=${posValidated}`
        );
      }
    }

    return prisma.gtoSubmission.update({
      where: { id },
      data: {
        verified: data.verified,
        verifiedBy,
        verifiedAt: new Date(),
        variancePct: variancePct !== null ? variancePct : undefined,
        posValidated,
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

  async getPendingGtoAlerts(propertyId: string, companyId: string, month: number, year: number) {
    // Get all leases requiring GTO reporting
    const requiredLeases = await prisma.commercialLease.findMany({
      where: {
        companyId,
        turnoverReportingRequired: true,
        lease: { status: 'active', propertyId },
      },
      include: {
        lease: {
          select: {
            id: true, leaseNumber: true, tenantId: true,
            tenant: { select: { id: true, companyName: true, firstName: true, lastName: true } },
            unit: { select: { id: true, unitNumber: true } },
          },
        },
      },
    });

    // Get already submitted
    const submitted = await prisma.gtoSubmission.findMany({
      where: { propertyId, companyId, submissionMonth: month, submissionYear: year },
      select: { leaseId: true },
    });
    const submittedLeaseIds = new Set(submitted.map(s => s.leaseId));

    const now = new Date();
    const alerts = requiredLeases
      .filter(cl => !submittedLeaseIds.has(cl.leaseId))
      .map(cl => {
        const dueDay = cl.gtoReportingDay || 15;
        const dueDate = new Date(year, month - 1, dueDay);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
        const isOverdue = daysUntilDue < 0;
        const tenantName = cl.lease.tenant?.companyName ||
          `${cl.lease.tenant?.firstName || ''} ${cl.lease.tenant?.lastName || ''}`.trim() || 'Unknown';

        return {
          leaseId: cl.leaseId,
          leaseNumber: cl.lease.leaseNumber,
          unitNumber: cl.lease.unit?.unitNumber,
          unitId: cl.lease.unit?.id,
          tenantId: cl.lease.tenantId,
          tenantName,
          gtoReportingDay: dueDay,
          dueDate: dueDate.toISOString(),
          daysUntilDue,
          isOverdue,
          severity: isOverdue ? 'critical' : daysUntilDue <= 3 ? 'warning' : 'info',
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue); // most urgent first

    return { month, year, alerts, totalPending: alerts.length };
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

  /**
   * Generate monthly CAM billings for all active pools in a property.
   * For each pool × each active unit: allocate monthly cost proportionate to GLA.
   * Auto-creates invoices via billing engine for each allocation.
   */
  async generateCamBillings(companyId: string, propertyId: string, month: number, year: number) {
    const mall = await prisma.mallProperty.findFirst({ where: { propertyId, companyId } });
    const adminFeePct = mall ? Number(mall.camAdminFeePct) : 0.10;

    const pools = await prisma.camCostPool.findMany({
      where: { companyId, propertyId, year, isActive: true },
    });
    if (!pools.length) throw AppError.badRequest('No active CAM pools for this property/year');

    // Active units with CAM-included commercial leases
    const units = await prisma.unit.findMany({
      where: {
        propertyId, companyId, isActive: true,
        leases: {
          some: {
            status: 'active',
            commercialLease: { camIncluded: true },
          },
        },
      },
      include: {
        leases: {
          where: { status: 'active' },
          take: 1,
          include: { commercialLease: true },
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!units.length) throw AppError.badRequest('No active units with CAM-included leases');

    const totalGla = units.reduce((sum, u) => sum + (Number(u.areaSqft) || 0), 0);
    if (totalGla === 0) throw AppError.badRequest('Total GLA is zero — cannot allocate');

    // Get or create CAM_CHARGE charge type for invoicing
    const camChargeType = await this.getOrCreateChargeType('CAM_CHARGE', 'CAM Charge', 'cam');

    const results: any[] = [];
    let invoiceCount = 0;

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30);

    for (const pool of pools) {
      const monthlyPoolAmount = Number(pool.budgetedAmount) / 12;
      const adminFeeTotal = monthlyPoolAmount * adminFeePct;
      const totalPoolCost = monthlyPoolAmount + adminFeeTotal;

      for (const unit of units) {
        const lease = unit.leases[0];
        if (!lease) continue;

        // Skip units in fit-out period (rent-free)
        const cl = lease.commercialLease;
        if (cl?.fitOutRentFree && cl.fitOutStartDate && cl.fitOutEndDate) {
          const billingDate = new Date(year, month - 1, 1);
          if (billingDate >= cl.fitOutStartDate && billingDate <= cl.fitOutEndDate) {
            logger.info(`Skipping CAM billing for unit ${unit.id} — in fit-out period (${cl.fitOutStartDate.toISOString().split('T')[0]} to ${cl.fitOutEndDate.toISOString().split('T')[0]})`);
            continue;
          }
        }

        const unitGla = Number(unit.areaSqft) || 0;
        const allocationPct = unitGla / totalGla;
        const allocatedAmount = Math.round(totalPoolCost * allocationPct * 100) / 100;
        const adminFee = Math.round(adminFeeTotal * allocationPct * 100) / 100;

        const billing = await prisma.camBilling.upsert({
          where: {
            uq_cam_billing: {
              poolId: pool.id, unitId: unit.id,
              billingMonth: month, billingYear: year,
            },
          },
          update: { unitGlaSqft: unitGla, totalGlaSqft: totalGla, allocationPct, poolAmount: totalPoolCost, adminFee, allocatedAmount },
          create: {
            companyId, propertyId, poolId: pool.id, unitId: unit.id,
            tenantId: lease.tenantId, leaseId: lease.id,
            billingMonth: month, billingYear: year,
            unitGlaSqft: unitGla, totalGlaSqft: totalGla,
            allocationPct, poolAmount: totalPoolCost, adminFee, allocatedAmount,
            status: 'pending',
          },
        });

        // Generate invoice for this CAM billing if not already invoiced
        if (!billing.invoiceId && allocatedAmount > 0) {
          try {
            const invoice = await invoicesService.createManual(
              companyId,
              {
                propertyId,
                unitId: unit.id,
                tenantId: lease.tenantId,
                leaseId: lease.id,
                invoiceDate: today.toISOString().split('T')[0],
                dueDate: dueDate.toISOString().split('T')[0],
                currency: 'USD',
                notes: `CAM Charge — ${pool.name} (${monthName} ${year})`,
                lines: [{
                  chargeTypeId: camChargeType.id,
                  description: `CAM Charge — ${pool.name} (${monthName} ${year}), GLA: ${unitGla} sqft, Allocation: ${(allocationPct * 100).toFixed(2)}%`,
                  quantity: 1,
                  unitPrice: allocatedAmount,
                  taxRate: 0,
                }],
              },
              '00000000-0000-0000-0000-000000000000', // system user
            );

            await prisma.camBilling.update({
              where: { id: billing.id },
              data: { invoiceId: invoice.id, status: 'invoiced' },
            });

            invoiceCount++;
            logger.info(`CAM billing ${billing.id}: Invoice ${invoice.invoiceNumber} created for ${allocatedAmount.toFixed(2)}`);
          } catch (err: any) {
            logger.error(`CAM billing ${billing.id}: Failed to create invoice: ${err.message}`);
          }
        }

        results.push(billing);
      }
    }

    return { generated: results.length, invoicesCreated: invoiceCount, pools: pools.length, units: units.length, totalGla, month, year };
  }


  /**
   * Annual CAM reconciliation: compare estimated monthly billings vs actual cost per pool/unit.
   * variance = (actual_pool_cost × allocation%) − sum(monthly_billings)
   * Auto-creates debit/credit note invoices for variance > $1.
   */
  async runCamReconciliation(companyId: string, propertyId: string, year: number) {
    const mall = await prisma.mallProperty.findFirst({ where: { propertyId, companyId } });
    const adminFeePct = mall ? Number(mall.camAdminFeePct) : 0.10;

    const pools = await prisma.camCostPool.findMany({ where: { companyId, propertyId, year } });
    if (!pools.length) throw AppError.badRequest('No CAM pools found for this year');

    const camReconChargeType = await this.getOrCreateChargeType('CAM_RECONCILIATION', 'CAM Reconciliation Adjustment', 'cam');

    const results: any[] = [];
    let invoiceCount = 0;
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30);

    for (const pool of pools) {
      const billings = await prisma.camBilling.findMany({
        where: { poolId: pool.id, billingYear: year },
        include: { unit: { select: { id: true } } },
      });

      const byUnit = new Map<string, typeof billings>();
      for (const b of billings) {
        if (!byUnit.has(b.unitId)) byUnit.set(b.unitId, []);
        byUnit.get(b.unitId)!.push(b);
      }

      for (const [unitId, unitBillings] of byUnit) {
        const totalEstimated = unitBillings.reduce((s, b) => s + Number(b.allocatedAmount), 0);
        const allocationPct = Number(unitBillings[0].allocationPct);
        const totalActual = Number(pool.actualAmount) * (1 + adminFeePct) * allocationPct;
        const variance = Math.round((totalActual - totalEstimated) * 100) / 100;

        const recon = await prisma.camReconciliation.upsert({
          where: { uq_cam_recon: { poolId: pool.id, unitId, reconYear: year } },
          update: { totalEstimated, totalActual, variance, status: 'draft' },
          create: {
            companyId, propertyId, poolId: pool.id, unitId,
            tenantId: unitBillings[0].tenantId,
            reconYear: year, totalEstimated, totalActual, variance, status: 'draft',
          },
        });

        const action = variance > 1 ? 'debit_note' : variance < -1 ? 'credit_note' : 'none';

        // Create debit/credit note invoice for significant variance (> $1)
        if (action !== 'none' && !recon.invoiceId) {
          try {
            const absVariance = Math.abs(variance);
            const noteType = action === 'debit_note' ? 'Debit Note' : 'Credit Note';
            const invoice = await invoicesService.createManual(
              companyId,
              {
                propertyId,
                unitId,
                tenantId: unitBillings[0].tenantId,
                leaseId: unitBillings[0].leaseId,
                invoiceDate: today.toISOString().split('T')[0],
                dueDate: dueDate.toISOString().split('T')[0],
                currency: 'USD',
                notes: `CAM Reconciliation ${noteType} — ${pool.name} (FY${year}). Estimated: $${totalEstimated.toFixed(2)}, Actual: $${totalActual.toFixed(2)}`,
                lines: [{
                  chargeTypeId: camReconChargeType.id,
                  description: `CAM Reconciliation ${noteType} — ${pool.name} (FY${year}), Variance: $${variance.toFixed(2)}`,
                  quantity: 1,
                  unitPrice: action === 'debit_note' ? absVariance : -absVariance,
                  taxRate: 0,
                }],
              },
              '00000000-0000-0000-0000-000000000000', // system user
            );

            await prisma.camReconciliation.update({
              where: { id: recon.id },
              data: { invoiceId: invoice.id, status: 'finalized' },
            });

            invoiceCount++;
            logger.info(`CAM recon ${recon.id}: ${noteType} invoice ${invoice.invoiceNumber} for $${absVariance.toFixed(2)}`);
          } catch (err: any) {
            logger.error(`CAM recon ${recon.id}: Failed to create ${action} invoice: ${err.message}`);
          }
        }

        results.push({ ...recon, action });
      }
    }

    return {
      year,
      reconciliations: results.length,
      invoicesCreated: invoiceCount,
      totalVariance: results.reduce((s, r) => s + Number(r.variance), 0),
      data: results,
    };
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

    // Recalculate total if dates or rate changed
    const startDate = data.startDate ? new Date(data.startDate) : booth.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : booth.endDate;
    const dailyRate = data.dailyRate !== undefined ? Number(data.dailyRate) : Number(booth.dailyRate || 0);

    if (data.startDate || data.endDate || data.dailyRate !== undefined) {
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      data.totalAmount = dailyRate > 0 ? dailyRate * days : null;
    }
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);

    return prisma.boothRental.update({
      where: { id },
      data,
      include: { tenant: { select: { id: true, firstName: true, lastName: true, companyName: true } } },
    });
  }

  async invoiceBooth(boothId: string, companyId: string, userId: string) {
    const booth = await prisma.boothRental.findFirst({
      where: { id: boothId, companyId },
      include: { event: true },
    });
    if (!booth) throw AppError.notFound('Booth');
    if (booth.invoiceId) throw AppError.badRequest('Booth already invoiced');
    if (!booth.tenantId) throw AppError.badRequest('Booth must have a tenant before invoicing');
    if (!booth.totalAmount || Number(booth.totalAmount) <= 0) {
      throw AppError.badRequest('Booth has no billable amount');
    }

    // Find or create BOOTH_RENTAL charge type
    let chargeType = await prisma.chargeType.findFirst({
      where: { code: 'BOOTH_RENTAL', companyId: { in: [companyId, null as any] } },
    });
    if (!chargeType) {
      chargeType = await prisma.chargeType.create({
        data: { companyId, code: 'BOOTH_RENTAL', name: 'Booth Rental', category: 'revenue', isSystem: true },
      });
    }

    const days = Math.ceil(
      (new Date(booth.endDate).getTime() - new Date(booth.startDate).getTime()) / 86400000
    ) + 1;

    const invoice = await invoicesService.createManual(companyId, {
      propertyId: booth.propertyId,
      tenantId: booth.tenantId,
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      periodFrom: booth.startDate.toISOString(),
      periodTo: booth.endDate.toISOString(),
      notes: `Booth ${booth.boothNumber} rental for "${booth.event.title}" (${days} days)`,
      lines: [{
        chargeTypeId: chargeType.id,
        description: `Booth ${booth.boothNumber} — ${booth.event.title} (${booth.startDate.toISOString().split('T')[0]} to ${booth.endDate.toISOString().split('T')[0]})`,
        quantity: days,
        unitPrice: Number(booth.dailyRate || 0),
        taxRate: 0,
      }],
    }, userId);

    // Link invoice to booth and update status
    await prisma.boothRental.update({
      where: { id: boothId },
      data: { invoiceId: invoice.id, status: 'invoiced' },
    });

    return { booth: { ...booth, invoiceId: invoice.id, status: 'invoiced' }, invoice };
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
    return prisma.footfallSensor.update({
      where: { id },
      data,
      include: { _count: { select: { counts: true } } },
    });
  }

  async deleteSensor(id: string, companyId: string) {
    const sensor = await prisma.footfallSensor.findFirst({
      where: { id, companyId },
      include: { _count: { select: { counts: true } } },
    });
    if (!sensor) throw AppError.notFound('Sensor');

    // If sensor has count data, soft-delete by deactivating
    if (sensor._count.counts > 0) {
      await prisma.footfallSensor.update({
        where: { id },
        data: { isActive: false },
      });
      return { deleted: false, deactivated: true, reason: `Sensor has ${sensor._count.counts} count records — deactivated instead of deleted` };
    }

    await prisma.footfallSensor.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  async toggleSensorActive(id: string, companyId: string) {
    const sensor = await prisma.footfallSensor.findFirst({ where: { id, companyId } });
    if (!sensor) throw AppError.notFound('Sensor');
    return prisma.footfallSensor.update({
      where: { id },
      data: { isActive: !sensor.isActive },
    });
  }

  async syncFootfallSensor(sensorId: string, companyId: string) {
    const sensor = await prisma.footfallSensor.findFirst({
      where: { id: sensorId, companyId },
    });
    if (!sensor) throw AppError.notFound('Sensor');
    if (!sensor.isActive) throw AppError.badRequest('Sensor is inactive — activate it first');

    // ── STUB: In production, call sensor.apiEndpoint with sensor.apiKeyEnc ──
    // For now, generate a simulated count for the current hour
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Check if already synced this hour
    const existing = await prisma.footfallCount.findFirst({
      where: { sensorId, countedAt: hourStart, periodType: 'hourly' },
    });

    if (existing) {
      return {
        synced: false,
        message: `Already synced for ${hourStart.toISOString()} — next sync available at next hour`,
        lastCount: existing,
      };
    }

    // Stub: simulate realistic-ish counts
    const baseEntries = Math.floor(Math.random() * 200) + 50;
    const baseExits = Math.floor(baseEntries * (0.8 + Math.random() * 0.3));

    const count = await prisma.footfallCount.create({
      data: {
        companyId,
        sensorId,
        propertyId: sensor.propertyId,
        countedAt: hourStart,
        periodType: 'hourly',
        entries: baseEntries,
        exits: baseExits,
        zone: sensor.zone,
      },
    });

    logger.info(`Footfall sync: sensor ${sensor.name} (${sensor.sensorId}) — ${baseEntries} entries, ${baseExits} exits`);

    return {
      synced: true,
      sensorName: sensor.name,
      hour: hourStart.toISOString(),
      entries: baseEntries,
      exits: baseExits,
      count,
    };
  }

  async syncAllFootfallSensors(companyId: string, propertyId: string) {
    const sensors = await prisma.footfallSensor.findMany({
      where: { companyId, propertyId, isActive: true },
    });

    const results: any[] = [];
    let synced = 0;
    let skipped = 0;

    for (const sensor of sensors) {
      try {
        const result = await this.syncFootfallSensor(sensor.id, companyId);
        results.push({ sensorId: sensor.id, name: sensor.name, ...result });
        if (result.synced) synced++;
        else skipped++;
      } catch (err: any) {
        results.push({ sensorId: sensor.id, name: sensor.name, synced: false, error: err.message });
        skipped++;
      }
    }

    return {
      totalSensors: sensors.length,
      synced,
      skipped,
      results,
    };
  }

  // ═══════════════════════════════════════
  //  FOOTFALL DATA QUERIES
  // ═══════════════════════════════════════

  async getFootfallDaily(companyId: string, propertyId: string, date: string) {
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    const counts = await prisma.footfallCount.findMany({
      where: { companyId, propertyId, countedAt: { gte: dayStart, lte: dayEnd }, periodType: 'hourly' },
      orderBy: { countedAt: 'asc' },
      include: { sensor: { select: { name: true, zone: true } } },
    });

    // By hour
    const byHour: { hour: string; entries: number; exits: number }[] = [];
    const hourMap = new Map<number, { entries: number; exits: number }>();
    for (const c of counts) {
      const h = c.countedAt.getUTCHours();
      const existing = hourMap.get(h) || { entries: 0, exits: 0 };
      existing.entries += c.entries;
      existing.exits += c.exits;
      hourMap.set(h, existing);
    }
    for (let h = 0; h < 24; h++) {
      const data = hourMap.get(h) || { entries: 0, exits: 0 };
      byHour.push({ hour: `${String(h).padStart(2, '0')}:00`, ...data });
    }

    // By zone
    const zoneMap = new Map<string, { entries: number; exits: number }>();
    for (const c of counts) {
      const z = c.zone || c.sensor?.zone || 'unknown';
      const existing = zoneMap.get(z) || { entries: 0, exits: 0 };
      existing.entries += c.entries;
      existing.exits += c.exits;
      zoneMap.set(z, existing);
    }
    const byZone = Array.from(zoneMap.entries()).map(([zone, data]) => ({ zone, ...data }));

    const totalEntries = counts.reduce((s, c) => s + c.entries, 0);
    const totalExits = counts.reduce((s, c) => s + c.exits, 0);

    // Peak hour
    let peakHour = '00:00';
    let peakHourCount = 0;
    for (const h of byHour) {
      if (h.entries > peakHourCount) { peakHour = h.hour; peakHourCount = h.entries; }
    }

    return { date, totalEntries, totalExits, peakHour, peakHourCount, byHour, byZone };
  }

  async getFootfallTrend(companyId: string, propertyId: string, from: string, to: string) {
    const startDate = new Date(from + 'T00:00:00Z');
    const endDate = new Date(to + 'T23:59:59Z');

    const counts = await prisma.footfallCount.findMany({
      where: { companyId, propertyId, countedAt: { gte: startDate, lte: endDate }, periodType: 'hourly' },
      orderBy: { countedAt: 'asc' },
    });

    // Group by date
    const dayMap = new Map<string, { entries: number; exits: number }>();
    for (const c of counts) {
      const dateKey = c.countedAt.toISOString().split('T')[0];
      const existing = dayMap.get(dateKey) || { entries: 0, exits: 0 };
      existing.entries += c.entries;
      existing.exits += c.exits;
      dayMap.set(dateKey, existing);
    }

    const daily = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data, net: data.entries - data.exits }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalEntries = daily.reduce((s, d) => s + d.entries, 0);
    const totalExits = daily.reduce((s, d) => s + d.exits, 0);
    const avgDaily = daily.length ? Math.round(totalEntries / daily.length) : 0;

    return { from, to, days: daily.length, totalEntries, totalExits, avgDaily, daily };
  }

  async getFootfallHeatmap(companyId: string, propertyId: string, date: string, hour: number) {
    const hourStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
    const hourEnd = new Date(`${date}T${String(hour).padStart(2, '0')}:59:59Z`);

    const counts = await prisma.footfallCount.findMany({
      where: { companyId, propertyId, countedAt: { gte: hourStart, lte: hourEnd } },
      include: { sensor: { select: { zone: true, floor: true, name: true, location: true } } },
    });

    const zoneMap = new Map<string, { entries: number; exits: number; floor: string; sensors: string[] }>();
    for (const c of counts) {
      const z = c.zone || c.sensor?.zone || 'unknown';
      const existing = zoneMap.get(z) || { entries: 0, exits: 0, floor: c.sensor?.floor || '', sensors: [] };
      existing.entries += c.entries;
      existing.exits += c.exits;
      if (c.sensor?.name && !existing.sensors.includes(c.sensor.name)) existing.sensors.push(c.sensor.name);
      zoneMap.set(z, existing);
    }

    const maxEntries = Math.max(...Array.from(zoneMap.values()).map(v => v.entries), 1);
    const zones = Array.from(zoneMap.entries()).map(([zone, data]) => ({
      zone, ...data, intensity: Math.round((data.entries / maxEntries) * 100),
    }));

    return { date, hour, zones };
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

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════

  /**
   * Find or create a system-level ChargeType by code.
   * Used by CAM billing and reconciliation to auto-create invoices.
   */
  private async getOrCreateChargeType(code: string, name: string, category: string) {
    let chargeType = await prisma.chargeType.findFirst({ where: { code } });
    if (!chargeType) {
      chargeType = await prisma.chargeType.create({
        data: { code, name, category, glAccountCode: '4100', isTaxable: false, isSystem: true, companyId: null },
      });
      logger.info(`Created system charge type: ${code} (${name})`);
    }
    return chargeType;
  }

  // ═══════════════════════════════════════
  //  POS INTEGRATION
  // ═══════════════════════════════════════

  async getPosConfig(companyId: string, propertyId: string) {
    const shops = await prisma.shopProfile.findMany({
      where: { companyId, propertyId, posSystem: { not: null } },
      include: {
        unit: {
          select: {
            unitNumber: true,
            leases: {
              where: { status: 'active' },
              select: { id: true, leaseNumber: true, tenant: { select: { companyName: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { unit: { unitNumber: 'asc' } },
    });

    return shops.map(s => ({
      id: s.unitId, unitId: s.unitId, unitNumber: s.unit.unitNumber,
      brandName: s.brandName, tenant: s.unit.leases[0]?.tenant?.companyName || null,
      leaseId: s.unit.leases[0]?.id || null, leaseNumber: s.unit.leases[0]?.leaseNumber || null,
      posSystem: s.posSystem, posStoreId: s.posStoreId, tradeCategory: s.tradeCategory,
    }));
  }

  async ingestPosSales(companyId: string, data: {
    propertyId: string; unitId: string; posSystem: string; salesDate: string;
    cashSales: number; cardSales: number; onlineSales: number; otherSales: number;
  }) {
    const shop = await prisma.shopProfile.findFirst({
      where: { companyId, unitId: data.unitId, posSystem: data.posSystem },
    });
    if (!shop) throw AppError.notFound('Shop with matching POS system');

    const date = new Date(data.salesDate);
    const totalSales = (data.cashSales || 0) + (data.cardSales || 0) + (data.onlineSales || 0) + (data.otherSales || 0);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const lease = await prisma.lease.findFirst({
      where: { companyId, unitId: data.unitId, status: 'active' },
      include: { tenant: { select: { id: true } } },
    });
    if (!lease) throw AppError.badRequest('No active lease for this unit');

    let gto = await prisma.gtoSubmission.findFirst({
      where: { companyId, unitId: data.unitId, leaseId: lease.id, submissionMonth: month, submissionYear: year },
    });

    if (gto && gto.submissionMethod !== 'pos_sync') {
      const posTotal = totalSales;
      const gtoTotal = Number(gto.grossTurnover);
      const variance = gtoTotal > 0 ? Math.abs((posTotal - gtoTotal) / gtoTotal) : 0;
      return {
        action: 'variance_check', posTotal, gtoTotal, variancePct: variance,
        withinThreshold: variance <= 0.05,
        message: `GTO already submitted manually. POS: $${posTotal.toLocaleString()}, GTO: $${gtoTotal.toLocaleString()}, variance: ${(variance * 100).toFixed(1)}%`,
      };
    }

    if (gto && gto.submissionMethod === 'pos_sync') {
      const updated = await prisma.gtoSubmission.update({
        where: { id: gto.id },
        data: {
          cashSales: { increment: data.cashSales || 0 },
          cardSales: { increment: data.cardSales || 0 },
          onlineSales: { increment: data.onlineSales || 0 },
          otherSales: { increment: data.otherSales || 0 },
          grossTurnover: { increment: totalSales },
          notes: `POS sync — last updated ${new Date().toISOString()} (${data.salesDate})`,
        },
      });
      logger.info(`POS ingested: unit ${data.unitId} $${totalSales} on ${data.salesDate}`);
      return { action: 'accumulated', gtoId: updated.id, dailySales: totalSales, newGrossTotal: Number(updated.grossTurnover), date: data.salesDate };
    }

    // Create new POS-synced GTO
    const commLease = await prisma.commercialLease.findFirst({ where: { leaseId: lease.id } });
    const baseRent = Number(lease.rentAmount) || 0;
    const percentageRate = commLease ? Number(commLease.percentageRentRate) : 0;
    const naturalBreakpoint = commLease ? Number(commLease.baseRentPctThreshold) : 0;
    const gtoAboveBreakpoint = Math.max(0, totalSales - naturalBreakpoint);
    const percentageRent = gtoAboveBreakpoint * (percentageRate / 100);
    const totalRentDue = Math.max(baseRent, baseRent + percentageRent);

    const newGto = await prisma.gtoSubmission.create({
      data: {
        companyId, propertyId: data.propertyId, unitId: data.unitId,
        leaseId: lease.id, tenantId: lease.tenant.id,
        submissionMonth: month, submissionYear: year,
        grossTurnover: totalSales, cashSales: data.cashSales || 0,
        cardSales: data.cardSales || 0, onlineSales: data.onlineSales || 0,
        otherSales: data.otherSales || 0, submissionMethod: 'pos_sync',
        submittedBy: lease.tenant.id, baseRent, naturalBreakpoint: naturalBreakpoint || null,
        gtoAboveBreakpoint, percentageRent, totalRentDue,
        posValidated: true,
        notes: `Auto-submitted via POS sync (${data.posSystem}) on ${new Date().toISOString()}`,
      },
    });
    logger.info(`POS auto-created GTO: unit ${data.unitId}, ${month}/${year}: $${totalSales}`);
    return { action: 'created', gtoId: newGto.id, dailySales: totalSales, grossTurnover: totalSales, month, year };
  }

  async getPosSalesHistory(companyId: string, propertyId: string, month: number, year: number) {
    const submissions = await prisma.gtoSubmission.findMany({
      where: { companyId, propertyId, submissionMonth: month, submissionYear: year },
      include: {
        unit: { select: { unitNumber: true, shopProfile: { select: { posSystem: true, posStoreId: true, brandName: true } } } },
        tenant: { select: { companyName: true } },
      },
      orderBy: { unit: { unitNumber: 'asc' } },
    });

    return submissions.map(s => ({
      id: s.id, unitNumber: s.unit.unitNumber,
      brandName: s.unit.shopProfile?.brandName || null,
      tenant: s.tenant?.companyName || null,
      posSystem: s.unit.shopProfile?.posSystem || null,
      posStoreId: s.unit.shopProfile?.posStoreId || null,
      submissionMethod: s.submissionMethod,
      grossTurnover: Number(s.grossTurnover),
      cashSales: Number(s.cashSales || 0), cardSales: Number(s.cardSales || 0),
      onlineSales: Number(s.onlineSales || 0), otherSales: Number(s.otherSales || 0),
      posValidated: s.posValidated,
      variancePct: s.variancePct ? Number(s.variancePct) : null,
      verified: s.verified,
    }));
  }
}

export const mallService = new MallService();
