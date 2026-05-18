import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class PositionsService {
  async findAll(companyId: string, departmentId?: string) {
    return prisma.position.findMany({
      where: { companyId, ...(departmentId ? { departmentId } : {}) },
      include: { department: { select: { id: true, name: true } } },
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: {
    name: string; departmentId?: string; level?: number;
    canApprove?: boolean; approvalLimit?: number;
  }, companyId: string) {
    return prisma.position.create({
      data: { companyId, ...dto },
    });
  }

  async update(positionId: string, dto: Record<string, unknown>) {
    return prisma.position.update({ where: { id: positionId }, data: dto });
  }

  async delete(positionId: string) {
    const pos = await prisma.position.findUnique({
      where: { id: positionId },
      include: { _count: { select: { profiles: true } } },
    });
    if (!pos) throw AppError.notFound('Position');
    if (pos._count.profiles > 0) throw AppError.conflict('Cannot delete position with assigned users');
    await prisma.position.delete({ where: { id: positionId } });
  }
}

export const positionsService = new PositionsService();
