import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class MeterSetupService {
  async findAll(companyId: string, query: { propertyId?: string }) {
    return prisma.meterSetup.findMany({
      where: {
        companyId,
        propertyId: query.propertyId || undefined,
        isActive: true,
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, floorNumber: true, floorLabel: true } },
        mainMeter: { select: { id: true, meterNo: true, meterType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    return prisma.meterSetup.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        floorId: (dto.floorId as string) ?? null,
        meterType: dto.meterType as string,
        meterNo: dto.meterNo as string,
        mainMeterId: dto.meterType === 'sub_meter' ? (dto.mainMeterId as string) : null,
        horsePower: (dto.horsePower as number) ?? null,
        unitLostPct: (dto.unitLostPct as number) ?? null,
        category: dto.category as string,
        factor: (dto.factor as number) ?? null,
        maintenanceFee: (dto.maintenanceFee as number) ?? null,
        usageType: (dto.usageType as string) ?? null,
        rate: (dto.rate as number) ?? null,
        calculationType: (dto.calculationType as string) ?? 'per_unit',
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, floorNumber: true, floorLabel: true } },
        mainMeter: { select: { id: true, meterNo: true, meterType: true } },
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const meter = await prisma.meterSetup.findFirst({ where: { id, companyId } });
    if (!meter) throw AppError.notFound('Meter setup');

    const updateData: Record<string, unknown> = {};
    if (dto.propertyId !== undefined) updateData.propertyId = dto.propertyId;
    if (dto.floorId !== undefined) updateData.floorId = dto.floorId || null;
    if (dto.meterType !== undefined) updateData.meterType = dto.meterType;
    if (dto.meterNo !== undefined) updateData.meterNo = dto.meterNo;
    if (dto.mainMeterId !== undefined || dto.meterType !== undefined) {
      const nextType = (dto.meterType as string) ?? meter.meterType;
      updateData.mainMeterId = nextType === 'sub_meter' ? ((dto.mainMeterId as string) ?? meter.mainMeterId) : null;
    }
    if (dto.horsePower !== undefined) updateData.horsePower = dto.horsePower;
    if (dto.unitLostPct !== undefined) updateData.unitLostPct = dto.unitLostPct;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.factor !== undefined) updateData.factor = dto.factor;
    if (dto.maintenanceFee !== undefined) updateData.maintenanceFee = dto.maintenanceFee;
    if (dto.usageType !== undefined) updateData.usageType = dto.usageType;
    if (dto.rate !== undefined) updateData.rate = dto.rate;
    if (dto.calculationType !== undefined) updateData.calculationType = dto.calculationType;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.meterSetup.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, floorNumber: true, floorLabel: true } },
        mainMeter: { select: { id: true, meterNo: true, meterType: true } },
      },
    });
  }

  async delete(id: string, companyId: string) {
    const meter = await prisma.meterSetup.findFirst({ where: { id, companyId } });
    if (!meter) throw AppError.notFound('Meter setup');

    // Block delete if any unit has this meter assigned (matched by meterNo + propertyId)
    const unitCount = await prisma.utilityMeter.count({
      where: {
        meterSerialNo: meter.meterNo,
        propertyId: meter.propertyId,
        isActive: true,
      },
    });
    if (unitCount > 0) {
      throw new AppError(
        409,
        'METER_IN_USE',
        `Cannot delete meter "${meter.meterNo}" — it is assigned to ${unitCount} unit${unitCount > 1 ? 's' : ''}. Remove it from units first.`,
      );
    }

    await prisma.meterSetup.update({ where: { id }, data: { isActive: false } });
  }
}

export const meterSetupService = new MeterSetupService();
