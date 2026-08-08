import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

class CommunityService {
  // ══════════════════════════════════════════════
  //  ANNOUNCEMENTS
  // ══════════════════════════════════════════════

  async getPortalAnnouncements(companyId: string, userId: string, filters: {
    category?: string; page?: number; limit?: number;
  }) {
    const resident = await this.getActiveResident(companyId, userId);
    const { page = 1, limit = 20 } = filters;

    const where: any = {
      companyId,
      propertyId: resident.propertyId,
      status: 'published',
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } },
      ],
    };
    if (filters.category) where.category = filters.category;

    const [data, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: {
          reads: {
            where: { userId },
            select: { readAt: true },
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    const formatted = data.map(a => ({
      ...a,
      isRead: a.reads.length > 0,
      reads: undefined,
      preview: a.content.substring(0, 200) + (a.content.length > 200 ? '...' : ''),
    }));

    return { data: formatted, meta: { total, page, limit } };
  }

  async getAnnouncementById(companyId: string, userId: string, id: string) {
    const announcement = await prisma.announcement.findFirst({
      where: { id, companyId, status: 'published' },
      include: { creator: { select: { email: true } } },
    });
    if (!announcement) throw AppError.notFound('Announcement');

    // Increment view count
    await prisma.announcement.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return announcement;
  }

  async markAnnouncementRead(companyId: string, userId: string, announcementId: string) {
    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: { readAt: new Date() },
      create: { companyId, announcementId, userId },
    });
    return { success: true };
  }

  async createAnnouncement(companyId: string, userId: string, data: {
    propertyId: string;
    title: string;
    content: string;
    contentHtml?: string;
    category?: string;
    priority?: string;
    targetAudience?: string;
    targetConfig?: any;
    isPinned?: boolean;
    publishedAt?: string;
    expiresAt?: string;
    sendPush?: boolean;
    sendEmail?: boolean;
  }) {
    return prisma.announcement.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        title: data.title,
        content: data.content,
        contentHtml: data.contentHtml,
        category: data.category || 'general',
        priority: data.priority || 'normal',
        targetAudience: data.targetAudience || 'all',
        targetConfig: data.targetConfig,
        isPinned: data.isPinned || false,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        status: 'published',
        sendPush: data.sendPush ?? true,
        sendEmail: data.sendEmail ?? false,
        createdBy: userId,
      },
    });
  }

  // ══════════════════════════════════════════════
  //  POLLS
  // ══════════════════════════════════════════════

  async getPortalPolls(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    const polls = await prisma.poll.findMany({
      where: {
        companyId,
        propertyId: resident.propertyId,
        status: 'active',
      },
      include: {
        votes: {
          where: { userId },
          select: { optionIds: true },
        },
        _count: { select: { votes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return polls.map(poll => {
      const userVote = poll.votes[0] || null;
      const now = new Date();
      const isEnded = now > poll.endAt;
      const canViewResults = isEnded || !!userVote;

      return {
        ...poll,
        userVote: userVote?.optionIds || null,
        totalVotes: poll._count.votes,
        isEnded,
        canViewResults,
        votes: undefined,
        _count: undefined,
      };
    });
  }

  async votePoll(companyId: string, userId: string, pollId: string, optionIds: string[]) {
    const poll = await prisma.poll.findFirst({
      where: { id: pollId, companyId, status: 'active' },
    });
    if (!poll) throw AppError.notFound('Poll');

    const now = new Date();
    if (now < poll.startAt) throw AppError.validation('Poll has not started yet');
    if (now > poll.endAt) throw AppError.validation('Poll has already ended');

    // Validate option IDs
    const validOptionIds = (poll.options as any[]).map(o => o.id);
    const invalid = optionIds.filter(id => !validOptionIds.includes(id));
    if (invalid.length) throw AppError.validation(`Invalid option IDs: ${invalid.join(', ')}`);

    if (poll.pollType === 'single' && optionIds.length > 1) {
      throw AppError.validation('Only one option allowed for this poll');
    }

    // Check existing vote
    const existingVote = await prisma.pollVote.findUnique({
      where: { uq_poll_vote: { pollId, userId } },
    });
    if (existingVote) throw AppError.validation('You have already voted');

    await prisma.pollVote.create({
      data: { companyId, pollId, userId, optionIds },
    });

    return { success: true };
  }

  async getPollResults(companyId: string, userId: string, pollId: string) {
    const poll = await prisma.poll.findFirst({
      where: { id: pollId, companyId },
      include: {
        votes: { select: { optionIds: true } },
        _count: { select: { votes: true } },
      },
    });
    if (!poll) throw AppError.notFound('Poll');

    // Tally votes per option
    const optionVotes: Record<string, number> = {};
    for (const vote of poll.votes) {
      for (const oid of vote.optionIds) {
        optionVotes[oid] = (optionVotes[oid] || 0) + 1;
      }
    }

    const options = (poll.options as any[]).map(opt => ({
      ...opt,
      voteCount: optionVotes[opt.id] || 0,
    }));

    return {
      id: poll.id,
      title: poll.title,
      totalVotes: poll._count.votes,
      options,
    };
  }

  async createPoll(companyId: string, userId: string, data: {
    propertyId: string;
    title: string;
    description?: string;
    options: { id: string; text: string }[];
    pollType?: string;
    startAt: string;
    endAt: string;
    isAnonymous?: boolean;
  }) {
    const optionsWithCounts = data.options.map(o => ({ ...o, voteCount: 0 }));

    return prisma.poll.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        title: data.title,
        description: data.description,
        options: optionsWithCounts,
        pollType: data.pollType || 'single',
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        isAnonymous: data.isAnonymous ?? true,
        createdBy: userId,
      },
    });
  }

  // ══════════════════════════════════════════════
  //  COMPLAINTS
  // ══════════════════════════════════════════════

  async getPortalComplaints(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.communityComplaint.findMany({
      where: {
        companyId,
        submittedBy: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async submitComplaint(companyId: string, userId: string, data: {
    category: string;
    title: string;
    description: string;
    isAnonymous?: boolean;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.communityComplaint.create({
      data: {
        companyId,
        propertyId: resident.propertyId,
        unitId: resident.unitId,
        submittedBy: userId,
        residentId: resident.id,
        category: data.category,
        title: data.title,
        description: data.description,
        isAnonymous: data.isAnonymous || false,
      },
    });
  }

  async respondToComplaint(companyId: string, userId: string, complaintId: string, response: string) {
    const complaint = await prisma.communityComplaint.findFirst({
      where: { id: complaintId, companyId },
    });
    if (!complaint) throw AppError.notFound('Complaint');

    return prisma.communityComplaint.update({
      where: { id: complaintId },
      data: {
        response,
        respondedBy: userId,
        respondedAt: new Date(),
        status: 'resolved',
      },
    });
  }

  async rateComplaint(companyId: string, userId: string, complaintId: string, score: number) {
    const complaint = await prisma.communityComplaint.findFirst({
      where: { id: complaintId, companyId, submittedBy: userId },
    });
    if (!complaint) throw AppError.notFound('Complaint');

    return prisma.communityComplaint.update({
      where: { id: complaintId },
      data: { satisfactionScore: score, status: 'closed' },
    });
  }

  // ══════════════════════════════════════════════
  //  MOVE REQUESTS
  // ══════════════════════════════════════════════

  async getPortalMoveRequests(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.moveRequest.findMany({
      where: { companyId, residentId: resident.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async submitMoveRequest(companyId: string, userId: string, data: {
    requestType: string;
    requestedDate: string;
    preferredTime?: string;
    depositAmount?: number;
    notes?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.moveRequest.create({
      data: {
        companyId,
        propertyId: resident.propertyId,
        unitId: resident.unitId,
        leaseId: resident.leaseId,
        residentId: resident.id,
        requestType: data.requestType,
        requestedDate: new Date(data.requestedDate),
        preferredTime: data.preferredTime,
        depositAmount: data.depositAmount,
        notes: data.notes,
      },
    });
  }

  async getAdminMoveRequests(companyId: string, filters: {
    propertyId?: string; status?: string; requestType?: string;
  }) {
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.status) where.status = filters.status;
    if (filters.requestType) where.requestType = filters.requestType;

    return prisma.moveRequest.findMany({
      where,
      include: {
        resident: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true } },
        property: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async approveMoveRequest(companyId: string, userId: string, requestId: string, data: {
    inspectionAt?: string; notes?: string;
  }) {
    const request = await prisma.moveRequest.findFirst({
      where: { id: requestId, companyId, status: 'pending' },
    });
    if (!request) throw AppError.notFound('Move request');

    return prisma.moveRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        inspectionAt: data.inspectionAt ? new Date(data.inspectionAt) : undefined,
        notes: data.notes,
      },
    });
  }

  // ══════════════════════════════════════════════
  //  ADMIN LIST ENDPOINTS
  // ══════════════════════════════════════════════

  async getAdminAnnouncements(companyId: string, filters: {
    propertyId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: {
          property: { select: { name: true } },
          creator: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
          _count: { select: { reads: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getAdminPolls(companyId: string, filters: {
    propertyId?: string; page?: number; limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;

    const [data, total] = await Promise.all([
      prisma.poll.findMany({
        where,
        include: {
          property: { select: { name: true } },
          _count: { select: { votes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.poll.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getAdminComplaints(companyId: string, filters: {
    propertyId?: string; status?: string; page?: number; limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.communityComplaint.findMany({
        where,
        include: {
          property: { select: { name: true } },
          unit: { select: { unitNumber: true } },
          resident: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.communityComplaint.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  // ── Helper ─────────────────────────────────

  private async getActiveResident(companyId: string, userId: string) {
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
    });
    if (!resident) throw AppError.notFound('No active residence found for this user');
    return resident;
  }
}

export const communityService = new CommunityService();
