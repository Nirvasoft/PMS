import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class ClausesService {
  async getClauses(companyId: string) {
    return prisma.leaseClause.findMany({ where: { companyId, isActive: true }, orderBy: [{ isStandard: 'desc' }, { category: 'asc' }] });
  }

  async createClause(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    // Explicit whitelist — never allow isStandard to be set by the client
    return prisma.leaseClause.create({
      data: {
        companyId,
        createdBy,
        title:    dto.title as string,
        content:  dto.content as string,
        category: (dto.category as string | undefined) ?? null,
        isStandard: false, // only admins can set standard clauses via a separate admin flow
      },
    });
  }

  async deleteClause(id: string, companyId: string) {
    const clause = await prisma.leaseClause.findFirst({ where: { id, companyId } });
    if (!clause) throw AppError.notFound('Clause');
    await prisma.leaseClause.update({ where: { id }, data: { isActive: false } });
  }
}

export const clausesService = new ClausesService();
