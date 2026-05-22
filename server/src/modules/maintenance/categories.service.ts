import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

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
      },
      orderBy: { sortOrder: 'asc' },
    });
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
