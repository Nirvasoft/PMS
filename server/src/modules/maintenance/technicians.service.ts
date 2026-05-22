import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class TechniciansService {
  /** List technician profiles with open job counts and today's schedule */
  async findAll(companyId: string, filters: {
    propertyId?: string; skill?: string; isAvailable?: string;
  }) {
    const where: any = { companyId };
    if (filters.propertyId) {
      where.OR = [
        { propertyId: filters.propertyId },
        { propertyId: null },
      ];
    }
    if (filters.isAvailable !== undefined) {
      where.isAvailable = filters.isAvailable === 'true';
    }

    const profiles = await prisma.technicianProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Filter by skill if requested
    let filtered = profiles;
    if (filters.skill) {
      filtered = profiles.filter((p) =>
        p.skills.some((s) => s.toLowerCase().includes(filters.skill!.toLowerCase())),
      );
    }

    // Enrich with open job counts and today's schedule
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const enriched = await Promise.all(filtered.map(async (tech) => {
      const openJobs = await prisma.workOrder.count({
        where: { assignedToId: tech.userId, status: { notIn: ['completed', 'cancelled'] } },
      });

      const todaySchedule = await prisma.workOrder.findMany({
        where: {
          assignedToId: tech.userId,
          scheduledStart: { gte: today, lt: tomorrow },
          status: { notIn: ['cancelled'] },
        },
        select: {
          id: true, woNumber: true, title: true, status: true,
          scheduledStart: true, scheduledEnd: true,
        },
        orderBy: { scheduledStart: 'asc' },
      });

      return {
        userId: tech.userId,
        fullName: tech.user.profile
          ? `${tech.user.profile.firstName || ''} ${tech.user.profile.lastName || ''}`.trim()
          : tech.user.email,
        email: tech.user.email,
        photoUrl: tech.user.profile?.avatarUrl || null,
        phone: tech.user.profile?.phone || null,
        skills: tech.skills,
        certifications: tech.certifications,
        hourlyRate: Number(tech.hourlyRate || 0),
        isAvailable: tech.isAvailable,
        maxConcurrentJobs: tech.maxConcurrentJobs,
        workingHours: tech.workingHours,
        propertyId: tech.propertyId,
        openJobs,
        todaySchedule: todaySchedule.map((wo) => ({
          woId: wo.id,
          woNumber: wo.woNumber,
          title: wo.title,
          from: wo.scheduledStart?.toISOString() || null,
          to: wo.scheduledEnd?.toISOString() || null,
          status: wo.status,
        })),
      };
    }));

    return enriched;
  }

  /** Get calendar-style schedule for a technician in a date range */
  async getSchedule(userId: string, companyId: string, filters: { from: string; to: string }) {
    const tech = await prisma.technicianProfile.findUnique({ where: { userId } });
    if (!tech || tech.companyId !== companyId) {
      throw AppError.notFound('Technician profile');
    }

    const workOrders = await prisma.workOrder.findMany({
      where: {
        assignedToId: userId,
        status: { notIn: ['cancelled'] },
        OR: [
          { scheduledStart: { gte: new Date(filters.from), lte: new Date(filters.to) } },
          { scheduledEnd: { gte: new Date(filters.from), lte: new Date(filters.to) } },
        ],
      },
      include: {
        ticket: {
          select: {
            ticketNumber: true, priority: true,
            category: { select: { name: true, icon: true } },
            unit: { select: { unitNumber: true } },
            property: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    return workOrders.map((wo) => ({
      id: wo.id,
      woNumber: wo.woNumber,
      title: wo.title,
      status: wo.status,
      ticketNumber: wo.ticket.ticketNumber,
      priority: wo.ticket.priority,
      category: wo.ticket.category.name,
      categoryIcon: wo.ticket.category.icon,
      unitNumber: wo.ticket.unit?.unitNumber || null,
      propertyName: wo.ticket.property?.name || null,
      start: wo.scheduledStart?.toISOString() || null,
      end: wo.scheduledEnd?.toISOString() || null,
      actualStart: wo.actualStart?.toISOString() || null,
      actualEnd: wo.actualEnd?.toISOString() || null,
    }));
  }

  /** Create or update a technician profile */
  async upsertProfile(userId: string, companyId: string, dto: Record<string, unknown>) {
    // Verify user exists
    const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw AppError.notFound('User');

    const data: any = { companyId };
    if (dto.propertyId !== undefined) data.propertyId = dto.propertyId;
    if (dto.skills !== undefined) data.skills = dto.skills;
    if (dto.certifications !== undefined) data.certifications = dto.certifications;
    if (dto.hourlyRate !== undefined) data.hourlyRate = dto.hourlyRate;
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;
    if (dto.workingHours !== undefined) data.workingHours = dto.workingHours;
    if (dto.maxConcurrentJobs !== undefined) data.maxConcurrentJobs = dto.maxConcurrentJobs;

    return prisma.technicianProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      include: {
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }
}

export const techniciansService = new TechniciansService();
