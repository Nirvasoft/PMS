import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';
import {
  ensureSystemChargeCategories,
  getSystemChargeCategoryDef,
  isSystemChargeCategoryCode,
} from './chargeCategory.helper';

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
          ...(propertyId
            ? [{ companyId, propertyId }]
            : [{ companyId, isSystem: true, propertyId: null }, { companyId }]),
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
    await ensureSystemChargeCategories(companyId, propertyId);

    const scopeOr = [
      { companyId: null }, // system-wide
      ...(propertyId
        ? [{ companyId, propertyId }]
        : [{ companyId, isSystem: true, propertyId: null }, { companyId }]),
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

    return categories.map((cc) => {
      const sysDef = getSystemChargeCategoryDef(cc.code);
      return {
        ...cc,
        monthly: sysDef?.lockMonthly ? sysDef.monthly : cc.monthly,
        isSystem: cc.isSystem || Boolean(sysDef),
        chargeTypeCount: countByCode.get(cc.code.toLowerCase()) ?? 0,
      };
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    await ensurePropertySetupScope();
    const code = ((dto.code as string) || '').trim();
    if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');

    const propertyId = await resolveEffectivePropertyId(
      companyId,
      (dto.propertyId as string | null | undefined) ?? undefined,
    );
    await ensureSystemChargeCategories(companyId, propertyId);

    await this.assertCodeAvailable(companyId, propertyId, code);

    const sysDef = getSystemChargeCategoryDef(code);

    return prisma.chargeCategory.create({
      data: {
        companyId,
        propertyId,
        code,
        description: (dto.description as string) || null,
        monthly: sysDef?.lockMonthly ? sysDef.monthly : (dto.monthly as boolean) || false,
        isSystem: Boolean(sysDef),
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    await ensurePropertySetupScope();
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    if (!category.companyId) {
      throw new AppError(403, 'FORBIDDEN', 'System charge categories cannot be modified');
    }

    const sysDef = getSystemChargeCategoryDef(category.code);
    const isSystemCat = category.isSystem || Boolean(sysDef);

    const targetPropertyId =
      dto.propertyId !== undefined ? ((dto.propertyId as string) || null) : category.propertyId;

    const updateData: Record<string, unknown> = {};
    if (dto.code !== undefined) {
      const code = ((dto.code as string) || '').trim();
      if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');
      if (isSystemCat && code.toLowerCase() !== category.code.trim().toLowerCase()) {
        throw new AppError(403, 'FORBIDDEN', 'System charge category code cannot be modified');
      }
      if (!isSystemCat) {
        await this.assertCodeAvailable(companyId, targetPropertyId, code, id);
        updateData.code = code;
      }
    }
    if (!isSystemCat && dto.propertyId !== undefined) updateData.propertyId = targetPropertyId;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (sysDef?.lockMonthly) {
      updateData.monthly = sysDef.monthly;
    } else if (dto.monthly !== undefined) {
      updateData.monthly = dto.monthly;
    }
    if (!isSystemCat && dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (isSystemCat) updateData.isSystem = true;

    return prisma.chargeCategory.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    await ensurePropertySetupScope();
    const category = await prisma.chargeCategory.findFirst({
      where: { id, OR: [{ companyId }, { companyId: null }] },
    });
    if (!category) throw AppError.notFound('Charge category');

    // Prevent deleting system categories ('rent', 'deposit', or isSystem = true)
    if (!category.companyId || category.isSystem || isSystemChargeCategoryCode(category.code)) {
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
