import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { geocodingService } from '../../common/geocoding.service';
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
    propertyIds?: string[];
  }) {
    const { search, branchId, propertyType, status, regionId, propertyIds, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId, deletedAt: null };

    // Property-level access scoping
    if (propertyIds && propertyIds.length > 0) {
      where.id = { in: propertyIds };
    }

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

  // ── Minimal scoped list (for context switchers, e.g. sidebar "Active Property") ──
  async listMinimal(companyId: string, propertyIds?: string[]) {
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (propertyIds && propertyIds.length > 0) where.id = { in: propertyIds };
    return prisma.property.findMany({
      where,
      select: { id: true, name: true, code: true, currency: true },
      orderBy: { name: 'asc' },
    });
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

  /**
   * Generate a unique property code from the property name, scoped to the company
   * (code is only unique per-company, unlike the global company code).
   * Strips non-alphanumeric chars, uppercases, truncates to 8 chars,
   * and appends a numeric suffix if the code already exists.
   */
  async generateCode(name: string, companyId: string): Promise<string> {
    const base = name
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8)
      .toUpperCase();

    if (!base) return `PR${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const existing = await prisma.property.findUnique({ where: { uq_property_code_company: { code: base, companyId } } });
    if (!existing) return base;

    for (let i = 2; i < 100; i++) {
      const candidate = `${base.substring(0, 6)}${i}`;
      const exists = await prisma.property.findUnique({ where: { uq_property_code_company: { code: candidate, companyId } } });
      if (!exists) return candidate;
    }

    return `${base.substring(0, 12)}${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  // ── Create ────────────────────────────────────
  async create(dto: Record<string, unknown>, companyId: string, userId: string) {
    if (!dto.code || !String(dto.code).trim()) {
      dto.code = await this.generateCode((dto.name as string) || '', companyId);
    }

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

    // Auto-geocode if address present but no coordinates
    if ((dto.addressLine1 || dto.city) && !dto.geoLat && !dto.geoLng) {
      const coords = await geocodingService.geocodeFromFields(dto as any);
      if (coords) {
        dto.geoLat = coords.lat;
        dto.geoLng = coords.lng;
        logger.info(`Auto-geocoded new property "${dto.name}" → ${coords.lat}, ${coords.lng}`);
      }
    }

    // Strip undefined values so Prisma v6 strict mode doesn't reject them
    const cleanDto = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );

    const property = await prisma.property.create({
      data: { companyId, ...cleanDto } as any,
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

    // Auto-geocode if address changed but no coordinates provided
    const addressChanged = dto.addressLine1 || dto.city || dto.state || dto.country || dto.postalCode;
    if (addressChanged && !dto.geoLat && !dto.geoLng) {
      const merged = {
        addressLine1: (dto.addressLine1 as string) ?? existing.addressLine1,
        city: (dto.city as string) ?? existing.city,
        state: (dto.state as string) ?? existing.state,
        postalCode: (dto.postalCode as string) ?? existing.postalCode,
        country: (dto.country as string) ?? existing.country,
      };
      const coords = await geocodingService.geocodeFromFields(merged);
      if (coords) {
        dto.geoLat = coords.lat;
        dto.geoLng = coords.lng;
        logger.info(`Auto-geocoded updated property ${propertyId} → ${coords.lat}, ${coords.lng}`);
      }
    }

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
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { totalUnits: true },
    });
    if (!property) throw AppError.notFound('Property');

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [statusCounts, activeLeases, expiringLeases] = await Promise.all([
      prisma.unit.groupBy({
        by: ['status'],
        where: { propertyId, deletedAt: null },
        _count: true,
      }),
      prisma.lease.count({ where: { propertyId, status: 'active' } }),
      prisma.lease.count({
        where: { propertyId, status: 'active', endDate: { gte: now, lte: in30Days } },
      }),
    ]);

    const unitCounts = { available: 0, occupied: 0, reserved: 0, maintenance: 0, not_for_rent: 0 };
    let totalCounted = 0;
    for (const s of statusCounts) {
      (unitCounts as any)[s.status] = s._count;
      totalCounted += s._count;
    }

    const occupancyRate = totalCounted > 0 ? Math.round((unitCounts.occupied / totalCounted) * 100) : 0;

    return {
      totalUnits: property.totalUnits,
      occupiedUnits: unitCounts.occupied,
      availableUnits: unitCounts.available,
      maintenanceUnits: unitCounts.maintenance,
      occupancyRate,
      activeLeases,
      expiringLeases,
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
    const sharp = (await import('sharp')).default;
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw AppError.notFound('Property');

    const existing = await prisma.propertyPhoto.count({ where: { propertyId } });
    const hasNoCover = (await prisma.propertyPhoto.count({ where: { propertyId, isCover: true } })) === 0;

    const created = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ts = Date.now();
      const baseName = file.originalname.replace(/\.[^.]+$/, '');

      // ── Resize main image (max 1920px wide, JPEG 85%) ──
      let mainBuffer: Buffer;
      try {
        mainBuffer = await sharp(file.buffer)
          .resize({ width: 1920, withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
      } catch {
        // If sharp fails (e.g. non-image), fall back to original buffer
        mainBuffer = file.buffer;
      }

      const mainKey = `photos/${propertyId}/${ts}_${i}_${baseName}.jpg`;
      await storageService.saveFile(mainKey, mainBuffer, 'image/jpeg');
      const mainUrl = storageService.getFileUrl(mainKey);

      // ── Generate thumbnail (300px wide, JPEG 70%) ──
      let thumbUrl: string | null = null;
      try {
        const thumbBuffer = await sharp(file.buffer)
          .resize({ width: 300, withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
        const thumbKey = `photos/${propertyId}/${ts}_${i}_${baseName}_thumb.jpg`;
        await storageService.saveFile(thumbKey, thumbBuffer, 'image/jpeg');
        thumbUrl = storageService.getFileUrl(thumbKey);
      } catch {
        // Thumbnail generation failed — proceed without it
        logger.warn(`Thumbnail generation failed for ${file.originalname}`);
      }

      const isCover = hasNoCover && i === 0 && existing === 0;
      const photo = await prisma.propertyPhoto.create({
        data: {
          propertyId,
          storageKey: mainKey,
          url: mainUrl,
          thumbnailUrl: thumbUrl,
          isCover,
          sortOrder: existing + i,
          uploadedBy,
        },
      });

      if (isCover) {
        await prisma.property.update({ where: { id: propertyId }, data: { coverImageUrl: mainUrl } });
      }

      created.push(photo);
      logger.info(`Photo uploaded: ${mainKey} (${file.buffer.length} → ${mainBuffer.length} bytes)`);
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

  // ── Nearby Search (Haversine) ──────────────
  async findNearby(companyId: string, query: {
    lat: number; lng: number; radiusKm?: number;
    excludePropertyId?: string; limit?: number;
  }) {
    const { lat, lng, radiusKm = 5, excludePropertyId, limit = 20 } = query;
    const EARTH_RADIUS_KM = 6371;

    // Build exclude clause
    const excludeClause = excludePropertyId
      ? `AND p.id != '${excludePropertyId}'`
      : '';

    // Haversine distance formula in raw SQL
    const results = await prisma.$queryRawUnsafe<Array<{
      id: string; name: string; code: string | null;
      property_type: string; status: string;
      address_line1: string | null; city: string | null; country: string | null;
      geo_lat: number; geo_lng: number;
      cover_image_url: string | null;
      distance_km: number;
    }>>(
      `SELECT
        p.id, p.name, p.code, p.property_type, p.status,
        p.address_line1, p.city, p.country,
        p.geo_lat, p.geo_lng, p.cover_image_url,
        (
          $1 * ACOS(
            LEAST(1.0, COS(RADIANS($2)) * COS(RADIANS(p.geo_lat))
            * COS(RADIANS(p.geo_lng) - RADIANS($3))
            + SIN(RADIANS($2)) * SIN(RADIANS(p.geo_lat)))
          )
        ) AS distance_km
      FROM properties p
      WHERE p.company_id = $4::uuid
        AND p.deleted_at IS NULL
        AND p.geo_lat IS NOT NULL
        AND p.geo_lng IS NOT NULL
        ${excludeClause}
      ORDER BY distance_km ASC
      LIMIT $5`,
      EARTH_RADIUS_KM, lat, lng, companyId, limit,
    );

    // Filter by radius in JS (cheaper than HAVING with the same expression)
    return results
      .filter((r) => r.distance_km <= radiusKm)
      .map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        propertyType: r.property_type,
        status: r.status,
        addressLine1: r.address_line1,
        city: r.city,
        country: r.country,
        geoLat: r.geo_lat,
        geoLng: r.geo_lng,
        coverImageUrl: r.cover_image_url,
        distanceKm: Math.round(r.distance_km * 100) / 100,
      }));
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
