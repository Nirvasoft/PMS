import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class ViewingsService {
  async findByLead(leadId: string, companyId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');

    return prisma.leadViewing.findMany({
      where: { leadId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        unit:  { select: { id: true, unitNumber: true, unitType: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        property: { select: { id: true, name: true } },
      },
    });
  }

  async create(leadId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead');

    const viewing = await prisma.leadViewing.create({
      data: {
        leadId,
        unitId: (dto.unitId as string) || null,
        propertyId: (dto.propertyId as string) || lead.propertyId,
        scheduledAt: new Date(dto.scheduledAt as string),
        durationMinutes: (dto.durationMinutes as number) || 30,
        agentId: (dto.agentId as string) || lead.assignedTo,
      },
      include: {
        unit:  { select: { id: true, unitNumber: true, unitType: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Auto-update lead stage if currently 'contacted' or 'new'
    if (['new', 'contacted'].includes(lead.stage)) {
      await prisma.lead.update({ where: { id: leadId }, data: { stage: 'viewing_scheduled' } });
      await prisma.leadActivity.create({
        data: {
          leadId,
          activityType: 'stage_change',
          description: `Stage changed: ${lead.stage} → viewing_scheduled (viewing scheduled)`,
          performedBy: userId,
          metadata: { previousStage: lead.stage, newStage: 'viewing_scheduled' },
        },
      });
    }

    // Log viewing activity
    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'viewing',
        description: `Viewing scheduled for ${new Date(dto.scheduledAt as string).toLocaleString()}`,
        performedBy: userId,
        metadata: { viewingId: viewing.id },
      },
    });

    return viewing;
  }

  async update(leadId: string, viewingId: string, dto: Record<string, unknown>) {
    const viewing = await prisma.leadViewing.findFirst({ where: { id: viewingId, leadId } });
    if (!viewing) throw AppError.notFound('Viewing');

    const data: Record<string, unknown> = {};
    if (dto.scheduledAt)      data.scheduledAt = new Date(dto.scheduledAt as string);
    if (dto.durationMinutes)  data.durationMinutes = dto.durationMinutes;
    if (dto.agentId)          data.agentId = dto.agentId;
    if (dto.status)           data.status = dto.status;

    return prisma.leadViewing.update({
      where: { id: viewingId },
      data: data as any,
      include: {
        unit:  { select: { id: true, unitNumber: true, unitType: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async complete(leadId: string, viewingId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const viewing = await prisma.leadViewing.findFirst({ where: { id: viewingId, leadId } });
    if (!viewing) throw AppError.notFound('Viewing');

    const updated = await prisma.leadViewing.update({
      where: { id: viewingId },
      data: {
        status: 'completed',
        outcome: dto.outcome as string,
        agentNotes: (dto.agentNotes as string) || null,
      },
      include: {
        unit:  { select: { id: true, unitNumber: true, unitType: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Auto-update lead stage to 'viewed' if currently 'viewing_scheduled'
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (lead && lead.stage === 'viewing_scheduled') {
      await prisma.lead.update({ where: { id: leadId }, data: { stage: 'viewed' } });
      await prisma.leadActivity.create({
        data: {
          leadId,
          activityType: 'stage_change',
          description: `Stage changed: viewing_scheduled → viewed (viewing completed)`,
          performedBy: userId,
          metadata: { previousStage: 'viewing_scheduled', newStage: 'viewed' },
        },
      });
    }

    // Log completion activity
    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'viewing',
        description: `Viewing completed — outcome: ${dto.outcome}${dto.agentNotes ? `. Notes: ${dto.agentNotes}` : ''}`,
        performedBy: userId,
        metadata: { viewingId, outcome: dto.outcome as string } as any,
      },
    });

    return updated;
  }
}

export const viewingsService = new ViewingsService();
