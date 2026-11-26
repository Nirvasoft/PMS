import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { unitsService } from '../units/units.service';
import { clearShopIdentityOp } from '../mall/shopProfileReset';
import { isAccountingIntegrationActive } from '../integrations/v6Status.helper';
import { calcLeaseTermMonths, getBillingCycleMonths } from '../leases/services/helpers';
import {
  resolveChargeCategoryMap,
  isCategoryMonthly,
  getCategoryDisplayName,
  findLeaseRentChargeType,
  findLeaseDepositChargeType,
} from './chargeCategory.helper';

export class BillingSchedulesService {
  // Fields every schedule spawned from an activated lease shares (RENT, SERVICE_CHARGE,
  // and any future auto-created charge) — only chargeTypeId/description/amount/proration
  // differ per charge.
  private leaseScheduleBase(lease: any, startDate: Date, billingDay: number) {
    return {
      companyId: lease.companyId,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      leaseId: lease.id,
      quantity: 1,
      currency: lease.currency || 'USD',
      currencyRate: lease.currencyRate,
      billingCycle: lease.billingCycle || 'monthly',
      billingDay,
      paymentDueDays: lease.paymentDueDays || 7,
      startDate,
      endDate: lease.endDate ? new Date(lease.endDate) : null,
      nextBillingDate: startDate,
    };
  }

  async findAll(companyId: string, filters: {
    leaseId?: string; tenantId?: string; propertyId?: string; unitId?: string; status?: string; currency?: string; billingCycle?: string; search?: string; dueAsOf?: string; page?: number; limit?: number;
  }) {
    const { leaseId, tenantId, propertyId, unitId, status, currency, billingCycle, search, dueAsOf, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (dueAsOf) {
      where.nextBillingDate = { lte: new Date(dueAsOf) };
      where.AND = [{ OR: [{ leaseId: null }, { lease: { status: 'active', deletedAt: null } }] }];
    }
    if (leaseId) where.leaseId = leaseId;
    if (tenantId) where.tenantId = tenantId;
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (billingCycle) where.billingCycle = billingCycle;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { tenant: { firstName: { contains: q, mode: 'insensitive' } } },
        { tenant: { lastName: { contains: q, mode: 'insensitive' } } },
        { tenant: { companyName: { contains: q, mode: 'insensitive' } } },
        { unit: { unitNumber: { contains: q, mode: 'insensitive' } } },
        { lease: { leaseNumber: { contains: q, mode: 'insensitive' } } },
        { chargeType: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [rawData, total] = await Promise.all([
      prisma.billingSchedule.findMany({
        where,
        include: {
          chargeType: { select: { id: true, code: true, name: true, category: true, glAccountCode: true, departmentCenterId: true, costCenterId: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
          property: { select: { id: true, name: true } },
          lease: { select: { id: true, leaseNumber: true, leaseTermMonths: true } },
          departmentCenter: { select: { id: true, code: true, name: true } },
          costCenter: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.billingSchedule.count({ where }),
    ]);

    // Resolve floorLabel from FloorSetup when unit.floorLabel is null
    const propIdsNeedingFloors = [...new Set(
      rawData
        .filter((s) => s.unit && !s.unit.floorLabel && s.unit.floorNumber != null)
        .map((s) => s.propertyId),
    )];
    const floorLookup = new Map<string, string>();
    if (propIdsNeedingFloors.length > 0) {
      const floorRows = await prisma.floorSetup.findMany({
        where: { propertyId: { in: propIdsNeedingFloors } },
        select: { propertyId: true, floorNumber: true, floorLabel: true },
      });
      for (const f of floorRows) {
        floorLookup.set(`${f.propertyId}|${f.floorNumber}`, f.floorLabel);
      }
    }

    const tempMap = new Map<string, boolean>();
    if (rawData.length > 0) {
      try {
        const ids = rawData.map((s) => s.id);
        const tempRows = await prisma.$queryRaw<Array<{ id: string; is_temporary: boolean }>>`
          SELECT "id", "is_temporary" FROM "billing_schedules" WHERE "id"::text = ANY(${ids})
        `;
        for (const r of tempRows) {
          tempMap.set(r.id, Boolean(r.is_temporary));
        }
      } catch (_e) {}
    }

    const data = rawData.map((s) => {
      const isTemporary = tempMap.get(s.id) ?? Boolean((s as any).isTemporary);
      if (!s.unit) return { ...s, isTemporary };
      const resolvedFloorLabel = s.unit.floorLabel
        ?? (s.unit.floorNumber != null ? floorLookup.get(`${s.propertyId}|${s.unit.floorNumber}`) ?? null : null);
      return {
        ...s,
        isTemporary,
        unit: {
          ...s.unit,
          floorLabel: resolvedFloorLabel,
        },
      };
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    if (await isAccountingIntegrationActive(companyId, (dto.propertyId as string) || null)) {
      if (
        !((dto.departmentCenterId as string) || '').trim() ||
        !((dto.costCenterId as string) || '').trim()
      ) {
        throw AppError.validation('Department and Cost Center are required');
      }
    }
    const startDate = new Date(dto.startDate as string);
    const billingDay = (dto.billingDay as number) || 1;
    const billingCycle = (dto.billingCycle as string) || 'monthly';
    const isProrated = dto.isProrated !== undefined
      ? Boolean(dto.isProrated)
      : startDate.getUTCDate() !== billingDay;
    const nextBillingDate = dto.nextBillingDate
      ? new Date(dto.nextBillingDate as string)
      : this.computeNextBillingDateFromStart(startDate, billingCycle, billingDay);

    const isTemporary = Boolean(dto.isTemporary);
    const created = await prisma.billingSchedule.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        unitId: (dto.unitId as string) || null,
        tenantId: dto.tenantId as string,
        leaseId: (dto.leaseId as string) || null,
        departmentCenterId: (dto.departmentCenterId as string) || null,
        costCenterId: (dto.costCenterId as string) || null,
        chargeTypeId: dto.chargeTypeId as string,
        meterNo: ((dto.meterNo as string) || '').trim() || null,
        description: (dto.description as string) || null,
        amount: dto.amount as number,
        quantity: (dto.quantity as number) ?? 1,
        currency: (dto.currency as string) || 'USD',
        billingCycle,
        billingDay,
        paymentDueDays: (dto.paymentDueDays as number) || 7,
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate as string) : null,
        nextBillingDate,
        isProrated,
        prorateStart: isProrated ? startDate : null,
        createdBy: userId,
      },
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true, glAccountCode: true, departmentCenterId: true, costCenterId: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });

    await prisma.$executeRaw`
      UPDATE "billing_schedules" SET "is_temporary" = ${isTemporary} WHERE "id" = ${created.id}::uuid
    `;
    (created as any).isTemporary = isTemporary;

    if (isTemporary && created.unitId) {
      await prisma.unit.updateMany({
        where: { id: created.unitId, status: { not: 'occupied' } },
        data: { status: 'reserved' },
      });
      await unitsService.invalidateStatsCache(created.propertyId);
    }

    return created;
  }

  /**
   * Auto-create Rent / Deposit / default Service Charge billing schedules on lease activation:
   *  - RENT:
   *      • If Rent category has monthly = true → active monthly schedule starting from startDate (no direct invoice).
   *      • If Rent category has monthly = false & paymentType = 'partially' → active schedule for remaining
   *        rent balance split evenly across remaining cycles (quantity = 1, amount = remainingRent / remainingCycles).
   *      • If Rent category has monthly = false & paymentType = 'fully' → no schedule (100% direct-invoiced).
   *  - SECURITY_DEPOSIT & default SERVICE_CHARGE:
   *      • Scheduled ONLY when their Charge Category has monthly = true (otherwise 100% direct-invoiced).
   */
  async createFromLease(lease: any) {
    const categoryMap = await resolveChargeCategoryMap(lease.companyId, lease.propertyId);
    const rentChargeType = await findLeaseRentChargeType(lease.companyId, lease.propertyId);

    const startDate  = new Date(lease.startDate);
    const endDate    = lease.endDate ? new Date(lease.endDate) : null;
    const billingDay = lease.billingDay || 1;
    const isProrated = startDate.getUTCDate() !== billingDay;

    const isPartial  = lease.paymentType === 'partially';
    const deposit    = Number(lease.securityDeposit ?? 0);
    const rentAmount = Number(lease.rentAmount ?? 0);

    const termMonths = lease.leaseTermMonths || (
      lease.startDate && lease.endDate
        ? calcLeaseTermMonths(lease.startDate, lease.endDate)
        : 12
    ) || 1;
    const totalRent = Math.round(rentAmount * termMonths * 100) / 100;

    const unitDefaultCenters = await this.resolveUnitDefaultCenters(lease);
    const floorDisplay = lease.unit?.floorLabel || (lease.unit?.floorNumber != null ? `Floor ${lease.unit.floorNumber}` : '');
    const unitLabel = `${floorDisplay ? `${floorDisplay} · ` : ''}Unit ${lease.unit?.unitNumber || ''}`;

    // 1. RENT schedule
    if (rentAmount > 0) {
      const existingRent = await prisma.billingSchedule.findFirst({
        where: { leaseId: lease.id, chargeTypeId: rentChargeType.id, status: { not: 'cancelled' } },
      });

      if (!existingRent) {
        const isRentMonthly = isCategoryMonthly(categoryMap, rentChargeType.category);
        const rentCenters =
          rentChargeType.departmentCenterId || rentChargeType.costCenterId
            ? {
                departmentCenterId: rentChargeType.departmentCenterId ?? null,
                costCenterId: rentChargeType.costCenterId ?? null,
              }
            : unitDefaultCenters;

        if (isRentMonthly) {
          // Monthly Rent category → schedule from period 1 (startDate), no direct invoice
          if (!endDate || startDate <= endDate) {
            await prisma.billingSchedule.create({
              data: {
                ...this.leaseScheduleBase(lease, startDate, billingDay),
                billingCycle: 'monthly',
                departmentCenterId: rentCenters.departmentCenterId,
                costCenterId: rentCenters.costCenterId,
                quantity: 1,
                nextBillingDate: startDate,
                chargeTypeId: rentChargeType.id,
                description: `Rent — ${unitLabel}`,
                amount: rentAmount,
                isProrated,
                prorateStart: isProrated ? startDate : null,
              },
            });
          }
        } else if (isPartial) {
          // Non-monthly Rent with Partial payment → split remaining rent across remaining cycles (qty = 1)
          const existingRentInvoices = await prisma.invoice.findMany({
            where: {
              companyId: lease.companyId,
              status: { not: 'void' },
              OR: [
                { leaseId: lease.id },
                ...(lease.unitId && lease.tenantId
                  ? [{
                      unitId: lease.unitId,
                      tenantId: lease.tenantId,
                      invoiceDate: {
                        gte: startDate,
                        ...(endDate ? { lte: endDate } : {}),
                      },
                    }]
                  : []),
              ],
              lines: {
                some: {
                  OR: [
                    { chargeType: { code: { equals: 'RENT', mode: 'insensitive' } } },
                    { chargeType: { category: { equals: 'rent', mode: 'insensitive' } } },
                  ],
                },
              },
            },
            include: {
              lines: {
                include: {
                  chargeType: { select: { code: true, category: true } },
                },
              },
            },
          });

          let invoicedRentAmount = 0;
          for (const inv of existingRentInvoices) {
            for (const l of inv.lines) {
              const code = (l.chargeType?.code || '').toUpperCase();
              const cat = (l.chargeType?.category || '').toLowerCase();
              if (code === 'RENT' || cat === 'rent') {
                invoicedRentAmount += Number(l.amount ?? l.lineTotal ?? 0);
              }
            }
          }

          const partialAmount = lease.partialAmount != null ? Number(lease.partialAmount) : 0;
          const coveredRentAmount = Math.max(invoicedRentAmount, partialAmount);
          const remainingRent = Math.max(0, Math.round((totalRent - coveredRentAmount) * 100) / 100);

          if (remainingRent > 0) {
            const cycleMonths = getBillingCycleMonths(lease.billingCycle);
            const totalCycles = Math.max(1, Math.ceil(termMonths / cycleMonths));
            const remainingCycles = totalCycles > 1 ? totalCycles - 1 : 1;
            const scheduleRentAmount = Math.round((remainingRent / remainingCycles) * 100) / 100;
            const rentNextBillingDate = totalCycles > 1
              ? this.computeNextBillingDateFromStart(startDate, lease.billingCycle || 'monthly', billingDay)
              : startDate;

            if (scheduleRentAmount > 0 && (!endDate || rentNextBillingDate <= endDate)) {
              await prisma.billingSchedule.create({
                data: {
                  ...this.leaseScheduleBase(lease, startDate, billingDay),
                  departmentCenterId: rentCenters.departmentCenterId,
                  costCenterId: rentCenters.costCenterId,
                  quantity: 1,
                  nextBillingDate: rentNextBillingDate,
                  chargeTypeId: rentChargeType.id,
                  description: `Rent (Remaining Balance) — ${unitLabel}`,
                  amount: scheduleRentAmount,
                  isProrated: false,
                  prorateStart: null,
                },
              });
            }
          }
        }
      }
    }

    // 2. SECURITY_DEPOSIT schedule (ONLY when Deposit category has monthly = true)
    if (deposit > 0) {
      const depositChargeType = await findLeaseDepositChargeType(lease.companyId, lease.propertyId);
      if (isCategoryMonthly(categoryMap, depositChargeType.category)) {
        const existingDeposit = await prisma.billingSchedule.findFirst({
          where: { leaseId: lease.id, chargeTypeId: depositChargeType.id, status: { not: 'cancelled' } },
        });
        if (!existingDeposit && (!endDate || startDate <= endDate)) {
          const depositCenters =
            depositChargeType.departmentCenterId || depositChargeType.costCenterId
              ? {
                  departmentCenterId: depositChargeType.departmentCenterId ?? null,
                  costCenterId: depositChargeType.costCenterId ?? null,
                }
              : unitDefaultCenters;
          await prisma.billingSchedule.create({
            data: {
              ...this.leaseScheduleBase(lease, startDate, billingDay),
              billingCycle: 'monthly',
              departmentCenterId: depositCenters.departmentCenterId,
              costCenterId: depositCenters.costCenterId,
              quantity: 1,
              nextBillingDate: startDate,
              chargeTypeId: depositChargeType.id,
              description: `Security Deposit — Unit ${lease.unit?.unitNumber || ''}`,
              amount: deposit,
              isProrated: false,
            },
          });
        }
      }
    }

    // 3. Property default SERVICE_CHARGE schedule (ONLY when its category has monthly = true)
    const serviceChargeAmount = Number(lease.unit?.property?.settings?.defaultServiceCharge ?? 0);
    if (serviceChargeAmount > 0) {
      const scChargeType = await prisma.chargeType.findFirst({
        where: {
          code: { equals: 'SERVICE_CHARGE', mode: 'insensitive' },
          OR: [{ companyId: null }, { companyId: lease.companyId }],
          ...(lease.propertyId ? { AND: [{ OR: [{ propertyId: lease.propertyId }, { propertyId: null }] }] } : {}),
        },
        orderBy: { propertyId: 'desc' },
      });
      if (scChargeType && isCategoryMonthly(categoryMap, scChargeType.category)) {
        const existingSc = await prisma.billingSchedule.findFirst({
          where: { leaseId: lease.id, chargeTypeId: scChargeType.id, status: { not: 'cancelled' } },
        });
        if (!existingSc && (!endDate || startDate <= endDate)) {
          const scCentersMap = await this.resolveChargeTypeCenters(lease.companyId, lease.propertyId, [scChargeType]);
          const scCenters = scCentersMap.get(scChargeType.id);
          const effectiveScCenters =
            scCenters && (scCenters.departmentCenterId || scCenters.costCenterId)
              ? scCenters
              : unitDefaultCenters;
          await prisma.billingSchedule.create({
            data: {
              ...this.leaseScheduleBase(lease, startDate, billingDay),
              billingCycle: 'monthly',
              departmentCenterId: effectiveScCenters.departmentCenterId,
              costCenterId: effectiveScCenters.costCenterId,
              quantity: 1,
              nextBillingDate: startDate,
              chargeTypeId: scChargeType.id,
              description: `Service Charge — Unit ${lease.unit?.unitNumber || ''}`,
              amount: serviceChargeAmount,
              isProrated: false,
            },
          });
        }
      }
    }
  }

  /**
   * Syncs additional leaseCharge schedules created in 'draft' at lease-creation time:
   *  - Charge Category monthly = true  → promote to 'active' (billingCycle = 'monthly',
   *    nextBillingDate = startDate unless Period 1 was already invoiced).
   *  - Charge Category monthly = false → mark 'completed' (nextBillingDate = null), because
   *    non-monthly charges are auto-invoiced directly on activation by invoicesService.createFromLease.
   */
  async updateChargeSchedulesFromLease(lease: any): Promise<void> {
    const allSchedules = await prisma.billingSchedule.findMany({
      where: { leaseId: lease.id, status: { in: ['draft', 'active', 'confirmed'] } },
      include: {
        chargeType: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            glAccountCode: true,
            departmentCenterId: true,
            costCenterId: true,
          },
        },
      },
    });
    // Exclude Rent and Security Deposit schedules created/handled by createFromLease
    // (including properties whose Rent charge type uses a custom code with category='rent')
    const schedules = allSchedules.filter((s) => {
      const code = (s.chargeType?.code || '').trim().toUpperCase();
      const cat = (s.chargeType?.category || '').trim().toLowerCase();
      return code !== 'RENT' && code !== 'SECURITY_DEPOSIT' && cat !== 'rent';
    });
    if (schedules.length === 0) return;

    const [centersByCtId, categoryMap] = await Promise.all([
      this.resolveChargeTypeCenters(
        lease.companyId,
        lease.propertyId,
        schedules.map((s) => s.chargeType).filter((ct): ct is NonNullable<typeof ct> => Boolean(ct)),
      ),
      resolveChargeCategoryMap(lease.companyId, lease.propertyId),
    ]);

    const leaseBillingDay = lease.billingDay || 1;
    const startDate       = new Date(lease.startDate);
    const endDate         = lease.endDate ? new Date(lease.endDate) : null;

    // Check existing non-void invoices in the contract period for monthly schedules only
    const monthlyCtIds = schedules
      .filter((s) => isCategoryMonthly(categoryMap, s.chargeType?.category))
      .map((s) => s.chargeTypeId);

    const contractInvoices = monthlyCtIds.length > 0
      ? await prisma.invoice.findMany({
          where: {
            companyId: lease.companyId,
            status: { not: 'void' },
            OR: [
              { leaseId: lease.id },
              ...(lease.unitId && lease.tenantId
                ? [{
                    unitId: lease.unitId,
                    tenantId: lease.tenantId,
                    OR: [
                      { periodFrom: { gte: startDate, ...(endDate ? { lte: endDate } : {}) } },
                      { invoiceDate: { gte: startDate, ...(endDate ? { lte: endDate } : {}) } },
                    ],
                  }]
                : []),
            ],
            lines: { some: { chargeTypeId: { in: monthlyCtIds } } },
          },
          select: {
            invoiceDate: true,
            periodFrom: true,
            periodTo: true,
            lines: {
              where: { chargeTypeId: { in: monthlyCtIds } },
              select: {
                chargeTypeId: true,
                periodFrom: true,
                periodTo: true,
              },
            },
          },
        })
      : [];

    await prisma.$transaction(
      schedules.map((schedule) => {
        const isMonthlyCategory = isCategoryMonthly(categoryMap, schedule.chargeType?.category);
        const ctCenters = centersByCtId.get(schedule.chargeTypeId);
        const hasCtCenters = Boolean(ctCenters && (ctCenters.departmentCenterId || ctCenters.costCenterId));
        const resolvedDeptId = hasCtCenters
          ? ctCenters!.departmentCenterId
          : (schedule.departmentCenterId ?? null);
        const resolvedCcId = hasCtCenters
          ? ctCenters!.costCenterId
          : (schedule.costCenterId ?? null);

        // Non-monthly lease charges were direct-invoiced on activation — close their draft schedule
        if (!isMonthlyCategory) {
          return prisma.billingSchedule.update({
            where: { id: schedule.id },
            data: {
              status:             'completed',
              nextBillingDate:    null,
              invoiceCount:       Math.max(schedule.invoiceCount || 0, 1),
              departmentCenterId: resolvedDeptId,
              costCenterId:       resolvedCcId,
            },
          });
        }

        // Monthly lease charges start from Period 1 (startDate) because no direct invoice was issued;
        // only advance nextBillingDate if an invoice for this charge already exists in the contract period.
        const effectiveCycle = 'monthly';
        let latestPeriodFrom: Date | null = null;
        let latestPeriodTo: Date | null = null;
        let latestInvDate: Date | null = null;

        for (const inv of contractInvoices) {
          for (const ln of inv.lines) {
            if (ln.chargeTypeId === schedule.chargeTypeId) {
              const pf = ln.periodFrom || inv.periodFrom;
              const pt = ln.periodTo || inv.periodTo;
              if (pf && (!latestPeriodFrom || pf > latestPeriodFrom)) latestPeriodFrom = pf;
              if (pt && (!latestPeriodTo || pt > latestPeriodTo)) latestPeriodTo = pt;
              if (!pf && !pt && (!latestInvDate || inv.invoiceDate > latestInvDate)) latestInvDate = inv.invoiceDate;
            }
          }
        }

        let nextBillingDate = startDate;
        if (latestPeriodFrom) {
          const d1 = this.computeNextBillingDateFromStart(latestPeriodFrom, effectiveCycle, leaseBillingDay);
          if (d1 > nextBillingDate) nextBillingDate = d1;
        }
        if (latestPeriodTo) {
          const d2 = latestPeriodTo.getUTCDate() === 1
            ? new Date(Date.UTC(latestPeriodTo.getUTCFullYear(), latestPeriodTo.getUTCMonth(), leaseBillingDay))
            : this.computeNextBillingDateFromStart(latestPeriodTo, effectiveCycle, leaseBillingDay);
          if (d2 > nextBillingDate) nextBillingDate = d2;
        }
        if (!latestPeriodFrom && !latestPeriodTo && latestInvDate) {
          const d3 = this.computeNextBillingDateFromStart(latestInvDate, effectiveCycle, leaseBillingDay);
          if (d3 > nextBillingDate) nextBillingDate = d3;
        }

        const isFullyInvoiced = endDate != null && nextBillingDate > endDate;

        return prisma.billingSchedule.update({
          where: { id: schedule.id },
          data: {
            status:             isFullyInvoiced ? 'completed' : 'active',
            quantity:           1,
            billingCycle:       effectiveCycle,
            billingDay:         leaseBillingDay,
            nextBillingDate:    isFullyInvoiced ? null : nextBillingDate,
            departmentCenterId: resolvedDeptId,
            costCenterId:       resolvedCcId,
          },
        });
      })
    );
  }

  /**
   * Computes the next billing date that falls one full billing period after `startDate`,
   * snapped to `billingDay` in that month (UTC-safe for @db.Date columns).
   * Safe against JavaScript date month-overflow bugs (e.g. Jan 31 + 1 month).
   */
  public computeNextBillingDateFromStart(startDate: Date, billingCycle: string, billingDay: number): Date {
    const d = new Date(startDate);
    const startYear = d.getUTCFullYear();
    const startMonth = d.getUTCMonth();
    const monthsToAdd = getBillingCycleMonths(billingCycle);

    const totalMonths = startMonth + monthsToAdd;
    const targetYear = startYear + Math.floor(totalMonths / 12);
    const targetMonth = totalMonths % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const day = Math.min(billingDay, maxDay);

    return new Date(Date.UTC(targetYear, targetMonth, day));
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (['cancelled', 'completed'].includes(schedule.status)) {
      throw AppError.validation('Cannot update a cancelled or completed schedule');
    }

    const targetPropertyId = (dto.propertyId as string) || schedule.propertyId;
    if (
      (dto.departmentCenterId !== undefined || dto.costCenterId !== undefined) &&
      (await isAccountingIntegrationActive(companyId, targetPropertyId))
    ) {
      const nextDept = dto.departmentCenterId !== undefined ? ((dto.departmentCenterId as string) || '').trim() : (schedule.departmentCenterId || '').trim();
      const nextCc = dto.costCenterId !== undefined ? ((dto.costCenterId as string) || '').trim() : (schedule.costCenterId || '').trim();
      if (!nextDept || !nextCc) {
        throw AppError.validation('Department and Cost Center are required');
      }
    }

    const updateData: any = {};
    if (dto.chargeTypeId !== undefined) updateData.chargeTypeId = dto.chargeTypeId;
    if (dto.propertyId !== undefined) updateData.propertyId = dto.propertyId;
    if (dto.tenantId !== undefined) updateData.tenantId = dto.tenantId;
    if (dto.unitId !== undefined) updateData.unitId = dto.unitId;
    if (dto.leaseId !== undefined) updateData.leaseId = dto.leaseId;
    if (dto.departmentCenterId !== undefined) updateData.departmentCenterId = dto.departmentCenterId || null;
    if (dto.costCenterId !== undefined) updateData.costCenterId = dto.costCenterId || null;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.billingCycle !== undefined) updateData.billingCycle = dto.billingCycle;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.quantity !== undefined) updateData.quantity = dto.quantity;
    if (dto.billingDay !== undefined) updateData.billingDay = dto.billingDay;
    if (dto.paymentDueDays !== undefined) updateData.paymentDueDays = dto.paymentDueDays;
    const prevTempRows = await prisma.$queryRaw<Array<{ is_temporary: boolean }>>`
      SELECT "is_temporary" FROM "billing_schedules" WHERE "id" = ${id}::uuid
    `;
    const wasTemporary = Boolean(prevTempRows[0]?.is_temporary ?? (schedule as any).isTemporary);

    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.startDate !== undefined) {
      updateData.startDate = new Date(dto.startDate as string);
    }
    const startChanged =
      updateData.startDate !== undefined &&
      updateData.startDate.toISOString().split('T')[0] !== schedule.startDate.toISOString().split('T')[0];
    const cycleChanged =
      dto.billingCycle !== undefined && dto.billingCycle !== schedule.billingCycle;
    const dayChanged =
      dto.billingDay !== undefined && Number(dto.billingDay) !== Number(schedule.billingDay);

    if (startChanged || cycleChanged || dayChanged) {
      const effectiveStart: Date = updateData.startDate ?? schedule.startDate;
      const effectiveCycle: string = (updateData.billingCycle ?? schedule.billingCycle) as string;
      const effectiveDay: number = Number(updateData.billingDay ?? schedule.billingDay) || 1;

      if (schedule.invoiceCount === 0) {
        const isProrated = effectiveStart.getUTCDate() !== effectiveDay;
        updateData.isProrated = isProrated;
        updateData.prorateStart = isProrated ? effectiveStart : null;
      }
      const cyclesToAdvance = Math.max(1, schedule.invoiceCount || 1);
      let nextDate = effectiveStart;
      for (let i = 0; i < cyclesToAdvance; i++) {
        nextDate = this.computeNextBillingDateFromStart(nextDate, effectiveCycle, effectiveDay);
      }
      updateData.nextBillingDate = nextDate;
    }

    if (schedule.status === 'confirmed') {
      const sameDay = (a: unknown, b: Date | null) =>
        (a ? new Date(a as string).toISOString().split('T')[0] : null) === (b ? b.toISOString().split('T')[0] : null);
      const reviewFieldChanged =
        (dto.chargeTypeId !== undefined && dto.chargeTypeId !== schedule.chargeTypeId) ||
        (dto.tenantId !== undefined && dto.tenantId !== schedule.tenantId) ||
        (dto.unitId !== undefined && (dto.unitId || null) !== schedule.unitId) ||
        (dto.propertyId !== undefined && dto.propertyId !== schedule.propertyId) ||
        (dto.currency !== undefined && dto.currency !== schedule.currency) ||
        (dto.amount !== undefined && Number(dto.amount) !== Number(schedule.amount)) ||
        (dto.quantity !== undefined && Number(dto.quantity) !== Number(schedule.quantity)) ||
        (dto.startDate !== undefined && !sameDay(dto.startDate, schedule.startDate)) ||
        cycleChanged ||
        dayChanged;
      if (reviewFieldChanged) updateData.status = 'active';
    }

    const updated = await prisma.billingSchedule.update({
      where: { id },
      data: updateData,
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true, glAccountCode: true, departmentCenterId: true, costCenterId: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
        property: { select: { id: true, name: true } },
        lease: { select: { id: true, leaseNumber: true, leaseTermMonths: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });

    const nextIsTemporary = dto.isTemporary !== undefined ? Boolean(dto.isTemporary) : wasTemporary;
    if (dto.isTemporary !== undefined) {
      await prisma.$executeRaw`
        UPDATE "billing_schedules" SET "is_temporary" = ${nextIsTemporary} WHERE "id" = ${id}::uuid
      `;
    }
    (updated as any).isTemporary = nextIsTemporary;

    if (nextIsTemporary && updated.unitId) {
      await prisma.unit.updateMany({
        where: { id: updated.unitId, status: { not: 'occupied' } },
        data: { status: 'reserved' },
      });
      await unitsService.invalidateStatsCache(updated.propertyId);
    }

    if (
      schedule.unitId &&
      wasTemporary &&
      (!nextIsTemporary || schedule.unitId !== updated.unitId)
    ) {
      await this.releaseTempUnitIfUnused(schedule.unitId, schedule.propertyId);
    }

    return updated;
  }

  async pause(id: string, companyId: string) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (!['active', 'confirmed'].includes(schedule.status)) {
      throw AppError.validation('Can only pause active or confirmed schedules');
    }

    return prisma.billingSchedule.update({ where: { id }, data: { status: 'paused' } });
  }

  async resume(id: string, companyId: string) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (schedule.status !== 'paused') throw AppError.validation('Can only resume paused schedules');

    return prisma.billingSchedule.update({ where: { id }, data: { status: 'active' } });
  }

  async cancel(id: string, companyId: string) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (['cancelled', 'completed'].includes(schedule.status)) throw AppError.validation('Schedule is already cancelled or completed');

    const prevTempRows = await prisma.$queryRaw<Array<{ is_temporary: boolean }>>`
      SELECT "is_temporary" FROM "billing_schedules" WHERE "id" = ${id}::uuid
    `;
    const wasTemporary = Boolean(prevTempRows[0]?.is_temporary ?? (schedule as any).isTemporary);

    const cancelled = await prisma.billingSchedule.update({ where: { id }, data: { status: 'cancelled' } });
    if (wasTemporary && schedule.unitId) {
      await this.releaseTempUnitIfUnused(schedule.unitId, schedule.propertyId);
    }
    return cancelled;
  }

  public async releaseTempUnitIfUnused(unitId: string | null | undefined, propertyId: string) {
    if (!unitId) return;
    const otherTempRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "billing_schedules"
      WHERE "unit_id" = ${unitId}::uuid
        AND "is_temporary" = true
        AND "status" <> 'cancelled'
      LIMIT 1
    `;
    if (otherTempRows.length > 0) return;

    const activeLease = await prisma.lease.findFirst({
      where: {
        unitId,
        status: 'active',
        deletedAt: null,
      },
    });
    if (activeLease) return;

    const released = await prisma.unit.updateMany({
      where: { id: unitId, status: 'reserved' },
      data: { status: 'available' },
    });
    if (released.count > 0) await clearShopIdentityOp([unitId]);
    await unitsService.invalidateStatsCache(propertyId);
  }

  /**
   * Due active/confirmed schedules (next billing date on or before asOfDate) grouped by
   * Charge Category, so Unit, Tenant, and Amount can be checked before Run Billing.
   */
  async getReviewByCategory(
    companyId: string,
    filters: { asOfDate: Date; propertyId?: string; currency?: string },
  ) {
    const { asOfDate, propertyId, currency } = filters;
    const where: any = {
      companyId,
      status: { in: ['active', 'confirmed'] },
      nextBillingDate: { lte: asOfDate },
      OR: [{ leaseId: null }, { lease: { status: 'active', deletedAt: null } }],
    };
    if (propertyId) where.propertyId = propertyId;
    if (currency) where.currency = currency;

    const [rows, categoryDefs] = await Promise.all([
      prisma.billingSchedule.findMany({
        where,
        include: {
          chargeType: { select: { id: true, code: true, name: true, category: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
          property: { select: { id: true, name: true } },
          lease: { select: { id: true, leaseNumber: true } },
        },
      }),
      prisma.chargeCategory.findMany({
        where: { OR: [{ companyId: null }, { companyId }] },
        select: { code: true, description: true },
      }),
    ]);

    const categoryNameByCode = new Map(
      categoryDefs.map((c) => [c.code.trim().toLowerCase(), c.description?.trim() || c.code]),
    );

    // Floor labels for units that only store a floor number
    const floorLookup = new Map<string, string>();
    const propIdsNeedingFloors = [...new Set(
      rows.filter((s) => s.unit && !s.unit.floorLabel && s.unit.floorNumber != null).map((s) => s.propertyId),
    )];
    if (propIdsNeedingFloors.length > 0) {
      const floorRows = await prisma.floorSetup.findMany({
        where: { propertyId: { in: propIdsNeedingFloors } },
        select: { propertyId: true, floorNumber: true, floorLabel: true },
      });
      for (const f of floorRows) floorLookup.set(`${f.propertyId}|${f.floorNumber}`, f.floorLabel);
    }

    // Invoices already issued for the same period are skipped by Run Billing (date still advances)
    const invoicedByKey = new Map<string, string>();
    if (rows.length > 0) {
      const periodDates = [...new Set(rows.map((s) => s.nextBillingDate!.toISOString()))].map((d) => new Date(d));
      const existingLines = await prisma.invoiceLine.findMany({
        where: {
          chargeTypeId: { in: [...new Set(rows.map((s) => s.chargeTypeId))] },
          periodFrom: { in: periodDates },
          invoice: {
            companyId,
            invoiceType: 'invoice',
            status: { not: 'void' },
            ...(propertyId ? { propertyId } : {}),
          },
        },
        select: {
          chargeTypeId: true,
          periodFrom: true,
          invoice: { select: { invoiceNumber: true, tenantId: true, unitId: true, propertyId: true } },
        },
      });
      for (const l of existingLines) {
        const key = [l.invoice.propertyId, l.invoice.tenantId, l.invoice.unitId ?? '', l.chargeTypeId, l.periodFrom!.toISOString()].join('|');
        invoicedByKey.set(key, l.invoice.invoiceNumber);
      }
    }

    type ReviewGroup = {
      categoryCode: string;
      categoryName: string;
      activeCount: number;
      confirmedCount: number;
      totalsByCurrency: Record<string, number>;
      schedules: any[];
    };
    const groups = new Map<string, ReviewGroup>();
    let activeCount = 0;
    let confirmedCount = 0;

    for (const s of rows) {
      const code = (s.chargeType?.category || 'other').trim();
      const key = code.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = {
          categoryCode: code,
          categoryName: categoryNameByCode.get(key) || code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
          activeCount: 0,
          confirmedCount: 0,
          totalsByCurrency: {},
          schedules: [],
        };
        groups.set(key, group);
      }

      const quantity = Number(s.quantity) || 1;
      const lineTotal = Math.round(Number(s.amount) * quantity * 100) / 100;
      if (s.status === 'confirmed') { group.confirmedCount++; confirmedCount++; } else { group.activeCount++; activeCount++; }
      group.totalsByCurrency[s.currency] = Math.round(((group.totalsByCurrency[s.currency] || 0) + lineTotal) * 100) / 100;

      const invoicedKey = [s.propertyId, s.tenantId, s.unitId ?? '', s.chargeTypeId, s.nextBillingDate!.toISOString()].join('|');
      group.schedules.push({
        id: s.id,
        status: s.status,
        description: s.description,
        amount: s.amount,
        quantity: s.quantity,
        lineTotal,
        currency: s.currency,
        billingCycle: s.billingCycle,
        nextBillingDate: s.nextBillingDate,
        isProrated: s.isProrated && s.invoiceCount === 0,
        chargeType: s.chargeType,
        tenant: s.tenant,
        property: s.property,
        lease: s.lease,
        unit: s.unit
          ? {
              ...s.unit,
              floorLabel: s.unit.floorLabel ?? (s.unit.floorNumber != null ? floorLookup.get(`${s.propertyId}|${s.unit.floorNumber}`) ?? null : null),
            }
          : null,
        alreadyInvoicedNumber: invoicedByKey.get(invoicedKey) ?? null,
      });
    }

    const categories = [...groups.values()]
      .map((g) => ({
        ...g,
        schedules: g.schedules.sort((a, b) => {
          const fa = a.unit?.floorNumber ?? 9999;
          const fb = b.unit?.floorNumber ?? 9999;
          if (fa !== fb) return fa - fb;
          return (a.unit?.unitNumber || '').localeCompare(b.unit?.unitNumber || '', undefined, { numeric: true });
        }),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    return {
      asOfDate: asOfDate.toISOString().split('T')[0],
      totalSchedules: rows.length,
      activeCount,
      confirmedCount,
      categories,
    };
  }

  /**
   * Confirm (active -> confirmed) or unconfirm (confirmed -> active) due schedules, either a
   * whole Charge Category or specific schedule ids. Only confirmed schedules are billed.
   */
  async setConfirmation(
    companyId: string,
    dto: {
      asOfDate: Date;
      action: 'confirm' | 'unconfirm';
      propertyId?: string;
      currency?: string;
      category?: string;
      scheduleIds?: string[];
    },
  ) {
    const { asOfDate, action, propertyId, currency, category, scheduleIds } = dto;
    if (!category && !(scheduleIds && scheduleIds.length > 0)) {
      throw AppError.validation('Select a charge category or at least one schedule');
    }
    const fromStatus = action === 'unconfirm' ? 'confirmed' : 'active';
    const toStatus = action === 'unconfirm' ? 'active' : 'confirmed';

    const where: any = {
      companyId,
      status: fromStatus,
      nextBillingDate: { lte: asOfDate },
      OR: [{ leaseId: null }, { lease: { status: 'active', deletedAt: null } }],
    };
    if (propertyId) where.propertyId = propertyId;
    if (currency) where.currency = currency;
    if (category) where.chargeType = { category: { equals: category.trim(), mode: 'insensitive' } };
    if (scheduleIds && scheduleIds.length > 0) where.id = { in: scheduleIds };

    const result = await prisma.billingSchedule.updateMany({ where, data: { status: toStatus } });
    return { updatedCount: result.count, status: toStatus };
  }

  /**
   * Lightweight count of unconfirmed ('active') due schedules grouped by Charge Category,
   * used by Run Billing to warn and block billing until all due categories are confirmed.
   */
  async getPendingConfirmationSummary(
    companyId: string,
    filters: { asOfDate: Date; propertyId?: string },
  ) {
    const { asOfDate, propertyId } = filters;
    const where: any = {
      companyId,
      status: 'active',
      nextBillingDate: { lte: asOfDate },
      OR: [{ leaseId: null }, { lease: { status: 'active', deletedAt: null } }],
    };
    if (propertyId) where.propertyId = propertyId;

    const [rows, categoryMap] = await Promise.all([
      prisma.billingSchedule.findMany({
        where,
        select: { chargeType: { select: { category: true } } },
      }),
      resolveChargeCategoryMap(companyId, propertyId),
    ]);

    const counts = new Map<string, { categoryCode: string; categoryName: string; pendingCount: number }>();
    for (const row of rows) {
      const code = (row.chargeType?.category || 'other').trim();
      const key = code.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.pendingCount += 1;
      } else {
        counts.set(key, {
          categoryCode: code,
          categoryName: getCategoryDisplayName(categoryMap, code),
          pendingCount: 1,
        });
      }
    }

    const categories = [...counts.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return {
      asOfDate: asOfDate.toISOString().split('T')[0],
      totalPending: rows.length,
      categories,
    };
  }

  /** Schedules Run Billing will invoice: confirmed only, due on or before asOfDate. */
  async findDueSchedules(asOfDate: Date, propertyId?: string) {
    const where: any = {
      status: 'confirmed',
      nextBillingDate: { lte: asOfDate },
      OR: [
        { leaseId: null },
        { lease: { status: 'active', deletedAt: null } },
      ],
    };
    if (propertyId) where.propertyId = propertyId;

    const rows = await prisma.billingSchedule.findMany({
      where,
      include: {
        chargeType: true,
        tenant: { select: { id: true, firstName: true, lastName: true } },
        lease: true,
      },
    });

    if (rows.length > 0) {
      try {
        const ids = rows.map((r) => r.id);
        const tempRows = await prisma.$queryRaw<Array<{ id: string; is_temporary: boolean }>>`
          SELECT "id", "is_temporary" FROM "billing_schedules" WHERE "id"::text = ANY(${ids})
        `;
        const tempMap = new Map(tempRows.map((r) => [r.id, Boolean(r.is_temporary)]));
        for (const r of rows) {
          (r as any).isTemporary = tempMap.get(r.id) ?? Boolean((r as any).isTemporary);
        }
      } catch (_e) {}
    }

    return rows;
  }

  private async resolveChargeTypeCenters(
    companyId: string,
    propertyId: string | null | undefined,
    cts: Array<{
      id: string;
      glAccountCode?: string | null;
      departmentCenterId?: string | null;
      costCenterId?: string | null;
    }>,
  ): Promise<Map<string, { departmentCenterId: string | null; costCenterId: string | null }>> {
    const result = new Map<string, { departmentCenterId: string | null; costCenterId: string | null }>();
    const codesToLookup = new Set<string>();

    for (const ct of cts) {
      if (ct.departmentCenterId || ct.costCenterId) {
        result.set(ct.id, {
          departmentCenterId: ct.departmentCenterId ?? null,
          costCenterId: ct.costCenterId ?? null,
        });
      } else if (ct.glAccountCode?.trim()) {
        codesToLookup.add(ct.glAccountCode.trim());
      } else {
        result.set(ct.id, { departmentCenterId: null, costCenterId: null });
      }
    }

    if (codesToLookup.size > 0) {
      const glAccounts = await prisma.glAccount.findMany({
        where: {
          companyId,
          code: { in: Array.from(codesToLookup) },
          isActive: true,
          ...(propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {}),
        },
        select: {
          code: true,
          propertyId: true,
          departmentCenterId: true,
          costCenterId: true,
        },
      });

      for (const ct of cts) {
        if (result.has(ct.id)) continue;
        const code = ct.glAccountCode?.trim();
        const matches = code ? glAccounts.filter((a) => a.code === code) : [];
        const propMatch = propertyId ? matches.find((a) => a.propertyId === propertyId) : undefined;
        const chosen = propMatch || matches[0];
        result.set(ct.id, {
          departmentCenterId: chosen?.departmentCenterId ?? null,
          costCenterId: chosen?.costCenterId ?? null,
        });
      }
    }

    return result;
  }

  private async resolveUnitDefaultCenters(
    lease: any,
  ): Promise<{ departmentCenterId: string | null; costCenterId: string | null }> {
    const unitCharges: Array<{ chargeType?: any }> = Array.isArray(lease.unit?.unitCharges)
      ? lease.unit.unitCharges
      : lease.unitId
      ? await prisma.unitCharge.findMany({
          where: { unitId: lease.unitId },
          include: {
            chargeType: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
                glAccountCode: true,
                departmentCenterId: true,
                costCenterId: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const scheduleCharges: Array<{ chargeType?: any }> = Array.isArray(lease.billingSchedules)
      ? lease.billingSchedules
      : [];

    const allCts = [...unitCharges, ...scheduleCharges]
      .map((u) => u.chargeType)
      .filter((ct): ct is NonNullable<typeof ct> => Boolean(ct));

    if (allCts.length === 0) {
      return { departmentCenterId: null, costCenterId: null };
    }

    const centersMap = await this.resolveChargeTypeCenters(lease.companyId, lease.propertyId, allCts);

    const isRentLike = (ct: any) => {
      const code = (ct.code || '').trim().toUpperCase();
      const cat = (ct.category || '').trim().toLowerCase();
      return code === 'RENT' || cat === 'rent';
    };

    for (const ct of allCts.filter(isRentLike)) {
      const c = centersMap.get(ct.id);
      if (c && (c.departmentCenterId || c.costCenterId)) return c;
    }

    for (const ct of allCts) {
      const c = centersMap.get(ct.id);
      if (c && (c.departmentCenterId || c.costCenterId)) return c;
    }

    return { departmentCenterId: null, costCenterId: null };
  }
}

export const billingSchedulesService = new BillingSchedulesService();
