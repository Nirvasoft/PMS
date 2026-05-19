import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

// ─── Helpers ──────────────────────────────────
function calcLeaseTermMonths(start: Date, end: Date): number {
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(1, months);
}

function nextLeaseNumber(): string {
  const year = new Date().getFullYear();
  const rand  = Math.floor(Math.random() * 90000) + 10000;
  return `LSE-${year}-${rand}`;
}

function daysUntilExpiry(endDate: Date | string): number {
  const ms = new Date(endDate).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export async function generateEscalationSchedule(leaseId: string): Promise<void> {
  const lease = await prisma.lease.findUniqueOrThrow({ where: { id: leaseId } });
  if (!lease.escalationType) return;

  await prisma.leaseEscalationSchedule.deleteMany({ where: { leaseId } });

  const entries: { leaseId: string; effectiveDate: Date; newRent: number }[] = [];
  let currentRent = Number(lease.rentAmount);
  const freqMonths = lease.escalationFrequency === 'biennial' ? 24 : 12;
  const startDate = new Date(lease.startDate);

  // First escalation date
  let effDate = new Date(startDate);
  effDate.setMonth(effDate.getMonth() + freqMonths);
  if (lease.escalationMonth) effDate.setMonth(lease.escalationMonth - 1);
  if (lease.escalationDay)   effDate.setDate(lease.escalationDay);

  const endDate = new Date(lease.endDate);
  while (effDate <= endDate) {
    let newRent = currentRent;
    if (lease.escalationType === 'fixed_percent' && lease.escalationValue) {
      newRent = Math.round(currentRent * (1 + Number(lease.escalationValue) / 100) * 100) / 100;
    } else if (lease.escalationType === 'fixed_amount' && lease.escalationValue) {
      newRent = Math.round((currentRent + Number(lease.escalationValue)) * 100) / 100;
    }
    entries.push({ leaseId, effectiveDate: new Date(effDate), newRent });
    currentRent = newRent;
    effDate = new Date(effDate);
    effDate.setMonth(effDate.getMonth() + freqMonths);
  }

  if (entries.length > 0) {
    await prisma.leaseEscalationSchedule.createMany({ data: entries, skipDuplicates: true });
  }
}

function calcEarlyTermPenalty(rentAmount: number, remainingMonths: number): number {
  const threeMonths = rentAmount * 3;
  const halfRemaining = rentAmount * remainingMonths * 0.5;
  return Math.round(Math.min(threeMonths, halfRemaining) * 100) / 100;
}

// ══════════════════════════════════════════════
// LEASES SERVICE
// ══════════════════════════════════════════════
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
      },
    });
    if (!lease) throw AppError.notFound('Lease');

    const tenant = lease.tenant;
    return {
      ...lease,
      tenant: { ...tenant, displayName: tenant.tenantType === 'company' ? tenant.companyName : `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() },
      daysUntilExpiry: daysUntilExpiry(lease.endDate),
    };
  }

  // ── Create ────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    const { propertyId, unitId, tenantId, startDate, endDate, templateId, ...rest } = dto as any;

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
        ...rest,
      },
    });

    return lease;
  }

  // ── Update (draft only) ───────────────────
  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'draft') throw new AppError(400, 'NOT_DRAFT', 'Only draft leases can be updated');

    const { startDate, endDate, ...rest } = dto as any;
    const start = startDate ? new Date(startDate) : new Date(lease.startDate);
    const end   = endDate   ? new Date(endDate)   : new Date(lease.endDate);
    if (end <= start) throw new AppError(400, 'INVALID_DATES', 'End date must be after start date');

    return prisma.lease.update({
      where: { id },
      data: { ...rest, ...(startDate ? { startDate: start } : {}), ...(endDate ? { endDate: end } : {}), leaseTermMonths: calcLeaseTermMonths(start, end) },
    });
  }

  // ── Submit for approval ───────────────────
  async submit(id: string, companyId: string, submittedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'draft') throw new AppError(400, 'NOT_DRAFT', 'Only draft leases can be submitted');
    if (!lease.tenantId) throw new AppError(400, 'MISSING_TENANT', 'Tenant is required');
    if (Number(lease.rentAmount) <= 0) throw new AppError(400, 'INVALID_RENT', 'Rent amount must be greater than 0');

    // No workflow configured → approve directly
    await prisma.lease.update({ where: { id }, data: { status: 'approved', approvedBy: submittedBy, approvedAt: new Date() } });
    return { leaseId: id, status: 'approved', workflowInstanceId: null };
  }

  // ── Activate ─────────────────────────────
  async activate(id: string, companyId: string, activatedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null }, include: { unit: true } });
    if (!lease) throw AppError.notFound('Lease');
    if (!['approved', 'pending_approval'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only approved leases can be activated');

    const handoverDate = lease.handoverDate ? new Date(lease.handoverDate) : new Date(lease.startDate);
    const unitStatus   = handoverDate <= new Date() ? 'occupied' : 'reserved';

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'active', activatedAt: new Date(), approvedBy: activatedBy, approvedAt: new Date() } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: unitStatus } }),
    ]);

    await generateEscalationSchedule(id);
    logger.info(`Lease ${lease.leaseNumber} activated, unit → ${unitStatus}`);
    return prisma.lease.findUniqueOrThrow({ where: { id } });
  }

  // ── Cancel ───────────────────────────────
  async cancel(id: string, companyId: string, reason?: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (!['draft', 'pending_approval'].includes(lease.status)) throw new AppError(400, 'INVALID_STATUS', 'Only draft or pending leases can be cancelled');

    await prisma.lease.update({ where: { id }, data: { status: 'cancelled', terminationReason: reason ?? null } });
    return { leaseId: id, status: 'cancelled' };
  }

  // ── Terminate ────────────────────────────
  async terminate(id: string, companyId: string, dto: { terminationDate: string; reason: string }, terminatedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Only active leases can be terminated');

    const termDate = new Date(dto.terminationDate);
    const endDate  = new Date(lease.endDate);
    const isEarly  = termDate < endDate;

    let penalty = 0;
    let penaltyBreakdown = '';
    if (isEarly) {
      const remainingMonths = Math.max(0, calcLeaseTermMonths(termDate, endDate));
      penalty = calcEarlyTermPenalty(Number(lease.rentAmount), remainingMonths);
      penaltyBreakdown = `Min(3 months rent, ${remainingMonths} remaining months × 50%)`;
    }

    await prisma.$transaction([
      prisma.lease.update({ where: { id }, data: { status: 'terminated', terminationDate: termDate, terminationReason: dto.reason, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty } }),
      prisma.unit.update({ where: { id: lease.unitId }, data: { status: 'available' } }),
    ]);

    return { leaseId: id, status: 'terminated', terminationDate: dto.terminationDate, terminationType: isEarly ? 'early' : 'normal', earlyTerminationPenalty: penalty, penaltyBreakdown };
  }

  // ── Create renewal ───────────────────────
  async createRenewal(id: string, companyId: string, dto: { startDate: string; endDate: string; rentAmount?: number; offerExpiresAt?: string }, createdBy: string) {
    const original = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!original) throw AppError.notFound('Lease');
    if (original.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Can only renew active leases');

    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);

    const renewal = await prisma.lease.create({
      data: {
        companyId, propertyId: original.propertyId, unitId: original.unitId,
        tenantId: original.tenantId, parentLeaseId: id,
        leaseNumber: nextLeaseNumber(), status: 'draft',
        startDate: start, endDate: end, leaseTermMonths: calcLeaseTermMonths(start, end),
        rentAmount: dto.rentAmount ?? original.rentAmount,
        currency: original.currency, billingCycle: original.billingCycle,
        billingDay: original.billingDay, paymentDueDays: original.paymentDueDays,
        escalationType: original.escalationType, escalationValue: original.escalationValue,
        renewalOfferedAt: new Date(),
        renewalOfferExpiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null,
        createdBy,
      },
    });

    await prisma.lease.update({ where: { id }, data: { renewalOfferedAt: new Date() } });
    return renewal;
  }

  // ── Soft delete ──────────────────────────
  async delete(id: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status === 'active') throw new AppError(409, 'ACTIVE_LEASE', 'Cannot delete an active lease. Terminate first.');
    await prisma.lease.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

// ══════════════════════════════════════════════
// AMENDMENTS SERVICE
// ══════════════════════════════════════════════
export class AmendmentsService {
  async findAll(leaseId: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');
    return prisma.leaseAmendment.findMany({
      where: { leaseId },
      include: { approver: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { amendmentNumber: 'desc' },
    });
  }

  async create(leaseId: string, companyId: string, dto: Record<string, unknown>, createdBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');
    if (lease.status !== 'active') throw new AppError(400, 'NOT_ACTIVE', 'Can only amend active leases');

    const lastAmendment = await prisma.leaseAmendment.findFirst({ where: { leaseId }, orderBy: { amendmentNumber: 'desc' } });
    const amendmentNumber = (lastAmendment?.amendmentNumber ?? 0) + 1;

    // Snapshot old values
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    if (dto.newRentAmount) { oldValues.rentAmount = lease.rentAmount; newValues.rentAmount = dto.newRentAmount; }
    if (dto.newEndDate)    { oldValues.endDate = lease.endDate;       newValues.endDate = dto.newEndDate; }

    return prisma.leaseAmendment.create({
      data: { leaseId, amendmentNumber, createdBy, oldValues, newValues, ...dto as any },
    });
  }

  async approve(leaseId: string, amendmentId: string, companyId: string, approvedBy: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');

    const amendment = await prisma.leaseAmendment.findFirst({ where: { id: amendmentId, leaseId } });
    if (!amendment) throw AppError.notFound('Amendment');

    const updates: Record<string, unknown> = {};
    if (amendment.newRentAmount) updates.rentAmount = amendment.newRentAmount;
    if (amendment.newEndDate)    updates.endDate = amendment.newEndDate;

    await prisma.$transaction([
      prisma.leaseAmendment.update({ where: { id: amendmentId }, data: { status: 'approved', approvedBy, approvedAt: new Date() } }),
      ...(Object.keys(updates).length ? [prisma.lease.update({ where: { id: leaseId }, data: updates })] : []),
    ]);

    if (amendment.newRentAmount || amendment.newEndDate) {
      await generateEscalationSchedule(leaseId);
    }

    return prisma.leaseAmendment.findUniqueOrThrow({ where: { id: amendmentId } });
  }
}

// ══════════════════════════════════════════════
// ESIGN SERVICE (stub — provider-agnostic)
// ══════════════════════════════════════════════
export class EsignService {
  async send(leaseId: string, companyId: string, dto: { recipients: { recipientType: string; name: string; email: string }[]; emailSubject?: string }) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId } });
    if (!lease) throw AppError.notFound('Lease');

    const envelopeId = `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await prisma.$transaction([
      prisma.esignRecipient.deleteMany({ where: { leaseId } }),
      prisma.esignRecipient.createMany({
        data: dto.recipients.map((r) => ({ leaseId, envelopeId, ...r, status: 'sent' })),
      }),
      prisma.lease.update({ where: { id: leaseId }, data: { esignStatus: 'sent', esignEnvelopeId: envelopeId } }),
    ]);

    return { envelopeId, status: 'sent', message: 'Signing requests sent (stub — integrate DocuSign/HelloSign for production)' };
  }

  async getStatus(leaseId: string, companyId: string) {
    const lease = await prisma.lease.findFirst({ where: { id: leaseId, companyId }, select: { esignStatus: true, esignEnvelopeId: true, esignCompletedAt: true } });
    if (!lease) throw AppError.notFound('Lease');
    const recipients = await prisma.esignRecipient.findMany({ where: { leaseId } });
    return { status: lease.esignStatus, envelopeId: lease.esignEnvelopeId, completedAt: lease.esignCompletedAt, recipients };
  }

  async webhook(payload: Record<string, unknown>) {
    // DocuSign/HelloSign webhook stub — mark envelope complete
    const envelopeId = payload.envelopeId as string;
    if (!envelopeId) return;

    await prisma.$transaction([
      prisma.esignRecipient.updateMany({ where: { envelopeId }, data: { status: 'signed', signedAt: new Date() } }),
      prisma.lease.updateMany({ where: { esignEnvelopeId: envelopeId }, data: { esignStatus: 'completed', esignCompletedAt: new Date() } }),
    ]);

    logger.info(`E-sign envelope ${envelopeId} marked completed via webhook`);
  }
}

// ══════════════════════════════════════════════
// TEMPLATES & CLAUSES
// ══════════════════════════════════════════════
export class TemplatesService {
  async getTemplates(companyId: string) {
    return prisma.leaseTemplate.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    return prisma.leaseTemplate.create({ data: { companyId, createdBy, ...dto as any } });
  }

  async updateTemplate(id: string, companyId: string, dto: Record<string, unknown>) {
    const tmpl = await prisma.leaseTemplate.findFirst({ where: { id, companyId } });
    if (!tmpl) throw AppError.notFound('Template');
    return prisma.leaseTemplate.update({ where: { id }, data: dto as any });
  }
}

export class ClausesService {
  async getClauses(companyId: string) {
    return prisma.leaseClause.findMany({ where: { companyId, isActive: true }, orderBy: [{ isStandard: 'desc' }, { category: 'asc' }] });
  }

  async createClause(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    return prisma.leaseClause.create({ data: { companyId, createdBy, ...dto as any } });
  }

  async deleteClause(id: string, companyId: string) {
    const clause = await prisma.leaseClause.findFirst({ where: { id, companyId } });
    if (!clause) throw AppError.notFound('Clause');
    await prisma.leaseClause.update({ where: { id }, data: { isActive: false } });
  }
}

export const leasesService    = new LeasesService();
export const amendmentsService = new AmendmentsService();
export const esignService     = new EsignService();
export const templatesService = new TemplatesService();
export const clausesService   = new ClausesService();
