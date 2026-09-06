import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class SlotsService {
  async findAll(propertyId: string, companyId: string, query: {
    unitId?: string; unitType?: string; zoneId?: string; status?: string; slotType?: string; page?: number; limit?: number;
  }) {
    const { unitId, unitType, zoneId, status, slotType, page = 1, limit = 50 } = query;
    const where: Record<string, unknown> = { propertyId, companyId };
    if (unitId)   where.unitId = unitId;
    if (unitType) where.unit = { unitType };
    if (zoneId)   where.zoneId = zoneId;
    if (status)   where.status = status;
    if (slotType) where.slotType = slotType;

    const [data, total] = await Promise.all([
      prisma.parkingSlot.findMany({
        where,
        include: {
          zone: { select: { id: true, name: true, code: true, zoneType: true } },
        },
        orderBy: { slotNumber: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.parkingSlot.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Company-wide slot list for the "All Properties" view — optionally restricted to a set of property IDs (property-scoped users). */
  async findAllForCompany(companyId: string, query: {
    unitType?: string; zoneId?: string; status?: string; slotType?: string; page?: number; limit?: number; propertyIds?: string[];
  }) {
    const { unitType, zoneId, status, slotType, page = 1, limit = 50, propertyIds } = query;
    const where: Record<string, unknown> = { companyId };
    if (propertyIds) where.propertyId = { in: propertyIds };
    if (unitType) where.unit = { unitType };
    if (zoneId)   where.zoneId = zoneId;
    if (status)   where.status = status;
    if (slotType) where.slotType = slotType;

    const [data, total] = await Promise.all([
      prisma.parkingSlot.findMany({
        where,
        include: {
          zone: { select: { id: true, name: true, code: true, zoneType: true } },
          property: { select: { id: true, name: true, code: true } },
          unit: { select: { id: true, unitNumber: true, floorLabel: true } },
        },
        orderBy: [{ property: { name: 'asc' } }, { slotNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.parkingSlot.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    const zoneId = (dto.zoneId as string) || null;
    const exists = await prisma.parkingSlot.findFirst({
      where: { propertyId, slotNumber: dto.slotNumber as string, zoneId },
    });
    if (exists) throw AppError.conflict(`Slot '${dto.slotNumber}' already exists in this zone`);

    return prisma.parkingSlot.create({
      data: {
        propertyId,
        companyId,
        unitId: dto.unitId as string,
        slotNumber: dto.slotNumber as string,
        zoneId,
        slotType: (dto.slotType as string) || 'car',
        size: (dto.size as string) || 'standard',
        hasEvCharger: (dto.hasEvCharger as boolean) || false,
        evChargerType: (dto.evChargerType as string) || null,
        monthlyRate: dto.monthlyRate ? Number(dto.monthlyRate) : null,
        hourlyRate: dto.hourlyRate ? Number(dto.hourlyRate) : null,
        notes: (dto.notes as string) || null,
      },
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  async bulkCreate(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    const { unitId, prefix, rangeStart, rangeEnd, zoneId, slotType, size, hasEvCharger, evChargerType, monthlyRate, hourlyRate } = dto as any;
    if (rangeEnd < rangeStart) throw AppError.validation('Range end must be >= range start');

    const slotNumbers: string[] = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      slotNumbers.push(`${prefix}${String(i).padStart(3, '0')}`);
    }

    const scopedZoneId = zoneId || null;
    const existing = await prisma.parkingSlot.findMany({
      where: { propertyId, slotNumber: { in: slotNumbers }, zoneId: scopedZoneId },
      select: { slotNumber: true },
    });
    const existingSet = new Set(existing.map((s: { slotNumber: string }) => s.slotNumber));
    const duplicates = slotNumbers.filter(n => existingSet.has(n));

    const slots = slotNumbers
      .filter(n => !existingSet.has(n))
      .map(slotNumber => ({
        propertyId,
        companyId,
        unitId,
        slotNumber,
        zoneId: scopedZoneId,
        slotType: slotType || 'car',
        size: size || 'standard',
        hasEvCharger: hasEvCharger || false,
        evChargerType: evChargerType || null,
        monthlyRate: monthlyRate ? Number(monthlyRate) : null,
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      }));

    const result = slots.length > 0
      ? await prisma.parkingSlot.createMany({ data: slots, skipDuplicates: true })
      : { count: 0 };

    return { created: result.count, total: slotNumbers.length, duplicates };
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const slot = await prisma.parkingSlot.findFirst({ where: { id, companyId } });
    if (!slot) throw AppError.notFound('Parking Slot');
    if (['allocated', 'visitor'].includes(slot.status)) {
      throw AppError.conflict(`Slot '${slot.slotNumber}' is currently ${slot.status} and cannot be edited`);
    }

    const allocationCount = await prisma.parkingAllocation.count({ where: { slotId: id } });
    if (allocationCount > 0) {
      throw AppError.conflict(`Slot '${slot.slotNumber}' has allocation history and cannot be edited`);
    }

    if (dto.slotNumber !== undefined || dto.zoneId !== undefined) {
      const slotNumber = (dto.slotNumber as string) ?? slot.slotNumber;
      const zoneId = dto.zoneId !== undefined ? (dto.zoneId as string | null) : slot.zoneId;
      const duplicate = await prisma.parkingSlot.findFirst({
        where: { propertyId: slot.propertyId, slotNumber, zoneId, id: { not: id } },
      });
      if (duplicate) throw AppError.conflict(`Slot '${slotNumber}' already exists in this zone`);
    }

    return prisma.parkingSlot.update({
      where: { id },
      data: dto as any,
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  async delete(id: string, companyId: string) {
    const slot = await prisma.parkingSlot.findFirst({ where: { id, companyId } });
    if (!slot) throw AppError.notFound('Parking Slot');
    if (['allocated', 'visitor'].includes(slot.status)) {
      throw AppError.conflict(`Slot '${slot.slotNumber}' is currently ${slot.status} and cannot be deleted`);
    }

    const allocationCount = await prisma.parkingAllocation.count({ where: { slotId: id } });
    if (allocationCount > 0) {
      throw AppError.conflict(`Slot '${slot.slotNumber}' has allocation history and cannot be deleted`);
    }

    await prisma.parkingSlot.delete({ where: { id } });
  }

  async getOccupancy(propertyId: string, companyId: string, query: { unitId?: string } = {}) {
    const where: Record<string, unknown> = { propertyId, companyId, isActive: true };
    if (query.unitId) where.unitId = query.unitId;

    const slots = await prisma.parkingSlot.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const byZone = await prisma.parkingSlot.groupBy({
      by: ['zoneId', 'status'],
      where,
      _count: true,
    });

    const zoneIds = [...new Set(byZone.map((b: typeof byZone[number]) => b.zoneId).filter(Boolean))] as string[];
    const zones = zoneIds.length > 0
      ? await prisma.parkingZone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, name: true, code: true, zoneType: true } })
      : [];

    const total = slots.reduce((sum: number, s: typeof slots[number]) => sum + s._count, 0);
    const statusMap = Object.fromEntries(slots.map((s: typeof slots[number]) => [s.status, s._count]));

    const zoneOccupancy = zones.map((z: typeof zones[number]) => {
      const zoneSlots = byZone.filter((b: typeof byZone[number]) => b.zoneId === z.id);
      const zoneTotal = zoneSlots.reduce((sum: number, s: typeof zoneSlots[number]) => sum + s._count, 0);
      const zoneStatus = Object.fromEntries(zoneSlots.map((s: typeof zoneSlots[number]) => [s.status, s._count]));
      return { ...z, total: zoneTotal, ...zoneStatus };
    });

    return {
      total,
      available: statusMap.available || 0,
      allocated: statusMap.allocated || 0,
      visitor: statusMap.visitor || 0,
      blocked: statusMap.blocked || 0,
      maintenance: statusMap.maintenance || 0,
      occupancyRate: total > 0 ? Math.round(((statusMap.allocated || 0) + (statusMap.visitor || 0)) / total * 1000) / 10 : 0,
      byZone: zoneOccupancy,
    };
  }

  /**
   * Company-wide occupancy for the "All Properties" view — combined totals plus a per-property
   * breakdown (zone names collide across properties, so the aggregate groups by property instead).
   * Optionally restricted to a set of property IDs (property-scoped users).
   */
  async getOccupancyForCompany(companyId: string, propertyIds?: string[]) {
    const where: Record<string, unknown> = { companyId, isActive: true };
    if (propertyIds) where.propertyId = { in: propertyIds };

    const slots = await prisma.parkingSlot.groupBy({ by: ['status'], where, _count: true });
    const byProperty = await prisma.parkingSlot.groupBy({ by: ['propertyId', 'status'], where, _count: true });

    const propIds = [...new Set(byProperty.map((b: typeof byProperty[number]) => b.propertyId))];
    const properties = propIds.length > 0
      ? await prisma.property.findMany({ where: { id: { in: propIds } }, select: { id: true, name: true, code: true } })
      : [];

    const total = slots.reduce((sum: number, s: typeof slots[number]) => sum + s._count, 0);
    const statusMap = Object.fromEntries(slots.map((s: typeof slots[number]) => [s.status, s._count]));

    const propertyOccupancy = properties.map((p: typeof properties[number]) => {
      const propSlots = byProperty.filter((b: typeof byProperty[number]) => b.propertyId === p.id);
      const propTotal = propSlots.reduce((sum: number, s: typeof propSlots[number]) => sum + s._count, 0);
      const propStatus = Object.fromEntries(propSlots.map((s: typeof propSlots[number]) => [s.status, s._count]));
      return { ...p, total: propTotal, ...propStatus };
    });

    return {
      total,
      available: statusMap.available || 0,
      allocated: statusMap.allocated || 0,
      visitor: statusMap.visitor || 0,
      blocked: statusMap.blocked || 0,
      maintenance: statusMap.maintenance || 0,
      occupancyRate: total > 0 ? Math.round(((statusMap.allocated || 0) + (statusMap.visitor || 0)) / total * 1000) / 10 : 0,
      byProperty: propertyOccupancy,
    };
  }
}

export const slotsService = new SlotsService();
