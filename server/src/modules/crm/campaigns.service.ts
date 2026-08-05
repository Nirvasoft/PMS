import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class CampaignsService {
  async findAll(companyId: string, query: { propertyId?: string; status?: string; page?: number; limit?: number }) {
    const { propertyId, status, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (status)     where.status = status;

    const [data, total] = await Promise.all([
      prisma.marketingCampaign.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          creator:  { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marketingCampaign.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const campaign = await prisma.marketingCampaign.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { id: true, name: true } },
        creator:  { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        leads:    { select: { id: true, firstName: true, lastName: true, stage: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!campaign) throw AppError.notFound('Campaign');
    return campaign;
  }

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    return prisma.marketingCampaign.create({
      data: {
        companyId,
        name: dto.name as string,
        propertyId: (dto.propertyId as string) || null,
        channel: (dto.channel as string) || null,
        budget: dto.budget ? Number(dto.budget) : null,
        startDate: dto.startDate ? new Date(dto.startDate as string) : null,
        endDate: dto.endDate ? new Date(dto.endDate as string) : null,
        status: (dto.status as string) || 'active',
        createdBy: userId,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id, companyId } });
    if (!campaign) throw AppError.notFound('Campaign');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined)       data.name = dto.name;
    if (dto.propertyId !== undefined) data.propertyId = dto.propertyId;
    if (dto.channel !== undefined)    data.channel = dto.channel;
    if (dto.budget !== undefined)     data.budget = Number(dto.budget);
    if (dto.startDate !== undefined)  data.startDate = dto.startDate ? new Date(dto.startDate as string) : null;
    if (dto.endDate !== undefined)    data.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.status !== undefined)     data.status = dto.status;

    return prisma.marketingCampaign.update({ where: { id }, data: data as any });
  }

  async getROI(id: string, companyId: string) {
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id, companyId } });
    if (!campaign) throw AppError.notFound('Campaign');

    const budget = Number(campaign.budget || 0);
    const revenue = Number(campaign.totalRevenue || 0);
    const roi = budget > 0 ? Math.round(((revenue - budget) / budget) * 1000) / 10 : 0;

    return {
      campaignId: id,
      name: campaign.name,
      budget,
      totalLeads: campaign.totalLeads,
      totalConversions: campaign.totalConversions,
      totalRevenue: revenue,
      roi,
    };
  }

  async delete(id: string, companyId: string) {
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id, companyId } });
    if (!campaign) throw AppError.notFound('Campaign');

    await prisma.$transaction([
      // Null out campaign references on leads
      prisma.lead.updateMany({ where: { campaignId: id }, data: { campaignId: null } }),
      // Delete the campaign
      prisma.marketingCampaign.delete({ where: { id } }),
    ]);

    return { id };
  }
}

export const campaignsService = new CampaignsService();
