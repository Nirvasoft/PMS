import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { storageService } from '../documents/services/storage.service';
import { PROPERTY_TYPES, FACILITY_TYPES } from './seeds/seedData';

// ── Allowed status transitions ────────────────
const STATUS_TRANSITIONS: Record<string, string[]> = {
  active:           ['under_renovation', 'decommissioned'],
  under_renovation: ['active', 'decommissioned'],
  decommissioned:   [],
};

// ── Valid billing days ────────────────────────
const MAX_BILLING_DAY = 28;

// ═══════════════════════════════════════════════════
// PROPERTY TYPES SEED
// ═══════════════════════════════════════════════════
export async function seedPropertyTypes() {
  let created = 0;
  for (const t of PROPERTY_TYPES) {
    const existing = await prisma.propertyType.findUnique({ where: { code: t.code } });
    if (!existing) { await prisma.propertyType.create({ data: t }); created++; }
  }
  for (const f of FACILITY_TYPES) {
    const existing = await prisma.facilityType.findUnique({ where: { code: f.code } });
    if (!existing) { await prisma.facilityType.create({ data: f }); created++; }
  }
  if (created > 0) logger.info(`Seeded ${created} property/facility types`);
}

// ═══════════════════════════════════════════════════
// MAIN PROPERTIES SERVICE
// ═══════════════════════════════════════════════════
export class PropertiesService {

  // ── List ─────────────────────────────────────
  async findAll(companyId: string, query: {
    search?: string; branchId?: string; propertyType?: string;
    status?: string; regionId?: string;
    page?: number; limit?: number; sort?: string; order?: string;
  }) {
    const { search, branchId, propertyType, status, regionId, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId, deletedAt: null };

    if (branchId) where.branchId = branchId;
    if (propertyType) where.propertyType = propertyType;
    if (status) where.status = status;
    if (regionId) where.regionProperties = { some: { regionId } };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          businessUnit: { select: { id: true, name: true } },
          regionProperties: { include: { region: { select: { id: true, name: true } } } },
          manager: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          photos: { where: { isCover: true }, take: 1 },
          _count: { select: { facilities: true, contacts: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.property.count({ where }),
    ]);

    return {
      data: data.map((p) => this.formatProperty(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Get one ───────────────────────────────────
  async findById(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        branch: { select: { id: true, name: true } },
        businessUnit: { select: { id: true, name: true } },
        regionProperties: { include: { region: { select: { id: true, name: true } } } },
        propertyTypeRef: true,
        manager: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        photos: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }] },
        facilities: { include: { facilityType: true }, where: { isActive: true } },
        contacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!property || property.deletedAt) throw AppError.notFound('Property');
    return this.formatProperty(property);
  }

  // ── Create ────────────────────────────────────
  async create(dto: Record<string, unknown>, companyId: string, userId: string) {
    // Validate limits
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    const settings = (company?.settings ?? {}) as Record<string, unknown>;
    const maxProperties = settings.maxProperties as number | undefined;
    if (maxProperties) {
      const count = await prisma.property.count({ where: { companyId, deletedAt: null } });
      if (count >= maxProperties) throw new AppError(402, 'PROPERTY_LIMIT_REACHED', `Plan allows up to ${maxProperties} properties`);
    }

    // Validate billing day
    if (dto.billingDay && ((dto.billingDay as number) < 1 || (dto.billingDay as number) > MAX_BILLING_DAY)) {
      throw new AppError(400, 'INVALID_BILLING_DAY', `Billing day must be between 1 and ${MAX_BILLING_DAY}`);
    }

    // Validate year built
    const currentYear = new Date().getFullYear();
    if (dto.yearBuilt && ((dto.yearBuilt as number) < 1800 || (dto.yearBuilt as number) > currentYear + 5)) {
      throw new AppError(400, 'INVALID_YEAR_BUILT', `Year built must be between 1800 and ${currentYear + 5}`);
    }

    const property = await prisma.property.create({
      data: { companyId, ...(dto as any) },
    });

    // Record initial status
    await prisma.propertyStatusHistory.create({
      data: { propertyId: property.id, toStatus: 'active', changedBy: userId },
    });

    return property;
  }

  // ── Update ────────────────────────────────────
  async update(propertyId: string, dto: Record<string, unknown>, companyId: string) {
    const existing = await prisma.property.findFirst({ where: { id: propertyId, companyId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Property');
    return prisma.property.update({ where: { id: propertyId }, data: dto as any });
  }

  // ── Status change ─────────────────────────────
  async updateStatus(propertyId: string, dto: { status: string; reason?: string }, userId: string, companyId: string) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId, deletedAt: null } });
    if (!property) throw AppError.notFound('Property');

    const allowed = STATUS_TRANSITIONS[property.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', `Cannot transition from '${property.status}' to '${dto.status}'`);
    }

    // Block decommission if has active leases (stub — no leases table yet)
    // Will be enforced in Phase 2 Module 2.4

    await prisma.propertyStatusHistory.create({
      data: { propertyId, fromStatus: property.status, toStatus: dto.status, reason: dto.reason, changedBy: userId },
    });

    return prisma.property.update({ where: { id: propertyId }, data: { status: dto.status } });
  }

  // ── Status history ────────────────────────────
  async getStatusHistory(propertyId: string) {
    return prisma.propertyStatusHistory.findMany({
      where: { propertyId },
      include: {
        changedByUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { changedAt: 'desc' },
    });
  }

  // ── Summary stats ─────────────────────────────
  async getPropertyStats(propertyId: string) {
    // Phase 2: aggregate from units/leases when those tables exist
    // For now return property-level counts
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { totalUnits: true },
    });
    if (!property) throw AppError.notFound('Property');

    return {
      totalUnits: property.totalUnits,
      occupiedUnits: 0,     // from units table — Phase 2.2
      availableUnits: 0,
      maintenanceUnits: 0,
      occupancyRate: 0,
      activeLeases: 0,      // from leases table — Phase 2.4
      expiringLeases: 0,
    };
  }

  // ── Company-level stats ───────────────────────
  async getStats(companyId: string) {
    const [total, active, byType, byStatus] = await Promise.all([
      prisma.property.count({ where: { companyId, deletedAt: null } }),
      prisma.property.count({ where: { companyId, deletedAt: null, isActive: true } }),
      prisma.property.groupBy({ by: ['propertyType'], where: { companyId, deletedAt: null }, _count: true }),
      prisma.property.groupBy({ by: ['status'], where: { companyId, deletedAt: null }, _count: true }),
    ]);
    return {
      total, active,
      byType: byType.map((g: any) => ({ type: g.propertyType, count: g._count })),
      byStatus: byStatus.map((g: any) => ({ status: g.status, count: g._count })),
    };
  }

  // ── Soft delete ───────────────────────────────
  async delete(propertyId: string, companyId: string) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId, deletedAt: null } });
    if (!property) throw AppError.notFound('Property');
    return prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ── Facility types catalog ────────────────────
  async getFacilityTypes() {
    return prisma.facilityType.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  // ── Property types catalog ────────────────────
  async getPropertyTypes() {
    return prisma.propertyType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  // ── Facilities ────────────────────────────────
  async getFacilities(propertyId: string) {
    return prisma.propertyFacility.findMany({
      where: { propertyId },
      include: { facilityType: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addFacility(propertyId: string, dto: Record<string, unknown>) {
    return prisma.propertyFacility.create({
      data: { propertyId, ...(dto as any) },
      include: { facilityType: true },
    });
  }

  async updateFacility(propertyId: string, facilityId: string, dto: Record<string, unknown>) {
    const fac = await prisma.propertyFacility.findFirst({ where: { id: facilityId, propertyId } });
    if (!fac) throw AppError.notFound('Facility');
    return prisma.propertyFacility.update({ where: { id: facilityId }, data: dto as any, include: { facilityType: true } });
  }

  async removeFacility(propertyId: string, facilityId: string) {
    const fac = await prisma.propertyFacility.findFirst({ where: { id: facilityId, propertyId } });
    if (!fac) throw AppError.notFound('Facility');
    await prisma.propertyFacility.delete({ where: { id: facilityId } });
  }

  // ── Contacts ──────────────────────────────────
  async getContacts(propertyId: string) {
    return prisma.propertyContact.findMany({
      where: { propertyId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async addContact(propertyId: string, dto: Record<string, unknown>) {
    return prisma.propertyContact.create({ data: { propertyId, ...(dto as any) } });
  }

  async updateContact(propertyId: string, contactId: string, dto: Record<string, unknown>) {
    const contact = await prisma.propertyContact.findFirst({ where: { id: contactId, propertyId } });
    if (!contact) throw AppError.notFound('Contact');
    return prisma.propertyContact.update({ where: { id: contactId }, data: dto as any });
  }

  async removeContact(propertyId: string, contactId: string) {
    const contact = await prisma.propertyContact.findFirst({ where: { id: contactId, propertyId } });
    if (!contact) throw AppError.notFound('Contact');
    await prisma.propertyContact.delete({ where: { id: contactId } });
  }

  // ── Photos ────────────────────────────────────
  async getPhotos(propertyId: string) {
    return prisma.propertyPhoto.findMany({
      where: { propertyId },
      orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async uploadPhotos(propertyId: string, files: Express.Multer.File[], uploadedBy: string) {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw AppError.notFound('Property');

    const existing = await prisma.propertyPhoto.count({ where: { propertyId } });
    const hasNoCover = (await prisma.propertyPhoto.count({ where: { propertyId, isCover: true } })) === 0;

    const created = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = `photos/${propertyId}/${Date.now()}_${i}_${file.originalname}`;
      const { path: filePath } = await storageService.saveFile(key, file.buffer);

      const url = storageService.getFileUrl(key);
      const isCover = hasNoCover && i === 0 && existing === 0;
      const photo = await prisma.propertyPhoto.create({
        data: {
          propertyId,
          storageKey: key,
          url,
          isCover,
          sortOrder: existing + i,
          uploadedBy,
        },
      });

      if (isCover) {
        await prisma.property.update({ where: { id: propertyId }, data: { coverImageUrl: url } });
      }

      created.push(photo);
    }

    return created;
  }

  async reorderPhotos(propertyId: string, order: string[]) {
    for (let i = 0; i < order.length; i++) {
      await prisma.propertyPhoto.updateMany({
        where: { id: order[i], propertyId },
        data: { sortOrder: i },
      });
    }
  }

  async setCoverPhoto(propertyId: string, photoId: string) {
    await prisma.propertyPhoto.updateMany({ where: { propertyId }, data: { isCover: false } });
    const photo = await prisma.propertyPhoto.update({
      where: { id: photoId },
      data: { isCover: true },
    });
    await prisma.property.update({ where: { id: propertyId }, data: { coverImageUrl: photo.url } });
    return photo;
  }

  async deletePhoto(propertyId: string, photoId: string) {
    const photo = await prisma.propertyPhoto.findFirst({ where: { id: photoId, propertyId } });
    if (!photo) throw AppError.notFound('Photo');

    await storageService.deleteFile(photo.storageKey);
    await prisma.propertyPhoto.delete({ where: { id: photoId } });

    // Promote next photo to cover if deleted was cover
    if (photo.isCover) {
      const next = await prisma.propertyPhoto.findFirst({
        where: { propertyId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await prisma.propertyPhoto.update({ where: { id: next.id }, data: { isCover: true } });
        await prisma.property.update({ where: { id: propertyId }, data: { coverImageUrl: next.url } });
      } else {
        await prisma.property.update({ where: { id: propertyId }, data: { coverImageUrl: null } });
      }
    }
  }

  // ── Helper ────────────────────────────────────
  private formatProperty(p: Record<string, any>) {
    return {
      ...p,
      regions: p.regionProperties?.map((rp: any) => rp.region) ?? [],
      regionProperties: undefined,
      coverImageUrl: p.coverImageUrl ?? p.photos?.find((ph: any) => ph.isCover)?.url ?? p.imageUrl,
    };
  }
}

export const propertiesService = new PropertiesService();
