import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class TemplatesService {
  async getTemplates(companyId: string) {
    return prisma.leaseTemplate.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  async createTemplate(companyId: string, dto: Record<string, unknown>, createdBy: string) {
    return prisma.leaseTemplate.create({ data: { companyId, createdBy, ...dto as any } });
  }

  async updateTemplate(id: string, companyId: string, dto: Record<string, unknown>) {
    const tmpl = await prisma.leaseTemplate.findFirst({ where: { id, companyId } });
    if (!tmpl) throw AppError.notFound('Template');

    // Explicit whitelist — prevents unknown fields from being written to the DB
    return prisma.leaseTemplate.update({
      where: { id },
      data: {
        ...(dto.name          !== undefined ? { name:          dto.name as string }          : {}),
        ...(dto.propertyType  !== undefined ? { propertyType:  dto.propertyType as string }  : {}),
        ...(dto.description   !== undefined ? { description:   dto.description as string }   : {}),
        ...(dto.defaultTerms  !== undefined ? { defaultTerms:  dto.defaultTerms }            : {}),
        ...(dto.clauses       !== undefined ? { clauses:       dto.clauses }                 : {}),
        ...(dto.isActive      !== undefined ? { isActive:      dto.isActive as boolean }     : {}),
      },
    });
  }
}

export const templatesService = new TemplatesService();
