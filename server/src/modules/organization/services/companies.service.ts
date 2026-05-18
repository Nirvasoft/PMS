import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class CompaniesService {
  /** Get company by ID with subsidiary tree */
  async findById(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subsidiaries: {
          select: { id: true, name: true, companyType: true, isActive: true, country: true },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { branches: true, properties: true, users: true, regions: true, businessUnits: true },
        },
      },
    });
    if (!company) throw AppError.notFound('Company');
    return company;
  }

  /** Update company details */
  async update(companyId: string, dto: Record<string, unknown>) {
    // Prevent updating sensitive fields directly
    const { id, createdAt, deletedAt, ...data } = dto as Record<string, unknown> & { id?: string; createdAt?: string; deletedAt?: string };
    return prisma.company.update({ where: { id: companyId }, data });
  }

  /** Update feature flags */
  async updateSettings(companyId: string, settings: Record<string, unknown>) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    if (!company) throw AppError.notFound('Company');

    const merged = { ...(company.settings as Record<string, unknown>), ...settings };
    return prisma.company.update({
      where: { id: companyId },
      data: { settings: merged as unknown as Record<string, string | number | boolean> },
    });
  }

  /** Get company hierarchy (parent + children) */
  async getHierarchy(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        parent: { select: { id: true, name: true, companyType: true } },
        subsidiaries: {
          select: { id: true, name: true, companyType: true, isActive: true, country: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!company) throw AppError.notFound('Company');
    return company;
  }
}

export const companiesService = new CompaniesService();
