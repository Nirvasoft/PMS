import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { googleCalendarService } from './googleCalendar.service';
import { logger } from '../../common/logger';

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
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, deletedAt: null },
      include: { property: { select: { name: true } } },
    });
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

    // ── Google Calendar Sync (fire-and-forget) ──
    if (viewing.agentId) {
      const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';
      googleCalendarService.createViewingEvent(viewing.agentId, {
        scheduledAt: viewing.scheduledAt.toISOString(),
        durationMinutes: viewing.durationMinutes,
        leadName,
        unitInfo: viewing.unit?.unitNumber,
        propertyName: (lead as any).property?.name,
      }).then(eventId => {
        if (eventId) {
          prisma.leadViewing.update({
            where: { id: viewing.id },
            data: { calendarEventId: eventId },
          }).catch(err => logger.error('Failed to save calendarEventId:', err.message));
        }
      }).catch(err => logger.error('Calendar sync create error:', err.message));
    }

    return viewing;
  }

  async update(leadId: string, viewingId: string, dto: Record<string, unknown>) {
    const viewing = await prisma.leadViewing.findFirst({
      where: { id: viewingId, leadId },
      include: {
        lead: { select: { firstName: true, lastName: true } },
      },
    });
    if (!viewing) throw AppError.notFound('Viewing');

    const data: Record<string, unknown> = {};
    if (dto.scheduledAt)      data.scheduledAt = new Date(dto.scheduledAt as string);
    if (dto.durationMinutes)  data.durationMinutes = dto.durationMinutes;
    if (dto.agentId)          data.agentId = dto.agentId;
    if (dto.status)           data.status = dto.status;

    // If rescheduling, reset reminderSent
    if (dto.scheduledAt) data.reminderSent = false;

    const updated = await prisma.leadViewing.update({
      where: { id: viewingId },
      data: data as any,
      include: {
        unit:  { select: { id: true, unitNumber: true, unitType: true } },
        agent: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    // ── Google Calendar Sync (fire-and-forget) ──
    if (viewing.calendarEventId && viewing.agentId) {
      if (dto.status === 'cancelled') {
        // Delete the calendar event
        googleCalendarService.deleteViewingEvent(viewing.agentId, viewing.calendarEventId)
          .catch(err => logger.error('Calendar sync delete error:', err.message));
      } else if (dto.scheduledAt || dto.durationMinutes) {
        // Update the calendar event
        const leadName = [viewing.lead.firstName, viewing.lead.lastName].filter(Boolean).join(' ');
        googleCalendarService.updateViewingEvent(viewing.agentId, viewing.calendarEventId, {
          scheduledAt: (data.scheduledAt as Date)?.toISOString() || viewing.scheduledAt.toISOString(),
          durationMinutes: (data.durationMinutes as number) || viewing.durationMinutes,
          leadName,
        }).catch(err => logger.error('Calendar sync update error:', err.message));
      }
    }

    return updated;
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

    // ── Google Calendar: mark as done (don't delete — keep history) ──
    // No action needed — the event stays in calendar as a historical record

    return updated;
  }
}

export const viewingsService = new ViewingsService();

