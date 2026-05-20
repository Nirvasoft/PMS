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
    return prisma.leaseTemplate.update({ where: { id }, data: dto as any });
  }
}

export const templatesService = new TemplatesService();
