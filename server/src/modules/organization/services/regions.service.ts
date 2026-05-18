import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class RegionsService {
  async findAll(companyId: string) {
    return prisma.region.findMany({
      where: { companyId },
      include: {
        manager: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { regionProperties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: {
    name: string; code?: string; description?: string; managerId?: string;
  }, companyId: string) {
    return prisma.region.create({ data: { companyId, ...dto } });
  }

  async update(regionId: string, dto: Record<string, unknown>) {
    return prisma.region.update({ where: { id: regionId }, data: dto });
  }

  async delete(regionId: string) {
    await prisma.regionProperty.deleteMany({ where: { regionId } });
    await prisma.region.delete({ where: { id: regionId } });
  }

  /** Add property to region */
  async addProperty(regionId: string, propertyId: string) {
    await prisma.regionProperty.upsert({
      where: { regionId_propertyId: { regionId, propertyId } },
      create: { regionId, propertyId },
      update: {},
    });
  }

  /** Remove property from region */
  async removeProperty(regionId: string, propertyId: string) {
    await prisma.regionProperty.deleteMany({ where: { regionId, propertyId } });
  }

  /** Get properties in a region */
  async getProperties(regionId: string) {
    const rps = await prisma.regionProperty.findMany({
      where: { regionId },
      include: {
        property: {
          select: { id: true, name: true, code: true, propertyType: true, city: true, status: true },
        },
      },
    });
    return rps.map((rp) => rp.property);
  }
}

export const regionsService = new RegionsService();
