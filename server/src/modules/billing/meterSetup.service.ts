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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    return prisma.meterSetup.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        meterType: dto.meterType as string,
        meterNo: dto.meterNo as string,
        horsePower: (dto.horsePower as number) ?? null,
        unitLostPct: (dto.unitLostPct as number) ?? null,
        category: dto.category as string,
        factor: (dto.factor as number) ?? null,
        maintenanceFee: (dto.maintenanceFee as number) ?? null,
        usageType: (dto.usageType as string) ?? null,
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const meter = await prisma.meterSetup.findFirst({ where: { id, companyId } });
    if (!meter) throw AppError.notFound('Meter setup');

    const updateData: Record<string, unknown> = {};
    if (dto.propertyId !== undefined) updateData.propertyId = dto.propertyId;
    if (dto.meterType !== undefined) updateData.meterType = dto.meterType;
    if (dto.meterNo !== undefined) updateData.meterNo = dto.meterNo;
    if (dto.horsePower !== undefined) updateData.horsePower = dto.horsePower;
    if (dto.unitLostPct !== undefined) updateData.unitLostPct = dto.unitLostPct;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.factor !== undefined) updateData.factor = dto.factor;
    if (dto.maintenanceFee !== undefined) updateData.maintenanceFee = dto.maintenanceFee;
    if (dto.usageType !== undefined) updateData.usageType = dto.usageType;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.meterSetup.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async delete(id: string, companyId: string) {
    const meter = await prisma.meterSetup.findFirst({ where: { id, companyId } });
    if (!meter) throw AppError.notFound('Meter setup');
    await prisma.meterSetup.update({ where: { id }, data: { isActive: false } });
  }
}

export const meterSetupService = new MeterSetupService();
