import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class ZonesService {
  async findAll(propertyId: string, companyId: string) {
    return prisma.parkingZone.findMany({
      where: { propertyId, companyId },
      include: { _count: { select: { slots: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(propertyId: string, companyId: string, dto: Record<string, unknown>) {
    return prisma.parkingZone.create({
      data: {
        propertyId,
        companyId,
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
}

export const zonesService = new ZonesService();
