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
          select: {
            branches: true,
            regions: true,
            businessUnits: true,
            properties: { where: { deletedAt: null } },
            users: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!company) throw AppError.notFound('Company');
    return company;
  }

  /** Update company details */
  async update(companyId: string, dto: Record<string, unknown>) {
    // Prevent updating sensitive fields directly
    const { id, code, createdAt, deletedAt, ...data } = dto as Record<string, unknown> & { id?: string; code?: string; createdAt?: string; deletedAt?: string };
    return prisma.company.update({ where: { id: companyId }, data });
  }

  /**
   * Generate a unique company code from the company name.
   * Strips non-alphanumeric chars, uppercases, truncates to 8 chars,
   * and appends a numeric suffix if the code already exists.
   */
  async generateCode(name: string): Promise<string> {
    const base = name
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8)
      .toUpperCase();

    if (!base) return `CO${Date.now().toString(36).toUpperCase().slice(-6)}`;

    // Check if base code is available
    const existing = await prisma.company.findUnique({ where: { code: base } });
    if (!existing) return base;

    // Try appending 2-99
    for (let i = 2; i < 100; i++) {
      const candidate = `${base.substring(0, 17)}${i}`;
      const exists = await prisma.company.findUnique({ where: { code: candidate } });
      if (!exists) return candidate;
    }

    // Fallback: use timestamp
    return `${base.substring(0, 12)}${Date.now().toString(36).toUpperCase().slice(-6)}`;
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
