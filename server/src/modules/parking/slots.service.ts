import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class SlotsService {
  async findAll(propertyId: string, companyId: string, query: {
    unitId?: string; zoneId?: string; status?: string; slotType?: string; page?: number; limit?: number;
  }) {
    const { unitId, zoneId, status, slotType, page = 1, limit = 50 } = query;
    const where: Record<string, unknown> = { propertyId, companyId };
    if (unitId)   where.unitId = unitId;
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

  async create(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    const exists = await prisma.parkingSlot.findFirst({
      where: { propertyId, slotNumber: dto.slotNumber as string },
    });
    if (exists) throw AppError.conflict(`Slot '${dto.slotNumber}' already exists in this property`);

    return prisma.parkingSlot.create({
      data: {
        propertyId,
        companyId,
        unitId: dto.unitId as string,
        slotNumber: dto.slotNumber as string,
        zoneId: (dto.zoneId as string) || null,
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

    const slots: any[] = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const slotNumber = `${prefix}${String(i).padStart(3, '0')}`;
      slots.push({
        propertyId,
        companyId,
        unitId,
        slotNumber,
        zoneId: zoneId || null,
        slotType: slotType || 'car',
        size: size || 'standard',
        hasEvCharger: hasEvCharger || false,
        evChargerType: evChargerType || null,
        monthlyRate: monthlyRate ? Number(monthlyRate) : null,
        hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      });
    }

    const result = await prisma.parkingSlot.createMany({ data: slots, skipDuplicates: true });
    return { created: result.count, total: rangeEnd - rangeStart + 1 };
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const slot = await prisma.parkingSlot.findFirst({ where: { id, companyId } });
    if (!slot) throw AppError.notFound('Parking Slot');

    return prisma.parkingSlot.update({
      where: { id },
      data: dto as any,
      include: { zone: { select: { id: true, name: true } } },
    });
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
}

export const slotsService = new SlotsService();
