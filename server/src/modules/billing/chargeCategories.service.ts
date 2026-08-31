import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

const SYSTEM_CHARGE_CATEGORIES = [
  { code: 'rent',    description: 'Rent charges' },
  { code: 'utility',  description: 'Utility charges (electricity, water, gas, etc.)' },
  { code: 'service',  description: 'Service charges' },
  { code: 'parking',  description: 'Parking charges' },
  { code: 'penalty',  description: 'Penalty and late payment charges' },
  { code: 'deposit',  description: 'Security and other deposits' },
  { code: 'misc',     description: 'Miscellaneous charges' },
];

export class ChargeCategoriesService {
  async seedDefaults() {
    let created = 0;
    for (const cc of SYSTEM_CHARGE_CATEGORIES) {
      const exists = await prisma.chargeCategory.findFirst({
        where: { code: cc.code, companyId: null },
      });
      if (!exists) {
        await prisma.chargeCategory.create({
          data: { ...cc, isSystem: true, companyId: null },
        });
        created++;
      }
    }
    if (created > 0) {
      logger.info(`Seeded ${created} system charge categories`);
    }
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

    const duplicate = await prisma.chargeCategory.findFirst({
      where: {
        OR: [{ companyId: null }, { companyId }],
        code: { equals: code, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (duplicate) throw new AppError(409, 'CODE_TAKEN', `Charge category code "${code}" already exists`);

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
    // Scoped to companyId, so a system category (companyId: null, shared across
    // every company) never matches here and can't be edited this way.
    const category = await prisma.chargeCategory.findFirst({ where: { id, companyId } });
    if (!category) throw AppError.notFound('Charge category');

    const updateData: Record<string, unknown> = {};
    if (dto.code !== undefined) {
      const code = (dto.code as string || '').trim();
      if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Code is required');
      const duplicate = await prisma.chargeCategory.findFirst({
        where: {
          OR: [{ companyId: null }, { companyId }],
          code: { equals: code, mode: 'insensitive' },
          isActive: true,
          id: { not: id },
        },
      });
      if (duplicate) throw new AppError(409, 'CODE_TAKEN', `Charge category code "${code}" already exists`);
      updateData.code = code;
    }
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.monthly !== undefined) updateData.monthly = dto.monthly;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.chargeCategory.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    const category = await prisma.chargeCategory.findFirst({ where: { id, companyId } });
    if (!category) throw AppError.notFound('Charge category');

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
