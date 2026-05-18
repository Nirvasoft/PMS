import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class BusinessUnitsService {
  async findAll(companyId: string) {
    return prisma.businessUnit.findMany({
      where: { companyId },
      include: {
        branch: { select: { id: true, name: true } },
        manager: { include: { profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { properties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: {
    name: string; code?: string; branchId?: string; managerId?: string;
  }, companyId: string) {
    return prisma.businessUnit.create({ data: { companyId, ...dto } });
  }

  async update(id: string, dto: Record<string, unknown>) {
    return prisma.businessUnit.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const bu = await prisma.businessUnit.findUnique({
      where: { id },
      include: { _count: { select: { properties: true } } },
    });
    if (!bu) throw AppError.notFound('Business Unit');
    if (bu._count.properties > 0) {
      throw AppError.conflict('Cannot delete business unit with assigned properties.');
    }
    await prisma.businessUnit.delete({ where: { id } });
  }
}

export const businessUnitsService = new BusinessUnitsService();
