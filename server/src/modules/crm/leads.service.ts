import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

/** Allowed stage transitions map */
const STAGE_TRANSITIONS: Record<string, string[]> = {
  new:                ['contacted', 'lost', 'duplicate'],
  contacted:          ['viewing_scheduled', 'offer_sent', 'lost', 'duplicate'],
  viewing_scheduled:  ['viewed', 'no_show', 'lost', 'duplicate'],
  viewed:             ['offer_sent', 'lost', 'duplicate'],
  offer_sent:         ['negotiating', 'lost', 'duplicate'],
  negotiating:        ['lease_signed', 'lost', 'duplicate'],
  lease_signed:       [],
  lost:               [],
  duplicate:          [],
};

let leadCounter = 0;
function nextLeadNumber(): string {
  leadCounter++;
  const d = new Date();
  const prefix = `LD-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${prefix}-${String(leadCounter).padStart(4, '0')}`;
}

export class LeadsService {
  // ── List ────────────────────────────────
  async findAll(companyId: string, query: {
    propertyId?: string; stage?: string; assignedTo?: string;
    source?: string; priority?: string; search?: string; page?: number; limit?: number;
  }) {
    const { propertyId, stage, assignedTo, source, priority, search, page = 1, limit = 20 } = query;
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (propertyId)  where.propertyId = propertyId;
    if (stage)       where.stage = stage;
    if (assignedTo)  where.assignedTo = assignedTo;
    if (source)      where.source = source;
    if (priority)    where.priority = priority;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { leadNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          agent:    { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          campaign: { select: { id: true, name: true } },
          convertedLease: { select: { id: true, leaseNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.lead.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Get one ──────────────────────────────
  async findById(id: string, companyId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        property: { select: { id: true, name: true } },
        agent:    { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        campaign: { select: { id: true, name: true } },
        viewings: {
          orderBy: { scheduledAt: 'desc' },
          include: {
            unit:  { select: { id: true, unitNumber: true } },
            agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            performer: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        convertedLease:  { select: { id: true, leaseNumber: true, status: true } },
        convertedTenant: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });
    if (!lead) throw AppError.notFound('Lead');
    return lead;
  }

  // ── Create ───────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const assignedTo = (dto.assignedTo as string) ?? await this.autoAssignAgent(dto.propertyId as string | undefined, companyId);

    const lead = await prisma.lead.create({
      data: {
        companyId,
        leadNumber: nextLeadNumber(),
        ...(dto as any),
        assignedTo,
      },
    });

    // Log initial activity
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        activityType: 'note',
        description: `Lead created from ${(dto.source as string) ?? 'unknown'}`,
        performedBy: userId,
      },
    });

    // Increment campaign counter
    if (dto.campaignId) {
      await prisma.marketingCampaign.update({
        where: { id: dto.campaignId as string },
        data: { totalLeads: { increment: 1 } },
      });
    }

    return lead;
  }

  // ── Update ───────────────────────────────
  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');
    return prisma.lead.update({ where: { id }, data: dto as any });
  }

  // ── Delete ───────────────────────────────
  async delete(id: string, companyId: string) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');
    await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Update Stage ─────────────────────────
  async updateStage(id: string, companyId: string, stage: string, reason: string | undefined, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');

    // Validate transition
    const allowed = STAGE_TRANSITIONS[lead.stage];
    if (allowed && !allowed.includes(stage)) {
      throw AppError.validation(`Cannot transition from '${lead.stage}' to '${stage}'`);
    }

    const updateData: Record<string, unknown> = { stage };
    if (stage === 'lost') {
      updateData.lostAt = new Date();
      updateData.lostReason = reason || null;
    }

    await prisma.lead.update({ where: { id }, data: updateData as any });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: id,
        activityType: 'stage_change',
        description: `Stage changed: ${lead.stage} → ${stage}${reason ? ` (${reason})` : ''}`,
        performedBy: userId,
        metadata: { previousStage: lead.stage, newStage: stage, reason },
      },
    });

    return this.findById(id, companyId);
  }

  // ── Convert ──────────────────────────────
  async convert(id: string, companyId: string, leaseId: string | undefined, tenantId: string, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');
    if (['new', 'contacted', 'lost', 'duplicate'].includes(lead.stage)) {
      throw AppError.badRequest(`Cannot convert a lead in "${lead.stage}" stage to a lease`);
    }

    await prisma.lead.update({
      where: { id },
      data: {
        stage: 'lease_signed',
        convertedAt: new Date(),
        convertedLeaseId: leaseId ?? null,
        convertedTenantId: tenantId,
      },
    });

    // Update campaign conversion count
    if (lead.campaignId) {
      await prisma.marketingCampaign.update({
        where: { id: lead.campaignId },
        data: { totalConversions: { increment: 1 } },
      });
    }

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: id,
        activityType: 'stage_change',
        description: `Lead converted to lease`,
        performedBy: userId,
        metadata: { leaseId, tenantId },
      },
    });

    return this.findById(id, companyId);
  }

  // ── Pipeline ─────────────────────────────
  async getPipeline(companyId: string, propertyId?: string) {
    const stages = ['new', 'contacted', 'viewing_scheduled', 'viewed', 'offer_sent', 'negotiating', 'lease_signed'];
    const where: Record<string, unknown> = {
      companyId,
      deletedAt: null,
      stage: { notIn: ['lost', 'duplicate'] },
    };
    if (propertyId) where.propertyId = propertyId;

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, companyName: true,
        email: true, budgetMin: true, budgetMax: true, moveInDate: true,
        priority: true, stage: true, source: true, createdAt: true,
        property: { select: { id: true, name: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const grouped = stages.map((stage) => {
      const stageLeads = leads.filter((l: typeof leads[number]) => l.stage === stage);
      return {
        stage,
        count: stageLeads.length,
        leads: stageLeads.map((l: typeof leads[number]) => ({
          ...l,
          displayName: l.companyName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unknown',
        })),
      };
    });

    return { stages: grouped };
  }

  // ── Stats ────────────────────────────────
  async getStats(companyId: string, propertyId?: string) {
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (propertyId) where.propertyId = propertyId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalActive, totalThisMonth, converted, allLeads] = await Promise.all([
      prisma.lead.count({ where: { ...where, stage: { notIn: ['lost', 'duplicate'] } } }),
      prisma.lead.count({ where: { ...where, createdAt: { gte: monthStart } } }),
      prisma.lead.count({ where: { ...where, stage: 'lease_signed' } }),
      prisma.lead.findMany({
        where: { ...where, stage: 'lease_signed', convertedAt: { not: null } },
        select: { createdAt: true, convertedAt: true },
      }),
    ]);

    const total = totalActive + await prisma.lead.count({ where: { ...where, stage: { in: ['lost', 'duplicate'] } } });
    const conversionRate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;

    let avgDaysToConvert = 0;
    if (allLeads.length > 0) {
      const totalDays = allLeads.reduce((sum: number, l: typeof allLeads[number]) => {
        const days = Math.ceil((new Date(l.convertedAt!).getTime() - new Date(l.createdAt).getTime()) / 86400000);
        return sum + days;
      }, 0);
      avgDaysToConvert = Math.round(totalDays / allLeads.length);
    }

    // By source
    const sourceGroups = await prisma.lead.groupBy({
      by: ['source'],
      where: { ...where, source: { not: null } },
      _count: true,
    });
    const bySource = Object.fromEntries(sourceGroups.map((s: typeof sourceGroups[number]) => [s.source || 'unknown', s._count]));

    // By agent
    const agentGroups = await prisma.lead.groupBy({
      by: ['assignedTo'],
      where: { ...where, assignedTo: { not: null } },
      _count: true,
    });
    const agentIds = agentGroups.map((a: typeof agentGroups[number]) => a.assignedTo!).filter(Boolean);
    const agents = agentIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
        })
      : [];

    const byAgent = agentGroups.map((a: typeof agentGroups[number]) => {
      const agent = agents.find((u: typeof agents[number]) => u.id === a.assignedTo);
      return {
        agentId: a.assignedTo,
        name: agent?.profile ? `${agent.profile.firstName} ${agent.profile.lastName}` : agent?.email || 'Unknown',
        open: a._count,
      };
    });

    return { totalActive, totalThisMonth, conversionRate, avgDaysToConvert, bySource, byAgent };
  }

  // ── Activities ───────────────────────────
  async getActivities(leadId: string, companyId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');

    return prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        performer: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async createActivity(leadId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');

    return prisma.leadActivity.create({
      data: {
        leadId,
        activityType: dto.activityType as string,
        description: dto.description as string,
        performedBy: userId,
        metadata: (dto.metadata as object) || {},
      },
      include: {
        performer: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  // ── Auto-assign ──────────────────────────
  private async autoAssignAgent(propertyId: string | undefined, companyId: string): Promise<string | null> {
    if (!propertyId) return null;

    // Find agents with role 'Leasing Agent' or any agent with fewest leads
    const agentLeadCounts = await prisma.lead.groupBy({
      by: ['assignedTo'],
      where: {
        companyId,
        propertyId,
        deletedAt: null,
        assignedTo: { not: null },
        stage: { notIn: ['lost', 'duplicate', 'lease_signed'] },
      },
      _count: true,
      orderBy: { _count: { assignedTo: 'asc' } },
    });

    if (agentLeadCounts.length > 0) {
      return agentLeadCounts[0].assignedTo!;
    }
    return null;
  }

  // ── Blacklist ───────────────────────────────
  async blacklist(id: string, companyId: string, reason: string, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');
    if (lead.isBlacklisted) throw AppError.conflict('Lead is already blacklisted');

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        isBlacklisted: true,
        blacklistedAt: new Date(),
        blacklistedBy: userId,
        blacklistReason: reason,
        stage: 'lost',
        lostReason: `Blacklisted: ${reason}`,
        lostAt: new Date(),
      },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: id,
        activityType: 'blacklist',
        description: `Lead blacklisted. Reason: ${reason}`,
        performedBy: userId,
        metadata: { action: 'blacklist', reason },
      },
    });

    return updated;
  }

  async unblacklist(id: string, companyId: string, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');
    if (!lead.isBlacklisted) throw AppError.conflict('Lead is not blacklisted');

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        isBlacklisted: false,
        blacklistedAt: null,
        blacklistedBy: null,
        blacklistReason: null,
        stage: 'new',
        lostReason: null,
        lostAt: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: id,
        activityType: 'blacklist',
        description: 'Lead removed from blacklist',
        performedBy: userId,
        metadata: { action: 'unblacklist' },
      },
    });

    return updated;
  }

  /**
   * Check if an email is blacklisted in this company.
   * Returns the blacklisted lead if found.
   */
  async checkEmailBlacklist(email: string, companyId: string): Promise<{ blacklisted: boolean; lead?: any }> {
    if (!email) return { blacklisted: false };

    const blacklisted = await prisma.lead.findFirst({
      where: {
        companyId,
        email: { equals: email, mode: 'insensitive' },
        isBlacklisted: true,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        blacklistReason: true,
        blacklistedAt: true,
      },
    });

    return blacklisted
      ? { blacklisted: true, lead: blacklisted }
      : { blacklisted: false };
  }
}

export const leadsService = new LeadsService();
