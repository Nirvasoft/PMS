import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class VehiclesService {
  async findByTenant(tenantId: string, companyId: string) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');

    return prisma.tenantVehicle.findMany({
      where: { tenantId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, companyId: string, dto: Record<string, unknown>) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, companyId } });
    if (!tenant) throw AppError.notFound('Tenant');

    return prisma.tenantVehicle.create({
      data: {
        tenantId,
        companyId,
        plateNumber: dto.plateNumber as string,
        make: (dto.make as string) || null,
        model: (dto.model as string) || null,
        color: (dto.color as string) || null,
        vehicleType: (dto.vehicleType as string) || 'car',
        rfidTagNo: (dto.rfidTagNo as string) || null,
      },
    });
  }

  async update(id: string, tenantId: string, dto: Record<string, unknown>) {
    const vehicle = await prisma.tenantVehicle.findFirst({ where: { id, tenantId } });
    if (!vehicle) throw AppError.notFound('Vehicle');
    return prisma.tenantVehicle.update({ where: { id }, data: dto as any });
  }

  async deactivate(id: string, tenantId: string) {
    const vehicle = await prisma.tenantVehicle.findFirst({ where: { id, tenantId } });
    if (!vehicle) throw AppError.notFound('Vehicle');
    return prisma.tenantVehicle.update({ where: { id }, data: { isActive: false } });
  }
}

export const vehiclesService = new VehiclesService();
