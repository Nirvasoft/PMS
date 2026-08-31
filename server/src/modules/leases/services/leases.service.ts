import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { calcLeaseTermMonths, nextLeaseNumber, daysUntilExpiry } from './helpers';
import { webhookLeaseCreated } from '../../../common/webhookHooks';

export class LeasesService {
  // ── List ──────────────────────────────────
  async findAll(companyId: string, query: {
    search?: string; propertyId?: string; unitId?: string; tenantId?: string;
    status?: string; expiringWithinDays?: number; page?: number; limit?: number;
  }) {
    const { search, propertyId, unitId, tenantId, status, expiringWithinDays, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (propertyId) where.propertyId = propertyId;
    if (unitId)     where.unitId = unitId;
    if (tenantId)   where.tenantId = tenantId;
    if (status)     where.status = status;
    if (expiringWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + expiringWithinDays);
      where.endDate = { lte: cutoff };
      where.status  = { in: ['active', 'approved'] };
    }
    if (search) {
      where.leaseNumber = { contains: search, mode: 'insensitive' };
    }

    const [raw, total] = await Promise.all([
      prisma.lease.findMany({
        where,
        select: {
          id: true, leaseNumber: true, status: true,
          startDate: true, endDate: true, leaseTermMonths: true,
          rentAmount: true, currency: true, esignStatus: true, createdAt: true,
          unit:     { select: { id: true, unitNumber: true, unitType: true } },
          property: { select: { id: true, name: true } },
          tenant:   { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.lease.count({ where }),
    ]);

    const data = raw.map((l) => ({
      ...l,
      tenant: { ...l.tenant, displayName: l.tenant.tenantType === 'company' ? l.tenant.companyName : `${l.tenant.firstName || ''} ${l.tenant.lastName || ''}`.trim() },
      daysUntilExpiry: daysUntilExpiry(l.endDate),
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Get one ──────────────────────────────
  async findById(id: string, companyId: string) {
    const lease = await prisma.lease.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        unit:     { select: { id: true, unitNumber: true, unitType: true, areaSqft: true } },
        property: { select: { id: true, name: true, currency: true } },
        tenant:   { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true, email: true, mobile: true } },
        creator:  { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        approver: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        amendments:         { orderBy: { amendmentNumber: 'asc' } },
        escalationSchedule: { orderBy: { effectiveDate: 'asc' } },
        esignRecipients:    { orderBy: { createdAt: 'asc' } },
        renewalLeases:      { select: { id: true, leaseNumber: true, status: true, startDate: true, endDate: true } },
        parentLease:        { select: { id: true, leaseNumber: true, status: true } },
        billingSchedules: {
          select: {
            id: true, amount: true,
            chargeType: { select: { id: true, code: true, name: true, category: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!lease) throw AppError.notFound('Lease');

    const tenant = lease.tenant;
    const { billingSchedules, ...leaseRest } = lease as any;

    // rental_agreement is read via raw SQL so it works even if the generated
    // Prisma client predates the column.
    const raRows = await prisma.$queryRaw<{ rental_agreement: unknown }[]>`SELECT "rental_agreement" FROM "leases" WHERE "id" = ${id}::uuid`;

    return {
      ...leaseRest,
      rentalAgreement: raRows[0]?.rental_agreement ?? null,
      tenant: { ...tenant, displayName: tenant.tenantType === 'company' ? tenant.companyName : `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() },
      daysUntilExpiry: daysUntilExpiry(lease.endDate),
      leaseCharges: billingSchedules,
    };
  }

  // ── Create ────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    const { propertyId, unitId, tenantId, startDate, endDate, templateId, leaseCharges, rentalAgreement, handoverDate, ...rest } = dto as any;

    // Validations
    const unit   = await prisma.unit.findFirst({ where: { id: unitId, propertyId } });
    if (!unit) throw new AppError(400, 'INVALID_UNIT', 'Unit not found in property');
    if (!['available', 'reserved'].includes(unit.status)) throw new AppError(409, 'UNIT_NOT_AVAILABLE', `Unit status is '${unit.status}' — must be available or reserved`);

    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw new AppError(400, 'INVALID_TENANT', 'Tenant not found');
    if (tenant.isBlacklisted) throw new AppError(403, 'TENANT_BLACKLISTED', 'Cannot create lease for blacklisted tenant');

    // Overlap check
    const overlap = await prisma.lease.findFirst({
      where: { unitId, deletedAt: null, status: { in: ['active', 'approved', 'pending_approval'] } },
    });
    if (overlap) throw new AppError(409, 'LEASE_OVERLAP', 'Unit already has an active or approved lease', { conflictingLeaseId: overlap.id });

    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (end <= start) throw new AppError(400, 'INVALID_DATES', 'End date must be after start date');

    // Load template clauses if provided
    let templateClauses: unknown[] = [];
    if (templateId) {
      const tmpl = await prisma.leaseTemplate.findFirst({ where: { id: templateId, companyId } });
      if (tmpl) templateClauses = tmpl.clauses as unknown[];
    }

    const lease = await prisma.lease.create({
      data: {
        companyId, propertyId, unitId, tenantId,
        templateId: templateId || null,
        leaseNumber: nextLeaseNumber(),
        startDate: start, endDate: end,
        leaseTermMonths: calcLeaseTermMonths(start, end),
        createdBy,
        clauses: rest.clauses ?? templateClauses,
        // Convert handoverDate string → Date so Prisma doesn't reject it
        ...(handoverDate ? { handoverDate: new Date(handoverDate) } : {}),
        ...rest,
      },
    });

    // Rental agreement lives in a JSONB column written via raw SQL so it does
    // not depend on the generated Prisma client knowing the field.
    if (rentalAgreement) {
      await prisma.$executeRaw`UPDATE "leases" SET "rental_agreement" = ${JSON.stringify(rentalAgreement)}::jsonb WHERE "id" = ${lease.id}::uuid`;
    }

    // Create BillingSchedule records for each charge
    if (Array.isArray(leaseCharges) && leaseCharges.length > 0) {
      await prisma.billingSchedule.createMany({
        data: leaseCharges.map((c: { chargeTypeId: string; amount: number }) => ({
          companyId,
          propertyId,
          unitId,
          tenantId,
          leaseId: lease.id,
          chargeTypeId: c.chargeTypeId,
          amount: c.amount,
          currency: rest.currency || 'USD',
          billingCycle: rest.billingCycle || 'monthly',
          billingDay: rest.billingDay || 1,
          paymentDueDays: rest.paymentDueDays || 7,
          startDate: start,
          endDate: end,
          createdBy,
        })),
      });
    }

    webhookLeaseCreated(lease);
    return lease;
  }

  // ── Update (draft only) ───────────────────
  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'draft') throw new AppError(400, 'NOT_DRAFT', 'Only draft leases can be updated');

    const { startDate, endDate, leaseCharges, rentalAgreement, ...rest } = dto as any;
    const start = startDate ? new Date(startDate) : new Date(lease.startDate);
    const end   = endDate   ? new Date(endDate)   : new Date(lease.endDate);
    if (end <= start) throw new AppError(400, 'INVALID_DATES', 'End date must be after start date');

    const updated = await prisma.lease.update({
      where: { id },
      data: { ...rest, ...(startDate ? { startDate: start } : {}), ...(endDate ? { endDate: end } : {}), leaseTermMonths: calcLeaseTermMonths(start, end) },
    });

    // Rental agreement JSONB written via raw SQL (see create()).
    if (rentalAgreement !== undefined) {
      await prisma.$executeRaw`UPDATE "leases" SET "rental_agreement" = ${JSON.stringify(rentalAgreement)}::jsonb WHERE "id" = ${id}::uuid`;
    }

    // Replace billing schedule charges when provided
    if (Array.isArray(leaseCharges)) {
      // Delete all existing billing schedules linked to this lease
      await prisma.billingSchedule.deleteMany({ where: { leaseId: id } });

      // Re-create new ones
      if (leaseCharges.length > 0) {
        const curr = await prisma.lease.findFirst({ where: { id }, select: { propertyId: true, unitId: true, tenantId: true, currency: true, billingCycle: true, billingDay: true, paymentDueDays: true, startDate: true, endDate: true } });
        if (curr) {
          await prisma.billingSchedule.createMany({
            data: leaseCharges.map((c: { chargeTypeId: string; amount: number }) => ({
              companyId,
              propertyId: curr.propertyId,
              unitId: curr.unitId,
              tenantId: curr.tenantId,
              leaseId: id,
              chargeTypeId: c.chargeTypeId,
              amount: c.amount,
              currency: curr.currency,
              billingCycle: curr.billingCycle,
              billingDay: curr.billingDay,
              paymentDueDays: curr.paymentDueDays,
              startDate: curr.startDate,
              endDate: curr.endDate,
            })),
          });
        }
      }
    }

    return updated;
  }

  // ── Soft delete ──────────────────────────
  async delete(id: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status === 'active') throw new AppError(409, 'ACTIVE_LEASE', 'Cannot delete an active lease. Terminate first.');
    await prisma.lease.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

export const leasesService = new LeasesService();
