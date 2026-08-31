import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class BranchesService {
  async findAll(companyId: string) {
    return prisma.branch.findMany({
      where: { companyId },
      include: {
        manager: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { properties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(branchId: string) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        manager: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { properties: true, businessUnits: true } },
      },
    });
    if (!branch) throw AppError.notFound('Branch');
    return branch;
  }

  async create(dto: {
    name: string; code?: string; managerId?: string;
    phone?: string; email?: string;
    addressLine1?: string; addressLine2?: string;
    city?: string; state?: string; postalCode?: string; country?: string;
  }, companyId: string) {
    const cleanDto = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== null && v !== undefined && v !== '')
    ) as typeof dto;
    return prisma.branch.create({
      data: {
        companyId,
        ...cleanDto,
      },
    });
  }

  async update(branchId: string, dto: Record<string, unknown>) {
    return prisma.branch.update({ where: { id: branchId }, data: dto });
  }

  async delete(branchId: string) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: { _count: { select: { properties: true } } },
    });
    if (!branch) throw AppError.notFound('Branch');
    if (branch._count.properties > 0) {
      throw AppError.conflict('Cannot delete branch with assigned properties. Reassign properties first.');
    }
    await prisma.branch.delete({ where: { id: branchId } });
  }
}

export const branchesService = new BranchesService();
