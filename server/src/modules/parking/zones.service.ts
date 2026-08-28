import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class ZonesService {
  async findAll(propertyId: string, companyId: string, query: { unitId?: string } = {}) {
    const where: Record<string, unknown> = { propertyId, companyId };
    if (query.unitId) where.unitId = query.unitId;

    return prisma.parkingZone.findMany({
      where,
      include: { _count: { select: { slots: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    const unitId = (dto.unitId as string) || null;
    const name = dto.name as string;
    const existing = await prisma.parkingZone.findFirst({
      where: { propertyId, unitId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw AppError.conflict(`Zone '${name}' already exists in this parking unit`);

    return prisma.parkingZone.create({
      data: {
        propertyId,
        companyId,
        unitId: dto.unitId as string,
        name: dto.name as string,
        code: (dto.code as string) || null,
        zoneType: (dto.zoneType as string) || 'covered',
      },
      include: { _count: { select: { slots: true } } },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const zone = await prisma.parkingZone.findFirst({ where: { id, companyId } });
    if (!zone) throw AppError.notFound('Parking Zone');

    if (dto.name !== undefined && dto.name !== zone.name) {
      const duplicate = await prisma.parkingZone.findFirst({
        where: { propertyId: zone.propertyId, unitId: zone.unitId, name: { equals: dto.name as string, mode: 'insensitive' }, id: { not: id } },
      });
      if (duplicate) throw AppError.conflict(`Zone '${dto.name}' already exists in this parking unit`);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined)     data.name = dto.name;
    if (dto.code !== undefined)     data.code = dto.code;
    if (dto.zoneType !== undefined) data.zoneType = dto.zoneType;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return prisma.parkingZone.update({
      where: { id },
      data: data as any,
      include: { _count: { select: { slots: true } } },
    });
  }

  async delete(id: string, companyId: string) {
    const zone = await prisma.parkingZone.findFirst({
      where: { id, companyId },
      include: { _count: { select: { slots: true } } },
    });
    if (!zone) throw AppError.notFound('Parking Zone');
    if (zone._count.slots > 0) {
      throw AppError.conflict(`Cannot delete zone '${zone.name}' — it has ${zone._count.slots} slot(s) assigned to it`);
    }

    await prisma.parkingZone.delete({ where: { id } });
  }
}

export const zonesService = new ZonesService();
