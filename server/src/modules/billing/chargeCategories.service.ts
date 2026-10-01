import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class ChargeCategoriesService {
  // Shared by create()/update() — a code must be unique (case-insensitive) across a
  // company's own categories plus the system-wide ones, excluding the row being edited.
  private async assertCodeAvailable(companyId: string, code: string, excludeId?: string) {
    const duplicate = await prisma.chargeCategory.findFirst({
      where: {
        OR: [{ companyId: null }, { companyId }],
        code: { equals: code, mode: 'insensitive' },
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new AppError(409, 'CODE_TAKEN', `Charge category code "${code}" already exists`);
  }

  async findAll(companyId: string) {
    const categories = await prisma.chargeCategory.findMany({
      where: {
        OR: [
          { companyId: null }, // system-wide
          { companyId },       // company-specific
        ],
        isActive: true,
      },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });

    // Count how many charge types (system + company) reference each category code,
    // so the list can show "this data from it" alongside each row.
    const counts = await prisma.chargeType.groupBy({
      by: ['category'],
      where: { OR: [{ companyId: null }, { companyId }] },
      _count: { _all: true },
    });
    const countByCode = new Map(counts.map((c) => [c.category.toLowerCase(), c._count._all]));

    return categories.map((cc) => ({
      ...cc,
      chargeTypeCount: countByCode.get(cc.code.toLowerCase()) ?? 0,
    }));
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    const code = (dto.code as string || '').trim();
    if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');

    await this.assertCodeAvailable(companyId, code);

    return prisma.chargeCategory.create({
      data: {
        companyId,
        code,
        description: (dto.description as string) || null,
        monthly: (dto.monthly as boolean) || false,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    // Prevent company users from modifying system-wide categories
    if (!category.companyId) {
      throw new AppError(403, 'FORBIDDEN', 'System charge categories cannot be modified');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.code !== undefined) {
      const code = (dto.code as string || '').trim();
      if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');
      await this.assertCodeAvailable(companyId, code, id);
      updateData.code = code;
    }
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.monthly     !== undefined) updateData.monthly     = dto.monthly;
    if (dto.isActive    !== undefined) updateData.isActive    = dto.isActive;

    return prisma.chargeCategory.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    // Prevent deleting system-wide categories
    if (!category.companyId) {
      throw new AppError(403, 'FORBIDDEN', 'System charge categories cannot be deleted');
    }

    const usageCount = await prisma.chargeType.count({
      where: { category: { equals: category.code, mode: 'insensitive' } },
    });
    if (usageCount > 0) {
      throw new AppError(
        409,
        'CATEGORY_IN_USE',
        `Cannot delete category "${category.code}" — it is used by ${usageCount} charge type${usageCount > 1 ? 's' : ''}.`,
      );
    }

    await prisma.chargeCategory.delete({ where: { id } });
  }
}

export const chargeCategoriesService = new ChargeCategoriesService();
