import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class BillingSchedulesService {
  async findAll(companyId: string, filters: {
    leaseId?: string; tenantId?: string; propertyId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { leaseId, tenantId, propertyId, status, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (leaseId) where.leaseId = leaseId;
    if (tenantId) where.tenantId = tenantId;
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.billingSchedule.findMany({
        where,
        include: {
          chargeType: { select: { id: true, code: true, name: true, category: true } },
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit: { select: { id: true, unitNumber: true } },
          property: { select: { id: true, name: true } },
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
   * Auto-create billing schedules when a lease is activated.
   * Creates RENT + SERVICE_CHARGE (if property has one) per spec.
   */
  async createFromLease(lease: any) {
    const rentChargeType = await prisma.chargeType.findFirst({
      where: { code: 'RENT', OR: [{ companyId: null }, { companyId: lease.companyId }] },
    });
    if (!rentChargeType) return;

    const startDate = new Date(lease.startDate);
    const billingDay = lease.billingDay || 1;
    const isProrated = startDate.getDate() !== billingDay;

    // Check if schedule already exists for this lease
    const existing = await prisma.billingSchedule.findFirst({
      where: { leaseId: lease.id, chargeTypeId: rentChargeType.id, status: { not: 'cancelled' } },
    });
    if (existing) return;

    // 1. Create RENT schedule
    await prisma.billingSchedule.create({
      data: {
        companyId: lease.companyId,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        leaseId: lease.id,
        chargeTypeId: rentChargeType.id,
        description: `Rent — Unit ${lease.unit?.unitNumber || ''}`,
        amount: Number(lease.rentAmount),
        currency: lease.currency || 'USD',
        billingCycle: lease.billingCycle || 'monthly',
        billingDay,
        paymentDueDays: lease.paymentDueDays || 7,
        startDate,
        endDate: lease.endDate ? new Date(lease.endDate) : null,
        nextBillingDate: startDate,
        isProrated,
        prorateStart: isProrated ? startDate : null,
      },
    });

    // 2. Create SERVICE_CHARGE schedule if property has a default service charge
    const serviceChargeAmount = lease.unit?.property?.settings?.defaultServiceCharge as number | undefined;
    if (serviceChargeAmount && serviceChargeAmount > 0) {
      const scChargeType = await prisma.chargeType.findFirst({
        where: { code: 'SERVICE_CHARGE', OR: [{ companyId: null }, { companyId: lease.companyId }] },
      });
      if (scChargeType) {
        await prisma.billingSchedule.create({
          data: {
            companyId: lease.companyId,
            propertyId: lease.propertyId,
            unitId: lease.unitId,
            tenantId: lease.tenantId,
            leaseId: lease.id,
            chargeTypeId: scChargeType.id,
            description: `Service Charge — Unit ${lease.unit?.unitNumber || ''}`,
            amount: serviceChargeAmount,
            currency: lease.currency || 'USD',
            billingCycle: lease.billingCycle || 'monthly',
            billingDay,
            paymentDueDays: lease.paymentDueDays || 7,
            startDate,
            endDate: lease.endDate ? new Date(lease.endDate) : null,
            nextBillingDate: startDate,
            isProrated: false, // service charge not prorated
          },
        });
      }
    }
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const schedule = await prisma.billingSchedule.findFirst({ where: { id, companyId } });
    if (!schedule) throw AppError.notFound('Billing schedule');
    if (['cancelled', 'completed'].includes(schedule.status)) {
      throw AppError.validation('Cannot update a cancelled or completed schedule');
    }

    const updateData: any = {};
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.billingDay !== undefined) updateData.billingDay = dto.billingDay;
    if (dto.paymentDueDays !== undefined) updateData.paymentDueDays = dto.paymentDueDays;
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    return prisma.billingSchedule.update({
      where: { id },
      data: updateData,
      include: {
        chargeType: { select: { id: true, code: true, name: true, category: true } },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        unit: { select: { id: true, unitNumber: true } },
        property: { select: { id: true, name: true } },
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
