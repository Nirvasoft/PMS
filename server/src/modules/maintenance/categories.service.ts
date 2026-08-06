import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { AppError } from '../../common/errors';

const DEFAULT_CATEGORIES = [
  { name: 'Plumbing', icon: 'droplet', sortOrder: 1 },
  { name: 'Electrical', icon: 'zap', sortOrder: 2 },
  { name: 'Air Conditioning', icon: 'thermometer', sortOrder: 3 },
  { name: 'Lift/Elevator', icon: 'arrow-up-down', sortOrder: 4 },
  { name: 'Structural', icon: 'building', sortOrder: 5 },
  { name: 'Pest Control', icon: 'bug', sortOrder: 6 },
  { name: 'Cleaning', icon: 'sparkles', sortOrder: 7 },
  { name: 'Security', icon: 'shield', sortOrder: 8 },
  { name: 'Appliance', icon: 'microwave', sortOrder: 9 },
  { name: 'Internet/TV', icon: 'wifi', sortOrder: 10 },
  { name: 'Furniture', icon: 'armchair', sortOrder: 11 },
  { name: 'General', icon: 'wrench', sortOrder: 12 },
];

export class CategoriesService {
  /** List categories visible to a company (system + company-specific) */
  async findAll(companyId: string) {
    return prisma.maintenanceCategory.findMany({
      where: {
        OR: [
          { companyId: null },   // system categories
          { companyId },         // company-specific
        ],
        isActive: true,
      },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { tickets: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Create a company-specific category */
  async create(companyId: string, dto: Record<string, unknown>) {
    // Get next sortOrder
    const maxSort = await prisma.maintenanceCategory.aggregate({
      where: { OR: [{ companyId: null }, { companyId }] },
      _max: { sortOrder: true },
    });
    const nextSort = (maxSort._max.sortOrder || 0) + 1;

    return prisma.maintenanceCategory.create({
      data: {
        companyId,
        name: dto.name as string,
        icon: (dto.icon as string) || null,
        description: (dto.description as string) || null,
        parentId: (dto.parentId as string) || null,
        sortOrder: (dto.sortOrder as number) || nextSort,
      },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { tickets: true } },
      },
    });
  }

  /** Update a category (only company-owned categories can be edited) */
  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const existing = await prisma.maintenanceCategory.findFirst({
      where: { id },
    });
    if (!existing) throw AppError.notFound('Category');

    // System categories (companyId=null) cannot be edited by companies
    if (existing.companyId === null) {
      throw AppError.forbidden('System categories cannot be modified');
    }
    if (existing.companyId !== companyId) {
      throw AppError.forbidden('Cannot modify another company\'s category');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.icon !== undefined) data.icon = dto.icon || null;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.parentId !== undefined) data.parentId = dto.parentId || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return prisma.maintenanceCategory.update({
      where: { id },
      data,
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { tickets: true } },
      },
    });
  }

  /** Soft-delete a category (only company-owned) */
  async delete(id: string, companyId: string) {
    const existing = await prisma.maintenanceCategory.findFirst({
      where: { id },
    });
    if (!existing) throw AppError.notFound('Category');

    if (existing.companyId === null) {
      throw AppError.forbidden('System categories cannot be deleted');
    }
    if (existing.companyId !== companyId) {
      throw AppError.forbidden('Cannot delete another company\'s category');
    }

    // Check for linked tickets
    const ticketCount = await prisma.maintenanceTicket.count({
      where: { categoryId: id, deletedAt: null },
    });

    if (ticketCount > 0) {
      // Soft-delete: deactivate instead of removing
      return prisma.maintenanceCategory.update({
        where: { id },
        data: { isActive: false },
      });
    }

    // No tickets linked — safe to hard delete
    return prisma.maintenanceCategory.delete({ where: { id } });
  }

  /** Seed default system categories (companyId = null) */
  async seedDefaults() {
    const existing = await prisma.maintenanceCategory.count({ where: { companyId: null } });
    if (existing > 0) return;

    await prisma.maintenanceCategory.createMany({
      data: DEFAULT_CATEGORIES.map((cat) => ({
        companyId: null,
        name: cat.name,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
      })),
      skipDuplicates: true,
    });
    logger.info(`Seeded ${DEFAULT_CATEGORIES.length} default maintenance categories`);
  }
}

export const categoriesService = new CategoriesService();
