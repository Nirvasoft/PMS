import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';

export class PropertiesService {
  async findAll(companyId: string, query: {
    search?: string; branchId?: string; propertyType?: string;
    status?: string; page?: number; limit?: number;
  }) {
    const { search, branchId, propertyType, status, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (branchId) where.branchId = branchId;
    if (propertyType) where.propertyType = propertyType;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          businessUnit: { select: { id: true, name: true } },
          regionProperties: { include: { region: { select: { id: true, name: true } } } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.property.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        regions: p.regionProperties.map((rp) => rp.region),
        regionProperties: undefined,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        branch: { select: { id: true, name: true } },
        businessUnit: { select: { id: true, name: true } },
        regionProperties: { include: { region: { select: { id: true, name: true } } } },
      },
    });
    if (!property) throw AppError.notFound('Property');
    return {
      ...property,
      regions: property.regionProperties.map((rp) => rp.region),
      regionProperties: undefined,
    };
  }

  async create(dto: {
    name: string; code?: string; propertyType: string;
    branchId?: string; businessUnitId?: string;
    addressLine1?: string; addressLine2?: string;
    city?: string; state?: string; postalCode?: string; country?: string;
    geoLat?: number; geoLng?: number; totalAreaSqft?: number;
    yearBuilt?: number; description?: string;
  }, companyId: string) {
    // Check property limit from company settings
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });
    const settings = (company?.settings ?? {}) as Record<string, unknown>;
    const maxProperties = settings.maxProperties as number | undefined;

    if (maxProperties) {
      const currentCount = await prisma.property.count({ where: { companyId, deletedAt: null } });
      if (currentCount >= maxProperties) {
        throw new AppError(402, 'PROPERTY_LIMIT_REACHED',
          `Your plan allows a maximum of ${maxProperties} properties. Please upgrade to add more.`);
      }
    }

    return prisma.property.create({ data: { companyId, ...dto } });
  }

  async update(propertyId: string, dto: Record<string, unknown>) {
    return prisma.property.update({ where: { id: propertyId }, data: dto });
  }

  /** Soft-delete property */
  async delete(propertyId: string) {
    return prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** Get summary stats for dashboard */
  async getStats(companyId: string) {
    const [total, active, byType, byStatus] = await Promise.all([
      prisma.property.count({ where: { companyId, deletedAt: null } }),
      prisma.property.count({ where: { companyId, deletedAt: null, isActive: true } }),
      prisma.property.groupBy({
        by: ['propertyType'],
        where: { companyId, deletedAt: null },
        _count: true,
      }),
      prisma.property.groupBy({
        by: ['status'],
        where: { companyId, deletedAt: null },
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      byType: byType.map((g) => ({ type: g.propertyType, count: g._count })),
      byStatus: byStatus.map((g) => ({ status: g.status, count: g._count })),
    };
  }
}

export const propertiesService = new PropertiesService();
