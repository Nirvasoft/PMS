import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import {
  createTenantSchema, updateTenantSchema, createKycRequirementSchema,
  updateKycRequirementSchema, submitKycDocumentSchema, reviewKycDocumentSchema,
  blacklistTenantSchema, whitelistTenantSchema, createEmergencyContactSchema,
  updateEmergencyContactSchema, createTenantNoteSchema, updateTenantNoteSchema
} from './tenants.schema';
import { webhookTenantCreated, webhookTenantBlacklisted } from '../../common/webhookHooks';

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function displayName(t: { tenantType: string; firstName?: string | null; lastName?: string | null; companyName?: string | null }): string {
  if (t.tenantType === 'company' || t.tenantType === 'corporate') return t.companyName || 'Unnamed Company';
  return [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Unnamed Tenant';
}

// KYC status auto-calculation
async function recalcKycStatus(tenantId: string): Promise<void> {
  const docs = await prisma.tenantKycDocument.findMany({
    where: { tenantId },
    include: { requirement: { select: { isRequired: true } } },
  });

  const requiredDocs = docs.filter((d) => d.requirement.isRequired);

  let kycStatus = 'pending';
  if (requiredDocs.length > 0) {
    const allApproved = requiredDocs.every((d) => d.status === 'approved');
    const anyRejected = requiredDocs.some((d) => d.status === 'rejected');
    const anySubmitted = requiredDocs.some((d) => d.status !== 'pending');

    if (allApproved) kycStatus = 'verified';
    else if (anyRejected) kycStatus = 'rejected';
    else if (anySubmitted) kycStatus = 'in_review';
    else kycStatus = 'pending';
  }

  const kycVerifiedAt = kycStatus === 'verified' ? new Date() : undefined;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      kycStatus,
      ...(kycVerifiedAt ? { kycVerifiedAt } : {}),
    },
  });
}

// Default KYC requirements seeded for new companies
const DEFAULT_KYC_REQUIREMENTS = {
  individual: [
    { docType: 'national_id',     name: 'National ID / NRIC',         isRequired: true,  sortOrder: 0 },
    { docType: 'passport',        name: 'Passport',                   isRequired: false, sortOrder: 1 },
    { docType: 'bank_statement',  name: 'Bank Statement (3 months)',   isRequired: true,  sortOrder: 2 },
    { docType: 'proof_of_income', name: 'Proof of Income',            isRequired: true,  sortOrder: 3 },
  ],
  company: [
    { docType: 'trade_license',   name: 'Business Registration',       isRequired: true,  sortOrder: 0 },
    { docType: 'bank_statement',  name: 'Company Bank Statement',      isRequired: true,  sortOrder: 1 },
    { docType: 'gst_certificate', name: 'GST Registration Certificate',isRequired: false, sortOrder: 2 },
    { docType: 'director_id',     name: 'Director / Shareholder ID',   isRequired: true,  sortOrder: 3 },
  ],
};

// ══════════════════════════════════════════════
// TENANTS SERVICE
// ══════════════════════════════════════════════
export class TenantsService {

  // ── List ───────────────────────────────────
  async findAll(companyId: string, query: {
    search?: string; tenantType?: string; kycStatus?: string;
    isBlacklisted?: boolean; tags?: string[];
    page?: number; limit?: number; sort?: string; order?: 'asc' | 'desc';
  }) {
    const { search, tenantType, kycStatus, isBlacklisted, tags, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (tenantType) where.tenantType = tenantType === 'company' ? { in: ['company', 'corporate'] } : tenantType;
    if (kycStatus)                     where.kycStatus = kycStatus;
    if (isBlacklisted !== undefined)   where.isBlacklisted = isBlacklisted;
    if (tags?.length)                  where.tags = { hasSome: tags };
    if (search) {
      where.OR = [
        { firstName:   { contains: search, mode: 'insensitive' } },
        { lastName:    { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email:       { contains: search, mode: 'insensitive' } },
        { mobile:      { contains: search, mode: 'insensitive' } },
        { idNumber:    { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rawData, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        select: {
          id: true, tenantType: true, firstName: true, lastName: true,
          companyName: true, email: true, mobile: true, kycStatus: true,
          isBlacklisted: true, avatarUrl: true, tags: true, source: true,
          createdAt: true,
          _count: { select: { leases: { where: { status: 'active' } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    const data = rawData.map((t) => {
      const { _count, ...rest } = t;
      return { ...rest, displayName: displayName(t as any), activeLeases: _count?.leases || 0 };
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Get one ────────────────────────────────
  async findById(id: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        emergencyContacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        kycDocuments: {
          include: { requirement: true, reviewer: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
          orderBy: { requirement: { sortOrder: 'asc' } },
        },
        _count: { select: { tenantNotes: true } },
      },
    });
    if (!tenant) throw AppError.notFound('Tenant');

    // KYC summary
    const kycDocs = tenant.kycDocuments;
    const kycSummary = {
      status: tenant.kycStatus,
      submitted: kycDocs.filter((d) => d.status !== 'pending').length,
      approved:  kycDocs.filter((d) => d.status === 'approved').length,
      pending:   kycDocs.filter((d) => d.status === 'pending').length,
      rejected:  kycDocs.filter((d) => d.status === 'rejected').length,
    };

    return { ...tenant, displayName: displayName(tenant), kycSummary };
  }

  // ── Create ─────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>) {
    const parsedData = createTenantSchema.parse(dto);
    const { tags = [], ...rest } = parsedData;

    // Duplicate check
    const email = rest.email as string | undefined;
    const idNumber = rest.idNumber as string | undefined;
    const companyRegNo = rest.companyRegNo as string | undefined;
    const tenantType = (rest.tenantType as string) || 'individual';

    if (email) {
      const dup = await prisma.tenant.findFirst({ where: { companyId, email, deletedAt: null } });
      if (dup) throw new AppError(409, 'DUPLICATE_TENANT', 'A tenant with this email already exists', { existingId: dup.id });
    }

    if (tenantType === 'individual') {
      const firstName = typeof rest.firstName === 'string' && rest.firstName.trim() ? rest.firstName.trim() : null;
      if (firstName) {
        const dup = await prisma.tenant.findFirst({ where: { companyId, firstName, deletedAt: null } });
        if (dup) throw new AppError(409, 'DUPLICATE_TENANT', `Code "${firstName}" is already used by another tenant`, { existingId: dup.id });
      } else {
        throw AppError.validation('Code is required for individual tenants', 'VALIDATION_ERROR');
      }
    }

    if (tenantType === 'individual' && idNumber) {
      const dup = await prisma.tenant.findFirst({ where: { companyId, idNumber, deletedAt: null } });
      if (dup) throw new AppError(409, 'DUPLICATE_TENANT', 'A tenant with this ID number already exists', { existingId: dup.id });
    }

    if (tenantType === 'company' && companyRegNo) {
      const dup = await prisma.tenant.findFirst({ where: { companyId, companyRegNo, deletedAt: null } });
      if (dup) throw new AppError(409, 'DUPLICATE_TENANT', 'A tenant with this company registration already exists', { existingId: dup.id });
    }

    // Blacklist check on email
    if (email) {
      const bl = await prisma.tenant.findFirst({ where: { companyId, email, isBlacklisted: true } });
      if (bl) throw new AppError(403, 'TENANT_BLACKLISTED', 'This email belongs to a blacklisted tenant', { tenantId: bl.id });
    }

    const tenant = await prisma.tenant.create({
      data: { companyId, tags, ...rest },
    });

    // Initialize KYC checklist
    await this.initKycChecklist(tenant.id, tenantType, companyId);

    webhookTenantCreated(tenant);
    return { ...tenant, displayName: displayName(tenant) };
  }

  // ── Update ─────────────────────────────────
  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const tenant = await prisma.tenant.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');

    const parsedData = updateTenantSchema.parse(dto);
    const { tags, ...rest } = parsedData;

    // Duplicate code (firstName) check — exclude self
    if (tenant.tenantType === 'individual' && rest.firstName) {
      const dup = await prisma.tenant.findFirst({
        where: {
          companyId,
          firstName: rest.firstName as string,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (dup) throw new AppError(409, 'DUPLICATE_TENANT', `A tenant with code "${rest.firstName}" already exists`, { existingId: dup.id });
    }

    return prisma.tenant.update({
      where: { id },
      data: { ...rest, ...(tags !== undefined ? { tags } : {}) },
    });
  }

  // ── Soft delete ─────────────────────────────
  async delete(id: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');

    const activeLeases = await prisma.lease.count({
      where: { tenantId: id, status: { in: ['active', 'pending_approval', 'approved'] }, deletedAt: null },
    });
    if (activeLeases > 0) {
      throw new AppError(409, 'HAS_ACTIVE_LEASES', `Cannot delete tenant with ${activeLeases} active lease(s). Terminate or transfer leases first.`);
    }

    await prisma.tenant.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  // ── Lease history ──────────────────────────
  async getLeaseHistory(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');

    const leases = await prisma.lease.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        leaseNumber: true,
        status: true,
        startDate: true,
        endDate: true,
        rentAmount: true,
        currency: true,
        billingCycle: true,
        unit: { select: { unitNumber: true } },
        property: { select: { name: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    return leases.map((l) => ({
      id: l.id,
      leaseNumber: l.leaseNumber,
      unitNumber: l.unit.unitNumber,
      propertyName: l.property.name,
      startDate: l.startDate,
      endDate: l.endDate,
      rentAmount: Number(l.rentAmount),
      currency: l.currency,
      billingCycle: l.billingCycle,
      status: l.status,
    }));
  }

  // ── Merge tenants ──────────────────────────
  async merge(primaryId: string, duplicateId: string, companyId: string, mergedBy: string, confirmActiveLeasesTransfer = false) {
    const [primary, duplicate] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: primaryId, companyId, deletedAt: null } }),
      prisma.tenant.findFirst({ where: { id: duplicateId, companyId, deletedAt: null } }),
    ]);
    if (!primary)   throw AppError.notFound('Primary tenant');
    if (!duplicate) throw AppError.notFound('Duplicate tenant');
    if (primaryId === duplicateId) throw new AppError(400, 'SAME_TENANT', 'Cannot merge a tenant with itself');

    const activeLeases = await prisma.lease.count({
      where: { tenantId: duplicateId, status: 'active' }
    });

    if (activeLeases > 0 && !confirmActiveLeasesTransfer) {
      throw new AppError(400, 'HAS_ACTIVE_LEASES', 'Duplicate tenant has active leases. Please confirm transfer to proceed.');
    }

    await prisma.$transaction(async (tx) => {
      // Migrate related data
      await tx.tenantKycDocument.updateMany({ where: { tenantId: duplicateId }, data: { tenantId: primaryId } });
      await tx.tenantEmergencyContact.updateMany({ where: { tenantId: duplicateId }, data: { tenantId: primaryId } });
      await tx.tenantBlacklistLog.updateMany({ where: { tenantId: duplicateId }, data: { tenantId: primaryId } });
      await tx.tenantNote.updateMany({ where: { tenantId: duplicateId }, data: { tenantId: primaryId } });
      await tx.lease.updateMany({ where: { tenantId: duplicateId }, data: { tenantId: primaryId } });

      // Soft-delete duplicate
      await tx.tenant.update({
        where: { id: duplicateId },
        data: { deletedAt: new Date(), isActive: false, notes: `Merged into ${primaryId} on ${new Date().toISOString()} by ${mergedBy}` },
      });
    });

    return { mergedInto: primaryId, message: 'Tenant records merged successfully.' };
  }

  // ── KYC checklist init ──────────────────────
  private async initKycChecklist(tenantId: string, tenantType: string, companyId: string) {
    let requirements = await prisma.kycRequirement.findMany({
      where: { companyId, tenantType, isActive: true },
    });

    // If company has no custom requirements, seed defaults
    if (requirements.length === 0) {
      const defaults = DEFAULT_KYC_REQUIREMENTS[tenantType as 'individual' | 'company'] || DEFAULT_KYC_REQUIREMENTS.individual;
      requirements = await Promise.all(defaults.map((d) =>
        prisma.kycRequirement.create({ data: { companyId, tenantType, ...d } })
      ));
    }

    await prisma.tenantKycDocument.createMany({
      data: requirements.map((r) => ({
        tenantId, requirementId: r.id, docType: r.docType, status: 'pending',
      })),
      skipDuplicates: true,
    });
  }
}

// ══════════════════════════════════════════════
// KYC SERVICE
// ══════════════════════════════════════════════
export class KycService {

  async getKyc(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, companyId, deletedAt: null },
      select: { kycStatus: true, kycVerifiedAt: true, kycExpiryDate: true },
    });
    if (!tenant) throw AppError.notFound('Tenant');

    const documents = await prisma.tenantKycDocument.findMany({
      where: { tenantId },
      include: {
        requirement: true,
        reviewer: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { requirement: { sortOrder: 'asc' } },
    });

    return {
      status: tenant.kycStatus,
      verifiedAt: tenant.kycVerifiedAt,
      expiryDate: tenant.kycExpiryDate,
      documents: documents.map((d) => ({
        ...d,
        name: d.requirement.name,
        isRequired: d.requirement.isRequired,
      })),
    };
  }

  async submitDocument(tenantId: string, companyId: string, dto: { requirementId: string; documentId: string }) {
    const parsedDto = submitKycDocumentSchema.parse(dto);
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');

    const req = await prisma.kycRequirement.findUniqueOrThrow({ where: { id: parsedDto.requirementId } });

    const existing = await prisma.tenantKycDocument.findFirst({ where: { tenantId, requirementId: parsedDto.requirementId } });

    if (existing) {
      return prisma.tenantKycDocument.update({
        where: { id: existing.id },
        data: { documentId: parsedDto.documentId, status: 'pending', submittedAt: new Date(), reviewedBy: null, reviewedAt: null, rejectionReason: null },
      });
    } else {
      return prisma.tenantKycDocument.create({
        data: { tenantId, requirementId: parsedDto.requirementId, documentId: parsedDto.documentId, docType: req.docType, status: 'pending' },
      });
    }
  }

  async reviewDocument(tenantId: string, kycDocId: string, dto: { decision: string; rejectionReason?: string }, reviewedBy: string) {
    const parsedDto = reviewKycDocumentSchema.parse(dto);
    const doc = await prisma.tenantKycDocument.findFirst({ where: { id: kycDocId, tenantId } });
    if (!doc) throw AppError.notFound('KYC document');

    await prisma.tenantKycDocument.update({
      where: { id: kycDocId },
      data: {
        status: parsedDto.decision === 'approved' ? 'approved' : 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: parsedDto.decision === 'rejected' ? (parsedDto.rejectionReason || null) : null,
      },
    });

    await recalcKycStatus(tenantId);
    return prisma.tenantKycDocument.findUniqueOrThrow({ where: { id: kycDocId } });
  }

  // KYC Requirements CRUD
  async getRequirements(companyId: string, tenantType?: string) {
    return prisma.kycRequirement.findMany({
      where: { companyId, ...(tenantType ? { tenantType } : {}), isActive: true },
      orderBy: [{ tenantType: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createRequirement(companyId: string, dto: Record<string, unknown>) {
    const parsedDto = createKycRequirementSchema.parse(dto);
    return prisma.kycRequirement.create({ data: { companyId, ...parsedDto } });
  }

  async updateRequirement(id: string, companyId: string, dto: Record<string, unknown>) {
    const req = await prisma.kycRequirement.findFirst({ where: { id, companyId } });
    if (!req) throw AppError.notFound('KYC requirement');

    const parsedDto = updateKycRequirementSchema.parse(dto);
    return prisma.kycRequirement.update({ where: { id }, data: parsedDto });
  }

  async deleteRequirement(id: string, companyId: string) {
    const req = await prisma.kycRequirement.findFirst({ where: { id, companyId } });
    if (!req) throw AppError.notFound('KYC Requirement');
    await prisma.kycRequirement.update({ where: { id }, data: { isActive: false } });
  }
}

// ══════════════════════════════════════════════
// BLACKLIST SERVICE
// ══════════════════════════════════════════════
export class BlacklistService {

  async blacklist(tenantId: string, companyId: string, dto: { reason: string; scope?: string; propertyId?: string; notes?: string }, actionedBy: string) {
    const parsedDto = blacklistTenantSchema.parse(dto);
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');
    if (tenant.isBlacklisted) throw new AppError(409, 'ALREADY_BLACKLISTED', 'Tenant is already blacklisted');

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { isBlacklisted: true, blacklistedAt: new Date(), blacklistedBy: actionedBy },
      }),
      prisma.tenantBlacklistLog.create({
        data: {
          tenantId, companyId, action: 'blacklist',
          reason: parsedDto.reason, scope: parsedDto.scope || 'company',
          propertyId: parsedDto.propertyId || null,
          notes: parsedDto.notes || null, actionedBy,
        },
      }),
    ]);

    logger.info(`Tenant ${tenantId} blacklisted by ${actionedBy}`);
    webhookTenantBlacklisted(tenantId, parsedDto.reason, companyId);
  }

  async whitelist(tenantId: string, companyId: string, dto: { reason: string; notes?: string }, actionedBy: string) {
    const parsedDto = whitelistTenantSchema.parse(dto);
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId, deletedAt: null } });
    if (!tenant) throw AppError.notFound('Tenant');
    if (!tenant.isBlacklisted) throw new AppError(409, 'NOT_BLACKLISTED', 'Tenant is not blacklisted');

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { isBlacklisted: false, blacklistedAt: null, blacklistedBy: null },
      }),
      prisma.tenantBlacklistLog.create({
        data: {
          tenantId, companyId, action: 'whitelist',
          reason: parsedDto.reason, scope: 'company',
          notes: parsedDto.notes || null, actionedBy,
        },
      }),
    ]);
  }

  async getBlacklistHistory(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');
    return prisma.tenantBlacklistLog.findMany({
      where: { tenantId },
      include: { actionedByUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { actionedAt: 'desc' },
    });
  }

  async getBlacklisted(companyId: string, page = 1, limit = 20) {
    const where = { companyId, isBlacklisted: true, deletedAt: null };
    const [data, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        select: {
          id: true, tenantType: true, firstName: true, lastName: true,
          companyName: true, email: true, mobile: true, blacklistedAt: true, avatarUrl: true,
        },
        orderBy: { blacklistedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);
    return { data: data.map((t) => ({ ...t, displayName: displayName(t) })), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

// ══════════════════════════════════════════════
// EMERGENCY CONTACTS SERVICE
// ══════════════════════════════════════════════
export class EmergencyContactsService {
  async findAll(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');
    return prisma.tenantEmergencyContact.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async create(tenantId: string, companyId: string, dto: Record<string, unknown>) {
    const parsedDto = createEmergencyContactSchema.parse(dto);
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');
    if (parsedDto.isPrimary) {
      await prisma.tenantEmergencyContact.updateMany({ where: { tenantId, isPrimary: true }, data: { isPrimary: false } });
    }
    return prisma.tenantEmergencyContact.create({ data: { tenantId, ...parsedDto } });
  }

  async update(tenantId: string, contactId: string, dto: Record<string, unknown>) {
    const parsedDto = updateEmergencyContactSchema.parse(dto);
    const contact = await prisma.tenantEmergencyContact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw AppError.notFound('Emergency Contact');
    if (parsedDto.isPrimary) {
      await prisma.tenantEmergencyContact.updateMany({ where: { tenantId, isPrimary: true, id: { not: contactId } }, data: { isPrimary: false } });
    }
    return prisma.tenantEmergencyContact.update({ where: { id: contactId }, data: parsedDto });
  }

  async delete(tenantId: string, contactId: string) {
    const contact = await prisma.tenantEmergencyContact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw AppError.notFound('Emergency Contact');
    await prisma.tenantEmergencyContact.delete({ where: { id: contactId } });
  }
}

// ══════════════════════════════════════════════
// NOTES SERVICE
// ══════════════════════════════════════════════
export class TenantNotesService {
  async findAll(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');
    return prisma.tenantNote.findMany({
      where: { tenantId },
      include: { author: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(tenantId: string, companyId: string, dto: { content: string; isPinned?: boolean }, createdBy: string) {
    const parsedDto = createTenantNoteSchema.parse(dto);
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');
    return prisma.tenantNote.create({
      data: { tenantId, content: parsedDto.content, isPinned: parsedDto.isPinned ?? false, createdBy },
    });
  }

  async update(tenantId: string, noteId: string, dto: { content?: string; isPinned?: boolean }, userId: string) {
    const parsedDto = updateTenantNoteSchema.parse(dto);
    const note = await prisma.tenantNote.findFirst({ where: { id: noteId, tenantId } });
    if (!note) throw AppError.notFound('Note');
    if (note.createdBy !== userId) throw new AppError(403, 'FORBIDDEN', 'You can only edit your own notes');
    return prisma.tenantNote.update({ where: { id: noteId }, data: parsedDto });
  }

  async delete(tenantId: string, noteId: string, userId: string) {
    const note = await prisma.tenantNote.findFirst({ where: { id: noteId, tenantId } });
    if (!note) throw AppError.notFound('Note');
    if (note.createdBy !== userId) throw new AppError(403, 'FORBIDDEN', 'You can only delete your own notes');
    await prisma.tenantNote.delete({ where: { id: noteId } });
  }
}

export const tenantsService       = new TenantsService();
export const kycService           = new KycService();
export const blacklistService     = new BlacklistService();
export const emergencyContactsService = new EmergencyContactsService();
export const tenantNotesService   = new TenantNotesService();
