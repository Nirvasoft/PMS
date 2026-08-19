import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class FloorSetupService {
  async findAll(companyId: string, query: { propertyId?: string; floorNumber?: number }) {
    return prisma.floorSetup.findMany({
      where: {
        companyId,
        isActive: true,
        propertyId: query.propertyId || undefined,
        floorNumber: query.floorNumber || undefined,
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ property: { name: 'asc' } }, { floorNumber: 'asc' }],
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    const propertyId = dto.propertyId as string;
    const floorNumber = Number(dto.floorNumber);
    const floorLabel = (dto.floorLabel as string || '').trim();

    if (!propertyId) throw new AppError(400, 'PROPERTY_REQUIRED', 'Property is required');
    if (!floorNumber || floorNumber < 1) throw new AppError(400, 'FLOOR_NUMBER_REQUIRED', 'Floor number is required');
    if (!floorLabel) throw new AppError(400, 'FLOOR_LABEL_REQUIRED', 'Floor label is required');

    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
    if (!property) throw AppError.notFound('Property');
    if (property.totalFloors && floorNumber > property.totalFloors) {
      throw new AppError(400, 'FLOOR_NUMBER_OUT_OF_RANGE', `Floor number cannot exceed the property's total floors (${property.totalFloors})`);
    }

    const existing = await prisma.floorSetup.findFirst({
      where: { propertyId, floorNumber, isActive: true },
    });
    if (existing) throw new AppError(409, 'FLOOR_NUMBER_TAKEN', `Floor number ${floorNumber} already exists for this property`);

    return prisma.floorSetup.create({
      data: { companyId, propertyId, floorNumber, floorLabel },
      include: { property: { select: { id: true, name: true, code: true } } },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const floor = await prisma.floorSetup.findFirst({ where: { id, companyId } });
    if (!floor) throw AppError.notFound('Floor setup');

    const updateData: Record<string, unknown> = {};
    if (dto.propertyId !== undefined) updateData.propertyId = dto.propertyId;
    if (dto.floorNumber !== undefined) updateData.floorNumber = Number(dto.floorNumber);
    if (dto.floorLabel !== undefined) updateData.floorLabel = (dto.floorLabel as string).trim();
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.floorSetup.update({
      where: { id },
      data: updateData,
      include: { property: { select: { id: true, name: true, code: true } } },
    });
  }

  async delete(id: string, companyId: string) {
    const floor = await prisma.floorSetup.findFirst({ where: { id, companyId } });
    if (!floor) throw AppError.notFound('Floor setup');
    await prisma.floorSetup.update({ where: { id }, data: { isActive: false } });
  }
}

export const floorSetupService = new FloorSetupService();
