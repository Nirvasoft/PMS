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
    leaseId?: string; tenantId?: string; propertyId?: string; unitId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { leaseId, tenantId, propertyId, unitId, status, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (leaseId) where.leaseId = leaseId;
    if (tenantId) where.tenantId = tenantId;
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.billingSchedule.findMany({
        where,
        include: {
          chargeType: { select: { id: true, code: true, name: true, category: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit: { select: { id: true, unitNumber: true } },
          property: { select: { id: true, name: true } },
          lease: { select: { id: true, leaseNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.billingSchedule.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const startDate = new Date(dto.startDate as string);
    const billingDay = (dto.billingDay as number) || 1;
    const billingCycle = (dto.billingCycle as string) || 'monthly';
    const isProrated = startDate.getDate() !== billingDay;

    return prisma.billingSchedule.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        unitId: (dto.unitId as string) || null,
        tenantId: dto.tenantId as string,
        leaseId: (dto.leaseId as string) || null,
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
        nextBillingDate: startDate,
        isProrated,
        prorateStart: isProrated ? startDate : null,
        createdBy: userId,
      },
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true } },
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
    const billingDay = lease.billingDay || 1;
    const isProrated = startDate.getDate() !== billingDay;

    // Idempotency: skip if a RENT schedule already exists for this lease
    const existing = await prisma.billingSchedule.findFirst({
      where: { leaseId: lease.id, chargeTypeId: rentChargeType.id, status: { not: 'cancelled' } },
    });
    if (existing) return;

    const deposit    = Number(lease.securityDeposit ?? 0);
    const rentAmount = Number(lease.rentAmount);

    // 1. RENT schedule
    await prisma.billingSchedule.create({
      data: {
        ...this.leaseScheduleBase(lease, startDate, billingDay),
        chargeTypeId: rentChargeType.id,
        description: `Rent — Unit ${lease.unit?.unitNumber || ''}`,
        amount: rentAmount,
        isProrated,
        prorateStart: isProrated ? startDate : null,
      },
    });

    // 2. SECURITY_DEPOSIT schedule (if applicable)
    if (deposit > 0) {
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
   * time (one per leaseCharge) so they are ready for future recurring billing runs.
   *
   * Called on activation when paymentType = 'fully'.  The first period has already
   * been directly invoiced by invoicesService.createFromLease, so we advance each
   * schedule's nextBillingDate by one full billing period so the cron/Run Billing
   * won't re-invoice the same period.
   *
   * Also ensures the billingCycle on each schedule matches the lease's billingCycle —
   * relevant when a charge's category has monthly=true but the lease runs on a
   * different cycle (quarterly, semi-annual, annual).
   */
  async updateChargeSchedulesFromLease(lease: any): Promise<void> {
    // Find billing schedules created for this lease (both draft and active)
    const schedules = await prisma.billingSchedule.findMany({
      where: { leaseId: lease.id, status: { in: ['draft', 'active'] } },
      include: {
        chargeType: {
          select: { id: true, code: true, category: true },
        },
      },
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

    await prisma.$transaction(
      schedules.map((schedule) => {
        // Billing cycle rule:
        // • Category monthly=true  → always bill monthly (category setting wins over lease cycle)
        // • Category monthly=false → use the lease's billingCycle (quarterly / semi-annual / annual)
        const categoryCode      = (schedule.chargeType?.category || '').toLowerCase();
        const isMonthlyCategory = monthlyCategoryCodes.has(categoryCode);
        const effectiveCycle    = isMonthlyCategory ? 'monthly' : leaseBillingCycle;

        // Next billing date MUST depend on THIS schedule's effectiveCycle!
        const nextBillingDate = this.computeNextBillingDateFromStart(startDate, effectiveCycle, leaseBillingDay);

        return prisma.billingSchedule.update({
          where: { id: schedule.id },
          data: {
            status:          'active',   // promote draft → active (now visible in billing schedule list)
            billingCycle:    effectiveCycle,
            billingDay:      leaseBillingDay,
            nextBillingDate,
          },
        });
      })
    );
  }

  /**
   * Computes the next billing date that falls one full billing period after `startDate`,
   * snapped to `billingDay` in that month.
   * Safe against JavaScript date month-overflow bugs (e.g. Jan 31 + 1 month).
   */
  private computeNextBillingDateFromStart(startDate: Date, billingCycle: string, billingDay: number): Date {
    const d = new Date(startDate);
    const startYear = d.getFullYear();
    const startMonth = d.getMonth();
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
    const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    const day = Math.min(billingDay, maxDay);

    return new Date(targetYear, targetMonth, day);
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
      const startDate = new Date(dto.startDate as string);
      updateData.startDate = startDate;
      // No invoices generated yet — safe to move the next billing date along with the start date.
      // Once billing has run, nextBillingDate has already advanced past the original start and must be left alone.
      if (schedule.invoiceCount === 0) updateData.nextBillingDate = startDate;
    }

    return prisma.billingSchedule.update({
      where: { id },
      data: updateData,
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit: { select: { id: true, unitNumber: true } },
        property: { select: { id: true, name: true } },
        lease: { select: { id: true, leaseNumber: true } },
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
