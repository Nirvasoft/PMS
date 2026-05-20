import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class ClausesService {
  async getClauses(companyId: string) {
    return prisma.leaseClause.findMany({ where: { companyId, isActive: true }, orderBy: [{ isStandard: 'desc' }, { category: 'asc' }] });
  }

  async createClause(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    return prisma.leaseClause.create({ data: { companyId, createdBy, ...dto as any } });
  }

  async deleteClause(id: string, companyId: string) {
    const clause = await prisma.leaseClause.findFirst({ where: { id, companyId } });
    if (!clause) throw AppError.notFound('Clause');
    await prisma.leaseClause.update({ where: { id }, data: { isActive: false } });
  }
}

export const clausesService = new ClausesService();
