import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

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
    leaseId?: string; tenantId?: string; propertyId?: string; unitId?: string; status?: string; search?: string; page?: number; limit?: number;
  }) {
    const { leaseId, tenantId, propertyId, unitId, status, search, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (leaseId) where.leaseId = leaseId;
    if (tenantId) where.tenantId = tenantId;
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;
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
          chargeType: { select: { id: true, code: true, name: true, category: true } },
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

    const data = rawData.map((s) => {
      if (!s.unit) return s;
      const resolvedFloorLabel = s.unit.floorLabel
        ?? (s.unit.floorNumber != null ? floorLookup.get(`${s.propertyId}|${s.unit.floorNumber}`) ?? null : null);
      return {
        ...s,
        unit: {
          ...s.unit,
          floorLabel: resolvedFloorLabel,
        },
      };
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const startDate = new Date(dto.startDate as string);
    const billingDay = (dto.billingDay as number) || 1;
    const billingCycle = (dto.billingCycle as string) || 'monthly';
    const isProrated = startDate.getUTCDate() !== billingDay;
    const nextBillingDate = this.computeNextBillingDateFromStart(startDate, billingCycle, billingDay);

    return prisma.billingSchedule.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        unitId: (dto.unitId as string) || null,
        tenantId: dto.tenantId as string,
        leaseId: (dto.leaseId as string) || null,
        departmentCenterId: (dto.departmentCenterId as string) || null,
        costCenterId: (dto.costCenterId as string) || null,
        chargeTypeId: dto.chargeTypeId as string,
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
        chargeType: { select: { id: true, code: true, name: true, category: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });
  }

  /**
   * Auto-create billing schedules when a partially-paid lease is activated.
   * Creates RENT + SECURITY_DEPOSIT (if deposit > 0) + SERVICE_CHARGE (if configured).
   * Used only when paymentType ≠ 'fully'.
   */
  async createFromLease(lease: any) {
    const rentChargeType = await prisma.chargeType.findFirst({
      where: { code: 'RENT', OR: [{ companyId: null }, { companyId: lease.companyId }] },
    });
    if (!rentChargeType) return;

    const startDate  = new Date(lease.startDate);
    const endDate    = lease.endDate ? new Date(lease.endDate) : null;
    const billingDay = lease.billingDay || 1;
    const isProrated = startDate.getUTCDate() !== billingDay;

    // Idempotency: skip if a RENT schedule already exists for this lease
    const existing = await prisma.billingSchedule.findFirst({
      where: { leaseId: lease.id, chargeTypeId: rentChargeType.id, status: { not: 'cancelled' } },
    });
    if (existing) return;

    const isPartial = lease.paymentType === 'partially';
    const deposit    = Number(lease.securityDeposit ?? 0);
    const rentAmount = Number(lease.rentAmount ?? 0);

    const termMonths = lease.leaseTermMonths || (
      lease.endDate && lease.startDate
        ? Math.max(1, Math.round((new Date(lease.endDate).getTime() - new Date(lease.startDate).getTime()) / (30.4375 * 86400000)))
        : 12
    );
    const totalRent = Math.round(rentAmount * termMonths * 100) / 100;

    // Check existing non-void Rent invoices for this lease / contract period
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
              { chargeType: { code: { in: ['RENT', 'rent'] } } },
              { chargeType: { category: 'rent' } },
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

    const partialAmount = isPartial && lease.partialAmount != null ? Number(lease.partialAmount) : 0;
    const coveredRentAmount = Math.max(invoicedRentAmount, partialAmount);

    let scheduleRentAmount = rentAmount;
    let rentNextBillingDate = startDate;
    let scheduleQty = termMonths || 1;
    const hasPartialRent = isPartial || (coveredRentAmount > 0 && coveredRentAmount < totalRent);

    if (coveredRentAmount >= totalRent && totalRent > 0) {
      // Full term rent already invoiced — no need to schedule Base Rent
      scheduleRentAmount = 0;
    } else if (hasPartialRent) {
      let cycleMonths = 1;
      switch (lease.billingCycle) {
        case 'monthly':     cycleMonths = 1;  break;
        case 'quarterly':   cycleMonths = 3;  break;
        case 'semi_annual': cycleMonths = 6;  break;
        case 'annual':      cycleMonths = 12; break;
        default:            cycleMonths = 1;  break;
      }

      const totalCycles = Math.max(1, Math.ceil(termMonths / cycleMonths));
      const remainingRent = Math.max(0, Math.round((totalRent - coveredRentAmount) * 100) / 100);
      const coveredCycles = rentAmount > 0 ? Math.max(1, Math.floor(coveredRentAmount / (rentAmount * cycleMonths))) : 1;
      scheduleQty = Math.max(1, termMonths - Math.floor(coveredRentAmount / (rentAmount || 1)));
      scheduleRentAmount = remainingRent;

      // Advance nextBillingDate past the covered cycle(s) so recurring billing starts on the next unpaid month
      if (totalCycles > 1 && coveredRentAmount > 0) {
        let nextDate = startDate;
        for (let i = 0; i < coveredCycles; i++) {
          nextDate = this.computeNextBillingDateFromStart(nextDate, lease.billingCycle || 'monthly', billingDay);
        }
        rentNextBillingDate = nextDate;
      }
    }

    // 1. RENT schedule (only when there is positive rent remaining to schedule)
    if (scheduleRentAmount > 0 && (!endDate || rentNextBillingDate <= endDate)) {
      const floorDisplay = lease.unit?.floorLabel || (lease.unit?.floorNumber != null ? `Floor ${lease.unit.floorNumber}` : '');
      const unitLabel = `${floorDisplay ? `${floorDisplay} · ` : ''}Unit ${lease.unit?.unitNumber || ''}`;
      await prisma.billingSchedule.create({
        data: {
          ...this.leaseScheduleBase(lease, startDate, billingDay),
          quantity: scheduleQty,
          nextBillingDate: rentNextBillingDate,
          chargeTypeId: rentChargeType.id,
          description: hasPartialRent
            ? `Rent (Remaining Balance) — ${unitLabel}`
            : `Rent — ${unitLabel}`,
          amount: scheduleRentAmount,
          isProrated: hasPartialRent ? false : isProrated,
          prorateStart: (!hasPartialRent && isProrated) ? startDate : null,
        },
      });
    }

    // 2. SECURITY_DEPOSIT schedule (one-time deposit: included directly in the upfront invoice on activation, never scheduled for partial leases)
    if (deposit > 0 && !isPartial) {
      const existingDepositInvoice = await prisma.invoice.findFirst({
        where: {
          leaseId: lease.id,
          status: { not: 'void' },
          lines: {
            some: {
              chargeType: {
                OR: [
                  { code: 'SECURITY_DEPOSIT' },
                  { code: 'security_deposit' },
                ],
              },
            },
          },
        },
      });

      if (!existingDepositInvoice) {
        let depositChargeType = await prisma.chargeType.findFirst({
          where: { code: 'SECURITY_DEPOSIT', OR: [{ companyId: null }, { companyId: lease.companyId }] },
        });
        if (!depositChargeType) {
          depositChargeType = await prisma.chargeType.create({
            data: { code: 'SECURITY_DEPOSIT', name: 'Security Deposit', category: 'other', isActive: true, isSystem: true },
          });
        }
        const existingDeposit = await prisma.billingSchedule.findFirst({
          where: { leaseId: lease.id, chargeTypeId: depositChargeType.id, status: { not: 'cancelled' } },
        });
        if (!existingDeposit) {
          await prisma.billingSchedule.create({
            data: {
              ...this.leaseScheduleBase(lease, startDate, billingDay),
              chargeTypeId: depositChargeType.id,
              description: `Security Deposit — Unit ${lease.unit?.unitNumber || ''}`,
              amount: deposit,
              isProrated: false,
            },
          });
        }
      }
    }

    // 3. SERVICE_CHARGE schedule (if property has a default)
    const serviceChargeAmount = lease.unit?.property?.settings?.defaultServiceCharge as number | undefined;
    if (serviceChargeAmount && serviceChargeAmount > 0) {
      const scChargeType = await prisma.chargeType.findFirst({
        where: { code: 'SERVICE_CHARGE', OR: [{ companyId: null }, { companyId: lease.companyId }] },
      });
      if (scChargeType) {
        await prisma.billingSchedule.create({
          data: {
            ...this.leaseScheduleBase(lease, startDate, billingDay),
            chargeTypeId: scChargeType.id,
            description: `Service Charge — Unit ${lease.unit?.unitNumber || ''}`,
            amount: serviceChargeAmount,
            isProrated: false,
          },
        });
      }
    }
  }

  /**
   * Updates the billing schedule records that were already created at lease-creation
   * time (one per leaseCharge) so they are ready for recurring billing runs starting
   * from the first billing period (startDate).
   *
   * Also ensures the billingCycle on each schedule matches the lease's billingCycle —
   * relevant when a charge's category has monthly=true but the lease runs on a
   * different cycle (quarterly, semi-annual, annual).
   */
  async updateChargeSchedulesFromLease(lease: any): Promise<void> {
    // Find billing schedules created for this lease (both draft and active)
    const allSchedules = await prisma.billingSchedule.findMany({
      where: { leaseId: lease.id, status: { in: ['draft', 'active'] } },
      include: {
        chargeType: {
          select: { id: true, code: true, name: true, category: true },
        },
      },
    });
    // Exclude RENT and SECURITY_DEPOSIT schedules so we only update additional leaseCharge schedules
    const schedules = allSchedules.filter((s) => {
      const code = (s.chargeType?.code || '').toUpperCase();
      return code !== 'RENT' && code !== 'SECURITY_DEPOSIT';
    });
    if (schedules.length === 0) return;

    // Fetch categories that have monthly=true so we know which ones override the lease cycle
    const allCategories = await prisma.chargeCategory.findMany({
      where: {
        OR: [{ companyId: null }, { companyId: lease.companyId }],
        isActive: true,
        monthly: true,
      },
      select: { code: true },
    });
    const monthlyCategoryCodes = new Set(allCategories.map((c) => c.code.toLowerCase()));

    const leaseBillingCycle = lease.billingCycle || 'monthly';
    const leaseBillingDay   = lease.billingDay   || 1;
    const startDate         = new Date(lease.startDate);
    const endDate           = lease.endDate ? new Date(lease.endDate) : null;

    // Check existing non-void invoices in the contract period for this lease/unit/tenant
    const contractInvoices = await prisma.invoice.findMany({
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
      },
      select: {
        invoiceDate: true,
        periodFrom: true,
        periodTo: true,
        lines: {
          select: {
            chargeTypeId: true,
            description: true,
            periodFrom: true,
            periodTo: true,
            chargeType: { select: { id: true, code: true, name: true, category: true } },
          },
        },
      },
    });

    await prisma.$transaction(
      schedules.map((schedule) => {
        const categoryCode      = (schedule.chargeType?.category || '').toLowerCase();
        const isMonthlyCategory = monthlyCategoryCodes.has(categoryCode);
        const effectiveCycle    = isMonthlyCategory ? 'monthly' : leaseBillingCycle;

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

        let nextBillingDate = this.computeNextBillingDateFromStart(startDate, effectiveCycle, leaseBillingDay);
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
            status:          isFullyInvoiced ? 'completed' : 'active',
            quantity:        1,
            billingCycle:    effectiveCycle,
            billingDay:      leaseBillingDay,
            nextBillingDate: isFullyInvoiced ? null : nextBillingDate,
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
    let monthsToAdd = 1;
    switch (billingCycle) {
      case 'monthly':     monthsToAdd = 1;  break;
      case 'quarterly':   monthsToAdd = 3;  break;
      case 'semi_annual': monthsToAdd = 6;  break;
      case 'annual':      monthsToAdd = 12; break;
      default:            monthsToAdd = 1;  break;
    }

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
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.startDate !== undefined) {
      updateData.startDate = new Date(dto.startDate as string);
    }
    if (dto.startDate !== undefined || dto.billingCycle !== undefined || dto.billingDay !== undefined) {
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

    return prisma.billingSchedule.update({
      where: { id },
      data: updateData,
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit: { select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true } },
        property: { select: { id: true, name: true } },
        lease: { select: { id: true, leaseNumber: true, leaseTermMonths: true } },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async pause(id: string, companyId: string) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (schedule.status !== 'active') throw AppError.validation('Can only pause active schedules');

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

    return prisma.billingSchedule.update({ where: { id }, data: { status: 'cancelled' } });
  }

  async findDueSchedules(asOfDate: Date, propertyId?: string) {
    const where: any = {
      status: 'active',
      nextBillingDate: { lte: asOfDate },
    };
    if (propertyId) where.propertyId = propertyId;

    return prisma.billingSchedule.findMany({
      where,
      include: {
        chargeType: true,
        tenant: { select: { id: true, firstName: true, lastName: true } },
        lease: true,
      },
    });
  }
}

export const billingSchedulesService = new BillingSchedulesService();
