import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

export class ChargeCategoriesService {
  // Shared by create()/update() — a code must be unique (case-insensitive) across a
  // property's own categories plus the system-wide ones, excluding the row being edited.
  private async assertCodeAvailable(
    companyId: string,
    propertyId: string | null,
    code: string,
    excludeId?: string,
  ) {
    const duplicate = await prisma.chargeCategory.findFirst({
      where: {
        OR: [
          { companyId: null },
          { companyId, isSystem: true, propertyId: null },
          ...(propertyId ? [{ companyId, propertyId }] : [{ companyId }]),
        ],
        code: { equals: code, mode: 'insensitive' },
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new AppError(409, 'CODE_TAKEN', `Charge category code "${code}" already exists`);
  }

  async findAll(companyId: string, filters?: { propertyId?: string }) {
    await ensurePropertySetupScope();
    const propertyId = filters?.propertyId?.trim() || undefined;

    const scopeOr = [
      { companyId: null }, // system-wide
      { companyId, isSystem: true, propertyId: null }, // company-level system defaults
      ...(propertyId ? [{ companyId, propertyId }] : [{ companyId }]),
    ];

    const categories = await prisma.chargeCategory.findMany({
      where: {
        OR: scopeOr,
        isActive: true,
      },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });

    // Count how many charge types (system + active property) reference each category code,
    // so the list can show "this data from it" alongside each row.
    const counts = await prisma.chargeType.groupBy({
      by: ['category'],
      where: {
        OR: scopeOr,
        NOT: { code: { in: ['SECURITY_DEPOSIT', 'security_deposit'] } },
      },
      _count: { _all: true },
    });
    const countByCode = new Map(counts.map((c) => [c.category.toLowerCase(), c._count._all]));

    return categories.map((cc) => ({
      ...cc,
      chargeTypeCount: countByCode.get(cc.code.toLowerCase()) ?? 0,
    }));
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    await ensurePropertySetupScope();
    const code = ((dto.code as string) || '').trim();
    if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');

    const propertyId = await resolveEffectivePropertyId(
      companyId,
      (dto.propertyId as string | null | undefined) ?? undefined,
    );

    await this.assertCodeAvailable(companyId, propertyId, code);

    return prisma.chargeCategory.create({
      data: {
        companyId,
        propertyId,
        code,
        description: (dto.description as string) || null,
        monthly: (dto.monthly as boolean) || false,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    await ensurePropertySetupScope();
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    // Prevent company users from modifying system-wide categories
    if (!category.companyId || category.isSystem) {
      throw new AppError(403, 'FORBIDDEN', 'System charge categories cannot be modified');
    }

    const targetPropertyId =
      dto.propertyId !== undefined ? ((dto.propertyId as string) || null) : category.propertyId;

    const updateData: Record<string, unknown> = {};
    if (dto.code !== undefined) {
      const code = ((dto.code as string) || '').trim();
      if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');
      await this.assertCodeAvailable(companyId, targetPropertyId, code, id);
      updateData.code = code;
    }
    if (dto.propertyId !== undefined) updateData.propertyId = targetPropertyId;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.monthly !== undefined) updateData.monthly = dto.monthly;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.chargeCategory.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    await ensurePropertySetupScope();
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    // Prevent deleting system-wide categories
    if (!category.companyId || category.isSystem) {
      throw new AppError(403, 'FORBIDDEN', 'System charge categories cannot be deleted');
    }

    const usageCount = await prisma.chargeType.count({
      where: {
        companyId,
        ...(category.propertyId ? { propertyId: category.propertyId } : {}),
        category: { equals: category.code, mode: 'insensitive' },
      },
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
