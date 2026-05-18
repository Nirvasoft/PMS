import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import {
  UNIT_TYPES, UNIT_STATUS_TRANSITIONS, SQM_TO_SQFT,
  UNIT_NUMBER_REGEX, UNIT_NUMBER_MAX_LENGTH,
} from './seeds/seedData';

// ══════════════════════════════════════════════
// SEED
// ══════════════════════════════════════════════
export async function seedUnitTypes() {
  let created = 0;
  for (const t of UNIT_TYPES) {
    const existing = await prisma.unitType.findUnique({ where: { code: t.code } });
    if (!existing) { await prisma.unitType.create({ data: t }); created++; }
  }
  if (created > 0) logger.info(`Seeded ${created} unit types`);
}

// ══════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════
function autoConvertArea(data: Record<string, unknown>) {
  const sqft = data.areaSqft as number | undefined;
  const sqm  = data.areaSqm  as number | undefined;
  if (sqft && !sqm) data.areaSqm  = Math.round((sqft / SQM_TO_SQFT) * 100) / 100;
  if (sqm  && !sqft) data.areaSqft = Math.round(sqm * SQM_TO_SQFT * 100) / 100;
}

function validateUnitNumber(unitNumber: string) {
  if (!UNIT_NUMBER_REGEX.test(unitNumber))
    throw new AppError(400, 'INVALID_UNIT_NUMBER', 'Unit number may only contain alphanumeric characters, hyphens, and slashes');
  if (unitNumber.length > UNIT_NUMBER_MAX_LENGTH)
    throw new AppError(400, 'UNIT_NUMBER_TOO_LONG', `Unit number max length is ${UNIT_NUMBER_MAX_LENGTH}`);
}

// ══════════════════════════════════════════════
// TOWERS SERVICE
// ══════════════════════════════════════════════
export class TowersService {
  async findAll(propertyId: string) {
    const towers = await prisma.tower.findMany({
      where: { propertyId, isActive: true },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { units: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Add per-status unit counts
    const result = await Promise.all(towers.map(async (t) => {
      const statusCounts = await prisma.unit.groupBy({
        by: ['status'],
        where: { towerId: t.id, deletedAt: null },
        _count: true,
      });
      const unitStats = { total: t._count.units, available: 0, occupied: 0, reserved: 0, maintenance: 0, not_for_rent: 0 };
      for (const s of statusCounts) {
        (unitStats as any)[s.status] = s._count;
      }
      return { ...t, unitStats };
    }));

    return result;
  }

  async create(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    const { sections, ...towerData } = dto;
    return prisma.tower.create({
      data: {
        propertyId,
        companyId,
        ...towerData as any,
        sections: sections
          ? { create: (sections as any[]).map((s: any, i: number) => ({ ...s, sortOrder: i })) }
          : undefined,
      },
      include: { sections: true },
    });
  }

  async update(towerId: string, propertyId: string, dto: Record<string, unknown>) {
    const tower = await prisma.tower.findFirst({ where: { id: towerId, propertyId } });
    if (!tower) throw AppError.notFound('Tower');
    return prisma.tower.update({ where: { id: towerId }, data: dto as any, include: { sections: true } });
  }

  async delete(towerId: string, propertyId: string) {
    const tower = await prisma.tower.findFirst({ where: { id: towerId, propertyId } });
    if (!tower) throw AppError.notFound('Tower');
    const unitCount = await prisma.unit.count({ where: { towerId, deletedAt: null } });
    if (unitCount > 0) throw new AppError(409, 'TOWER_HAS_UNITS', `Cannot delete tower with ${unitCount} active units`);
    return prisma.tower.delete({ where: { id: towerId } });
  }

  // Sections
  async addSection(towerId: string, dto: Record<string, unknown>) {
    return prisma.towerSection.create({ data: { towerId, ...dto as any } });
  }

  async updateSection(towerId: string, sectionId: string, dto: Record<string, unknown>) {
    const section = await prisma.towerSection.findFirst({ where: { id: sectionId, towerId } });
    if (!section) throw AppError.notFound('Section');
    return prisma.towerSection.update({ where: { id: sectionId }, data: dto as any });
  }

  async deleteSection(towerId: string, sectionId: string) {
    const section = await prisma.towerSection.findFirst({ where: { id: sectionId, towerId } });
    if (!section) throw AppError.notFound('Section');
    // Unlink units from this section
    await prisma.unit.updateMany({ where: { sectionId }, data: { sectionId: null } });
    return prisma.towerSection.delete({ where: { id: sectionId } });
  }
}

// ══════════════════════════════════════════════
// UNITS SERVICE
// ══════════════════════════════════════════════
export class UnitsService {

  // ── List ───────────────────────────────────
  async findAll(propertyId: string, query: {
    towerId?: string; sectionId?: string; status?: string; unitType?: string;
    floor?: number; search?: string; page?: number; limit?: number;
  }) {
    const { towerId, sectionId, status, unitType, floor, search, page = 1, limit = 50 } = query;
    const where: Record<string, unknown> = { propertyId, deletedAt: null };

    if (towerId)   where.towerId   = towerId;
    if (sectionId) where.sectionId = sectionId;
    if (status)    where.status    = status;
    if (unitType)  where.unitType  = unitType;
    if (floor !== undefined) where.floorNumber = floor;
    if (search)    where.OR = [
      { unitNumber:  { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { ownerName:   { contains: search, mode: 'insensitive' } },
    ];

    const [data, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        include: {
          tower:       { select: { id: true, name: true, code: true } },
          section:     { select: { id: true, name: true } },
          unitTypeRef: { select: { id: true, code: true, name: true, category: true } },
          meters:      { where: { isActive: true }, select: { meterType: true, meterSerialNo: true } },
          amenities:   { select: { amenity: true } },
        },
        orderBy: [{ floorNumber: 'asc' }, { unitNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.unit.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Get one ────────────────────────────────
  async findById(propertyId: string, unitId: string) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, propertyId, deletedAt: null },
      include: {
        tower:        { select: { id: true, name: true, code: true } },
        section:      { select: { id: true, name: true } },
        unitTypeRef:  true,
        meters:       { where: { isActive: true } },
        amenities:    true,
        statusHistory: {
          include: {
            changedByUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { changedAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!unit) throw AppError.notFound('Unit');
    return unit;
  }

  // ── Create ─────────────────────────────────
  async create(propertyId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const { amenities, ...unitData } = dto;

    validateUnitNumber(unitData.unitNumber as string);
    autoConvertArea(unitData);

    // Check unique
    const existing = await prisma.unit.findFirst({ where: { unitNumber: unitData.unitNumber as string, propertyId, deletedAt: null } });
    if (existing) throw new AppError(409, 'UNIT_NUMBER_TAKEN', `Unit number "${unitData.unitNumber}" already exists`);

    const unit = await prisma.unit.create({
      data: {
        propertyId, companyId,
        ...unitData as any,
        amenities: amenities
          ? { create: (amenities as string[]).map((a) => ({ amenity: a })) }
          : undefined,
      },
    });

    // Record initial status
    await prisma.unitStatusHistory.create({
      data: { unitId: unit.id, toStatus: 'available', changedBy: userId },
    });

    // Increment property totalUnits
    await prisma.property.update({ where: { id: propertyId }, data: { totalUnits: { increment: 1 } } });

    return unit;
  }

  // ── Bulk create ────────────────────────────
  async bulkCreate(propertyId: string, companyId: string, dto: {
    towerId?: string;
    floorRange?: { from: number; to: number; unitsPerFloor: number; unitTypeId: string; areaSqft?: number; areaSqm?: number; prefix?: string };
    floors?: Array<{ floorNumber: number; units: Array<Record<string, unknown>> }>;
  }, userId: string) {
    const units: Array<Record<string, unknown>> = [];

    if (dto.floorRange) {
      const { from, to, unitsPerFloor, unitTypeId, areaSqft, areaSqm, prefix } = dto.floorRange;
      const unitType = await prisma.unitType.findUniqueOrThrow({ where: { id: unitTypeId } });
      const areaSqmCalc = areaSqm ?? (areaSqft ? Math.round((areaSqft / SQM_TO_SQFT) * 100) / 100 : undefined);
      const areaSqftCalc = areaSqft ?? (areaSqm ? Math.round(areaSqm * SQM_TO_SQFT * 100) / 100 : undefined);

      for (let floor = from; floor <= to; floor++) {
        for (let u = 1; u <= unitsPerFloor; u++) {
          const unitNum = u.toString().padStart(2, '0');
          const unitNumber = `${floor}${prefix ?? ''}${unitNum}`;
          validateUnitNumber(unitNumber);
          units.push({
            propertyId, companyId,
            towerId: dto.towerId ?? null,
            unitNumber,
            unitType: unitType.code,
            unitTypeId,
            floorNumber: floor,
            floorLabel: String(floor),
            areaSqft: areaSqftCalc,
            areaSqm: areaSqmCalc,
            status: 'available',
          });
        }
      }
    }

    // Check for conflicts
    const unitNumbers = units.map((u) => u.unitNumber as string);
    const existing = await prisma.unit.findMany({
      where: { propertyId, unitNumber: { in: unitNumbers }, deletedAt: null },
      select: { unitNumber: true },
    });
    if (existing.length > 0) {
      throw new AppError(409, 'UNIT_NUMBER_CONFLICT', `${existing.length} unit number(s) already exist`, {
        conflicts: existing.map((e) => e.unitNumber),
      });
    }

    // Create in transaction
    const created = await prisma.$transaction(async (tx) => {
      const createdUnits = await Promise.all(
        units.map((u) => tx.unit.create({ data: u as any }))
      );
      // Bulk status history
      await tx.unitStatusHistory.createMany({
        data: createdUnits.map((u) => ({ unitId: u.id, toStatus: 'available', changedBy: userId })),
      });
      // Update property totalUnits
      await tx.property.update({ where: { id: propertyId }, data: { totalUnits: { increment: createdUnits.length } } });
      return createdUnits;
    });

    return {
      created: created.length,
      units: created.map((u) => ({ id: u.id, unitNumber: u.unitNumber })),
    };
  }

  // ── Update ─────────────────────────────────
  async update(propertyId: string, unitId: string, dto: Record<string, unknown>) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null } });
    if (!unit) throw AppError.notFound('Unit');

    const { amenities, ...unitData } = dto;
    autoConvertArea(unitData);

    if (unitData.unitNumber && unitData.unitNumber !== unit.unitNumber) {
      validateUnitNumber(unitData.unitNumber as string);
      const conflict = await prisma.unit.findFirst({ where: { unitNumber: unitData.unitNumber as string, propertyId, id: { not: unitId }, deletedAt: null } });
      if (conflict) throw new AppError(409, 'UNIT_NUMBER_TAKEN', `Unit number "${unitData.unitNumber}" already exists`);
    }

    return prisma.unit.update({ where: { id: unitId }, data: unitData as any });
  }

  // ── Status change ──────────────────────────
  async updateStatus(propertyId: string, unitId: string, dto: { status: string; reason?: string }, userId: string) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null } });
    if (!unit) throw AppError.notFound('Unit');

    const allowed = UNIT_STATUS_TRANSITIONS[unit.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', `Cannot transition from '${unit.status}' to '${dto.status}'`);
    }

    await prisma.unitStatusHistory.create({
      data: { unitId, fromStatus: unit.status, toStatus: dto.status, reason: dto.reason, changedBy: userId },
    });

    return prisma.unit.update({ where: { id: unitId }, data: { status: dto.status } });
  }

  // ── Floor plan matrix ──────────────────────
  async getFloorPlan(propertyId: string, towerId?: string) {
    const where: Record<string, unknown> = { propertyId, deletedAt: null };
    if (towerId) where.towerId = towerId;

    const units = await prisma.unit.findMany({
      where,
      select: {
        id: true, unitNumber: true, unitType: true, areaSqft: true,
        status: true, furnishing: true, floorNumber: true, floorLabel: true,
        towerId: true,
        tower: { select: { id: true, name: true } },
      },
      orderBy: [{ floorNumber: 'desc' }, { unitNumber: 'asc' }],
    });

    // Group by floor
    const floorMap = new Map<number, typeof units>();
    for (const unit of units) {
      const floor = unit.floorNumber ?? 0;
      if (!floorMap.has(floor)) floorMap.set(floor, []);
      floorMap.get(floor)!.push(unit);
    }

    return {
      floors: Array.from(floorMap.entries()).map(([floorNumber, floorUnits]) => ({
        floorNumber,
        floorLabel: floorUnits[0]?.floorLabel ?? String(floorNumber),
        units: floorUnits,
      })),
    };
  }

  // ── Stats ──────────────────────────────────
  async getStats(propertyId: string) {
    const statusCounts = await prisma.unit.groupBy({
      by: ['status'],
      where: { propertyId, deletedAt: null },
      _count: true,
    });

    const stats = { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0, not_for_rent: 0 };
    for (const s of statusCounts) {
      (stats as any)[s.status] = s._count;
      stats.total += s._count;
    }

    const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
    return { ...stats, occupancyRate };
  }

  // ── Soft delete ─────────────────────────────
  async delete(propertyId: string, unitId: string) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null } });
    if (!unit) throw AppError.notFound('Unit');
    // TODO: block if has active lease (Phase 2.4)
    await prisma.unit.update({ where: { id: unitId }, data: { deletedAt: new Date(), isActive: false } });
    await prisma.property.update({ where: { id: propertyId }, data: { totalUnits: { decrement: 1 } } });
  }

  // ── Floor plan upload ──────────────────────
  async uploadFloorPlan(propertyId: string, unitId: string, file: Express.Multer.File) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId, deletedAt: null } });
    if (!unit) throw AppError.notFound('Unit');

    // Store using local storage (same as documents pattern)
    const fs = await import('fs/promises');
    const path = await import('path');
    const crypto = await import('crypto');
    const uploadDir = path.join(process.cwd(), 'uploads', 'units', propertyId, unitId);
    await fs.mkdir(uploadDir, { recursive: true });
    const ext = path.extname(file.originalname);
    const filename = `floor-plan${ext}`;
    await fs.writeFile(path.join(uploadDir, filename), file.buffer);
    const floorPlanUrl = `/uploads/units/${propertyId}/${unitId}/${filename}`;

    return prisma.unit.update({ where: { id: unitId }, data: { floorPlanUrl } });
  }

  // ── Amenities ──────────────────────────────
  async setAmenities(unitId: string, amenities: string[]) {
    await prisma.unitAmenity.deleteMany({ where: { unitId } });
    if (amenities.length > 0) {
      await prisma.unitAmenity.createMany({
        data: amenities.map((a) => ({ unitId, amenity: a })),
      });
    }
    return prisma.unitAmenity.findMany({ where: { unitId } });
  }

  // Unit types catalog
  async getUnitTypes() {
    return prisma.unitType.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }
}

// ══════════════════════════════════════════════
// METERS SERVICE
// ══════════════════════════════════════════════
export class MetersService {
  async findAll(unitId: string) {
    return prisma.utilityMeter.findMany({ where: { unitId, isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  async create(unitId: string, propertyId: string, companyId: string, dto: Record<string, unknown>) {
    // One meter per type per unit
    const existing = await prisma.utilityMeter.findFirst({ where: { unitId, meterType: dto.meterType as string, isActive: true } });
    if (existing) throw new AppError(409, 'METER_TYPE_EXISTS', `A ${dto.meterType} meter already exists for this unit`);

    return prisma.utilityMeter.create({ data: { unitId, propertyId, companyId, ...dto as any } });
  }

  async update(meterId: string, unitId: string, dto: Record<string, unknown>) {
    const meter = await prisma.utilityMeter.findFirst({ where: { id: meterId, unitId } });
    if (!meter) throw AppError.notFound('Meter');
    return prisma.utilityMeter.update({ where: { id: meterId }, data: dto as any });
  }

  async delete(meterId: string, unitId: string) {
    const meter = await prisma.utilityMeter.findFirst({ where: { id: meterId, unitId } });
    if (!meter) throw AppError.notFound('Meter');
    await prisma.utilityMeter.update({ where: { id: meterId }, data: { isActive: false } });
  }
}

export const towersService = new TowersService();
export const unitsService  = new UnitsService();
export const metersService = new MetersService();
