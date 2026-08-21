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

    const duplicateNumber = await prisma.floorSetup.findFirst({
      where: { propertyId, floorNumber, isActive: true },
    });
    if (duplicateNumber) throw new AppError(409, 'FLOOR_NUMBER_TAKEN', `Floor number ${floorNumber} is already set up for this property`);

    const duplicateLabel = await prisma.floorSetup.findFirst({
      where: { propertyId, floorLabel: { equals: floorLabel, mode: 'insensitive' }, isActive: true },
    });
    if (duplicateLabel) throw new AppError(409, 'FLOOR_LABEL_TAKEN', `Floor label "${floorLabel}" is already used for this property`);

    return prisma.floorSetup.create({
      data: { companyId, propertyId, floorNumber, floorLabel },
      include: { property: { select: { id: true, name: true, code: true } } },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const floor = await prisma.floorSetup.findFirst({ where: { id, companyId } });
    if (!floor) throw AppError.notFound('Floor setup');

    const propertyId = dto.propertyId !== undefined ? dto.propertyId as string : floor.propertyId;
    const floorNumber = dto.floorNumber !== undefined ? Number(dto.floorNumber) : floor.floorNumber;
    const floorLabel = dto.floorLabel !== undefined ? (dto.floorLabel as string).trim() : floor.floorLabel;

    if (dto.propertyId !== undefined || dto.floorNumber !== undefined) {
      const duplicateNumber = await prisma.floorSetup.findFirst({
        where: { propertyId, floorNumber, isActive: true, id: { not: id } },
      });
      if (duplicateNumber) throw new AppError(409, 'FLOOR_NUMBER_TAKEN', `Floor number ${floorNumber} is already set up for this property`);
    }

    if (dto.propertyId !== undefined || dto.floorLabel !== undefined) {
      const duplicateLabel = await prisma.floorSetup.findFirst({
        where: { propertyId, floorLabel: { equals: floorLabel, mode: 'insensitive' }, isActive: true, id: { not: id } },
      });
      if (duplicateLabel) throw new AppError(409, 'FLOOR_LABEL_TAKEN', `Floor label "${floorLabel}" is already used for this property`);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.propertyId !== undefined) updateData.propertyId = dto.propertyId;
    if (dto.floorNumber !== undefined) updateData.floorNumber = floorNumber;
    if (dto.floorLabel !== undefined) updateData.floorLabel = floorLabel;
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

    // Block delete if units exist on this floor
    const unitCount = await prisma.unit.count({
      where: {
        propertyId: floor.propertyId,
        floorNumber: floor.floorNumber,
        deletedAt: null,
      },
    });
    if (unitCount > 0) {
      throw new AppError(
        409,
        'FLOOR_IN_USE',
        `Cannot delete floor "${floor.floorLabel}" — it has ${unitCount} unit${unitCount > 1 ? 's' : ''} assigned. Remove the units first.`,
      );
    }

    // Hard delete — the (propertyId, floorNumber, floorLabel) unique
    // constraint is not scoped to isActive, so a soft-deleted row would keep
    // blocking that exact floor number/label combo from ever being recreated.
    await prisma.floorSetup.delete({ where: { id } });
  }
}

export const floorSetupService = new FloorSetupService();
