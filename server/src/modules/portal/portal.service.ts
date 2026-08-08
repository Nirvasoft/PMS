import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { paymentGatewayService } from '../banking/paymentGateway.service';
import { KycService } from '../tenants/tenants.service';

class PortalService {
  /**
   * Get full dashboard data for a portal user.
   */
  async getDashboardData(companyId: string, userId: string) {
    // Find the active resident record for this user
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
      include: {
        unit: {
          include: {
            property: {
              include: { contacts: true },
            },
          },
        },
        lease: true,
      },
    });

    if (!resident) {
      throw AppError.notFound('No active residence found for this user');
    }

    const [invoiceSummary, openTickets, recentAnnouncements, quickActions] = await Promise.all([
      this.getInvoiceSummary(companyId, resident.tenantId),
      this.getOpenTickets(companyId, resident.unitId),
      this.getRecentAnnouncements(companyId, resident.propertyId),
      prisma.portalQuickAction.findMany({
        where: { companyId, propertyId: resident.propertyId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true, icon: true, actionType: true, actionUrl: true, sortOrder: true },
      }),
    ]);

    // Calculate days until lease expiry
    let daysUntilExpiry: number | null = null;
    if (resident.lease?.endDate) {
      const now = new Date();
      const end = new Date(resident.lease.endDate);
      daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      resident: {
        id: resident.id,
        firstName: resident.firstName,
        lastName: resident.lastName,
        avatarUrl: resident.avatarUrl,
        residentType: resident.residentType,
      },
      unit: {
        id: resident.unit.id,
        unitNumber: resident.unit.unitNumber,
        unitType: resident.unit.unitType,
        floorNumber: resident.unit.floorNumber,
      },
      property: {
        id: resident.unit.property.id,
        name: resident.unit.property.name,
        address: [
          resident.unit.property.addressLine1,
          resident.unit.property.city,
          resident.unit.property.state,
        ].filter(Boolean).join(', '),
        coverImageUrl: resident.unit.property.coverImageUrl,
        contacts: resident.unit.property.contacts?.map((c: any) => ({
          role: c.role,
          name: c.name,
          phone: c.phone,
        })) || [],
      },
      lease: resident.lease ? {
        id: resident.lease.id,
        leaseNumber: resident.lease.leaseNumber,
        startDate: resident.lease.startDate,
        endDate: resident.lease.endDate,
        rentAmount: resident.lease.rentAmount,
        currency: resident.lease.currency,
        daysUntilExpiry,
        status: resident.lease.status,
      } : null,
      invoiceSummary,
      openTickets,
      recentAnnouncements,
      quickActions,
      branding: (() => {
        const s = (resident.unit.property as any).settings || {};
        const p = s.portal || {};
        return {
          logoUrl: p.logoUrl || null,
          primaryColor: p.primaryColor || '#6366f1',
          accentColor: p.accentColor || '#a78bfa',
          welcomeMessage: p.welcomeMessage || `Welcome to ${resident.unit.property.name}`,
          supportEmail: p.supportEmail || null,
          supportPhone: p.supportPhone || null,
        };
      })(),
    };
  }

  private async getInvoiceSummary(companyId: string, tenantId: string | null) {
    if (!tenantId) return { outstanding: 0, overdueCount: 0, paidThisMonth: 0, nextDueDate: null };

    const result = await prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(SUM(outstanding_amount) FILTER (WHERE status IN ('issued','sent','overdue','partially_paid')), 0) AS outstanding,
        COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND invoice_date >= date_trunc('month', NOW())), 0) AS paid_this_month,
        MIN(due_date) FILTER (WHERE status IN ('issued','sent','partially_paid')) AS next_due_date
      FROM invoices
      WHERE tenant_id = ${tenantId}::uuid AND company_id = ${companyId}::uuid
    `;

    const row = result[0] || {};
    return {
      outstanding: Number(row.outstanding || 0),
      overdueCount: Number(row.overdue_count || 0),
      paidThisMonth: Number(row.paid_this_month || 0),
      nextDueDate: row.next_due_date || null,
    };
  }

  private async getOpenTickets(companyId: string, unitId: string) {
    return prisma.maintenanceTicket.findMany({
      where: {
        companyId,
        unitId,
        status: { in: ['open', 'in_progress', 'assigned', 'on_hold'] },
        deletedAt: null,
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  private async getRecentAnnouncements(_companyId: string, _propertyId: string) {
    // Announcements are a placeholder — return empty for now
    // In a full implementation, this would query a property announcements table
    return [];
  }

  /**
   * Get paginated invoices for the portal user's tenant account.
   */
  async getInvoices(companyId: string, userId: string, filters: {
    status?: string; page?: number; limit?: number;
  }) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.tenantId) throw AppError.notFound('No tenant account linked');

    const { page = 1, limit = 10 } = filters;
    const where: any = {
      companyId,
      tenantId: resident.tenantId,
    };
    if (filters.status) {
      where.status = { in: filters.status.split(',') };
    }

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          lines: {
            select: { description: true, amount: true },
          },
        },
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Get payment / receipt history for the portal user.
   */
  async getPaymentHistory(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.tenantId) throw AppError.notFound('No tenant account linked');

    const receipts = await prisma.receipt.findMany({
      where: {
        companyId,
        tenantId: resident.tenantId,
        status: { not: 'reversed' },
      },
      include: {
        allocations: {
          include: {
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
      orderBy: { receiptDate: 'desc' },
      take: 50,
    });

    return receipts.map((r: any) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receiptDate: r.receiptDate,
      amount: r.amount,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      allocations: r.allocations?.map((a: any) => ({
        invoiceNumber: a.invoice?.invoiceNumber,
        amount: a.amount,
      })) || [],
    }));
  }

  /**
   * Get current active lease detail for portal user.
   */
  async getLeaseDetail(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.leaseId) throw AppError.notFound('No active lease found');

    const lease = await prisma.lease.findFirst({
      where: { id: resident.leaseId, companyId },
      include: {
        escalationSchedule: { orderBy: { effectiveDate: 'asc' } },
        property: { select: { name: true, code: true } },
        unit: { select: { unitNumber: true } },
      },
    });

    if (!lease) throw AppError.notFound('Lease');
    return lease;
  }

  /**
   * Get documents linked to the portal user's lease.
   */
  async getLeaseDocuments(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.leaseId) return [];

    // Get documents linked to this lease via entityType/entityId
    const documents = await prisma.document.findMany({
      where: {
        companyId,
        entityType: 'lease',
        entityId: resident.leaseId,
      },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return documents;
  }

  /**
   * Get maintenance tickets for portal user's unit.
   */
  async getMaintenanceTickets(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    return prisma.maintenanceTicket.findMany({
      where: {
        companyId,
        unitId: resident.unitId,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true, icon: true } },
        photos: { select: { id: true, url: true, photoType: true }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get single maintenance ticket detail.
   */
  async getMaintenanceTicketById(companyId: string, userId: string, ticketId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: {
        id: ticketId,
        companyId,
        unitId: resident.unitId,
        deletedAt: null,
      },
      include: {
        category: true,
        photos: true,
        workOrders: {
          select: {
            id: true,
            woNumber: true,
            status: true,
            scheduledStart: true,
            actualEnd: true,
            description: true,
          },
        },
      },
    });

    if (!ticket) throw AppError.notFound('Maintenance ticket');
    return ticket;
  }

  /**
   * Submit a new maintenance request from the portal.
   */
  async submitMaintenanceRequest(companyId: string, userId: string, data: {
    title: string;
    description: string;
    categoryId?: string;
    priority?: string;
    locationDetail?: string;
    requiresAccess?: boolean;
    preferredAccessTime?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    // Generate ticket number
    const count = await prisma.maintenanceTicket.count({ where: { companyId } });
    const ticketNumber = `TKT-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Resolve categoryId — if not provided, use first company category
    let resolvedCategoryId = data.categoryId;
    if (!resolvedCategoryId) {
      const defaultCat = await prisma.maintenanceCategory.findFirst({
        where: { companyId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      if (!defaultCat) throw AppError.validation('No maintenance categories configured. Please contact management.');
      resolvedCategoryId = defaultCat.id;
    }

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        companyId,
        propertyId: resident.propertyId,
        unitId: resident.unitId,
        ticketNumber,
        title: data.title,
        description: data.description,
        categoryId: resolvedCategoryId,
        priority: data.priority || 'P3',
        source: 'tenant',
        status: 'open',
        locationDetail: data.locationDetail || undefined,
        reportedByTenantId: resident.tenantId || undefined,
        reportedByUserId: userId,
      },
    });

    return ticket;
  }

  /**
   * Rate a resolved maintenance ticket.
   */
  async rateTicket(companyId: string, userId: string, ticketId: string, data: {
    rating: number; comment?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: {
        id: ticketId,
        companyId,
        unitId: resident.unitId,
        status: { in: ['resolved', 'closed'] },
        deletedAt: null,
      },
    });

    if (!ticket) throw AppError.notFound('Resolved ticket');

    return prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        rating: data.rating,
        ratingComment: data.comment || null,
        ratedAt: new Date(),
      },
    });
  }

  /**
   * Get portal user profile.
   */
  async getProfile(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    return {
      resident: {
        id: resident.id,
        firstName: resident.firstName,
        lastName: resident.lastName,
        email: resident.email,
        mobile: resident.mobile,
        avatarUrl: resident.avatarUrl,
        vehiclePlate: resident.vehiclePlate,
        residentType: resident.residentType,
      },
      profile: profile ? {
        timezone: profile.timezone,
        locale: profile.locale,
      } : null,
    };
  }

  /**
   * Update portal user profile.
   */
  async updateProfile(companyId: string, userId: string, data: {
    mobile?: string; avatarUrl?: string; timezone?: string; locale?: string;
  }) {
    const resident = await this.getActiveResident(companyId, userId);

    // Update resident contact info
    if (data.mobile || data.avatarUrl) {
      await prisma.resident.update({
        where: { id: resident.id },
        data: {
          ...(data.mobile && { mobile: data.mobile }),
          ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
        },
      });
    }

    // Update user profile preferences
    if (data.timezone || data.locale) {
      await prisma.userProfile.upsert({
        where: { userId },
        update: {
          ...(data.timezone && { timezone: data.timezone }),
          ...(data.locale && { locale: data.locale }),
        },
        create: {
          userId,
          firstName: resident.firstName,
          lastName: resident.lastName,
          ...(data.timezone && { timezone: data.timezone }),
          ...(data.locale && { locale: data.locale }),
        },
      });
    }

    return this.getProfile(companyId, userId);
  }

  // ── Invoice Payment ─────────────────────────

  /**
   * Initiate Stripe Checkout for an invoice.
   * Returns a checkout URL that the frontend redirects to.
   */
  async payInvoice(companyId: string, userId: string, invoiceId: string, returnUrl: string) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.tenantId) throw AppError.notFound('No tenant account linked');

    // Verify invoice belongs to this tenant
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, tenantId: resident.tenantId },
      include: { tenant: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!invoice) throw AppError.notFound('Invoice');

    const outstanding = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (outstanding <= 0) throw AppError.validation('Invoice is already fully paid');

    // Delegate to payment gateway service
    const result = await paymentGatewayService.initiate(companyId, {
      gateway: 'stripe',
      invoiceId: invoice.id,
      tenantId: resident.tenantId,
      amount: outstanding,
      currency: invoice.currency || 'USD',
      payerEmail: invoice.tenant?.email || undefined,
      payerName: invoice.tenant
        ? `${invoice.tenant.firstName} ${invoice.tenant.lastName}`.trim()
        : undefined,
      propertyId: resident.propertyId,
      returnUrl,
    });

    return {
      checkoutUrl: result.checkoutUrl,
      sessionId: result.gatewayTxnId,
      amount: outstanding,
      currency: invoice.currency || 'USD',
    };
  }

  // ── KYC Self-Upload ─────────────────────────

  private kycService = new KycService();

  /**
   * Get KYC status and document checklist for the portal user.
   */
  async getKycStatus(companyId: string, userId: string) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.tenantId) throw AppError.notFound('No tenant account linked');
    return this.kycService.getKyc(resident.tenantId, companyId);
  }

  /**
   * Submit a KYC document (self-upload from portal).
   * Document goes to 'pending' status — admin must review.
   */
  async submitKycDocument(companyId: string, userId: string, dto: { requirementId: string; documentId: string }) {
    const resident = await this.getActiveResident(companyId, userId);
    if (!resident.tenantId) throw AppError.notFound('No tenant account linked');
    return this.kycService.submitDocument(resident.tenantId, companyId, dto);
  }

  // ── Quick Actions Admin CRUD ───────────────

  async getQuickActions(companyId: string, propertyId?: string) {
    return prisma.portalQuickAction.findMany({
      where: { companyId, ...(propertyId ? { propertyId } : {}) },
      orderBy: [{ propertyId: 'asc' }, { sortOrder: 'asc' }],
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async createQuickAction(companyId: string, data: {
    propertyId: string; label: string; icon?: string;
    actionType: string; actionUrl?: string; sortOrder?: number;
  }) {
    return prisma.portalQuickAction.create({
      data: {
        companyId,
        propertyId: data.propertyId,
        label: data.label,
        icon: data.icon || null,
        actionType: data.actionType,
        actionUrl: data.actionUrl || null,
        sortOrder: data.sortOrder ?? 0,
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async updateQuickAction(companyId: string, actionId: string, data: {
    label?: string; icon?: string; actionType?: string;
    actionUrl?: string; isActive?: boolean; sortOrder?: number;
  }) {
    const existing = await prisma.portalQuickAction.findFirst({ where: { id: actionId, companyId } });
    if (!existing) throw AppError.notFound('Quick action');
    return prisma.portalQuickAction.update({
      where: { id: actionId },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.actionType !== undefined ? { actionType: data.actionType } : {}),
        ...(data.actionUrl !== undefined ? { actionUrl: data.actionUrl } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async deleteQuickAction(companyId: string, actionId: string) {
    const existing = await prisma.portalQuickAction.findFirst({ where: { id: actionId, companyId } });
    if (!existing) throw AppError.notFound('Quick action');
    await prisma.portalQuickAction.delete({ where: { id: actionId } });
  }

  // ── Resident Access Cards CRUD ─────────────

  async getAccessCards(companyId: string, filters: {
    propertyId?: string; residentId?: string; status?: string;
    cardType?: string; search?: string;
    page?: number; limit?: number;
  }) {
    const { page = 1, limit = 25 } = filters;
    const where: any = { companyId };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.residentId) where.residentId = filters.residentId;
    if (filters.status) where.status = filters.status;
    if (filters.cardType) where.cardType = filters.cardType;
    if (filters.search) {
      where.OR = [
        { cardNumber: { contains: filters.search, mode: 'insensitive' } },
        { resident: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { resident: { lastName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.residentAccessCard.findMany({
        where,
        include: {
          resident: { select: { id: true, firstName: true, lastName: true, residentType: true } },
          property: { select: { id: true, name: true } },
          issuedBy: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.residentAccessCard.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async issueAccessCard(companyId: string, issuedById: string, dto: {
    residentId: string; propertyId: string; cardNumber: string;
    cardType?: string; issuedAt?: string; expiresAt?: string; notes?: string;
  }) {
    // Check duplicate card number in same company
    const existing = await prisma.residentAccessCard.findFirst({
      where: { companyId, cardNumber: dto.cardNumber, status: { in: ['active', 'suspended'] } },
    });
    if (existing) throw AppError.conflict('Card number already in use');

    return prisma.residentAccessCard.create({
      data: {
        companyId,
        residentId: dto.residentId,
        propertyId: dto.propertyId,
        cardNumber: dto.cardNumber,
        cardType: dto.cardType || 'rfid',
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        notes: dto.notes || null,
        issuedById,
      },
      include: {
        resident: { select: { id: true, firstName: true, lastName: true, residentType: true } },
        property: { select: { id: true, name: true } },
      },
    });
  }

  async updateAccessCard(companyId: string, cardId: string, dto: {
    status?: string; notes?: string; expiresAt?: string;
  }) {
    const card = await prisma.residentAccessCard.findFirst({ where: { id: cardId, companyId } });
    if (!card) throw AppError.notFound('Access card');
    return prisma.residentAccessCard.update({
      where: { id: cardId },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
      },
      include: {
        resident: { select: { id: true, firstName: true, lastName: true, residentType: true } },
        property: { select: { id: true, name: true } },
      },
    });
  }

  async getAccessCardStats(companyId: string) {
    const counts = await prisma.residentAccessCard.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    });
    const byType = await prisma.residentAccessCard.groupBy({
      by: ['cardType'],
      where: { companyId },
      _count: true,
    });
    const expiringSoon = await prisma.residentAccessCard.count({
      where: {
        companyId,
        status: 'active',
        expiresAt: { lte: new Date(Date.now() + 30 * 86400000), gte: new Date() },
      },
    });
    return {
      byStatus: counts.map(c => ({ status: c.status, count: c._count })),
      byType: byType.map(t => ({ type: t.cardType, count: t._count })),
      expiringSoon,
      total: counts.reduce((s, c) => s + c._count, 0),
    };
  }

  // ── Portal Branding ────────────────────────

  async getPortalBranding(companyId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId },
      select: { settings: true, name: true, coverImageUrl: true },
    });
    if (!property) throw AppError.notFound('Property');
    const settings = (property.settings || {}) as Record<string, any>;
    const portal = settings.portal || {};
    return {
      propertyId,
      propertyName: property.name,
      logoUrl: portal.logoUrl || null,
      primaryColor: portal.primaryColor || '#6366f1',
      accentColor: portal.accentColor || '#a78bfa',
      welcomeMessage: portal.welcomeMessage || `Welcome to ${property.name}`,
      supportEmail: portal.supportEmail || null,
      supportPhone: portal.supportPhone || null,
      showOnlinePayment: portal.showOnlinePayment !== false,
      showMaintenance: portal.showMaintenance !== false,
      showCommunity: portal.showCommunity !== false,
      showBookings: portal.showBookings !== false,
      customCss: portal.customCss || null,
    };
  }

  async updatePortalBranding(companyId: string, propertyId: string, dto: {
    logoUrl?: string; primaryColor?: string; accentColor?: string;
    welcomeMessage?: string; supportEmail?: string; supportPhone?: string;
    showOnlinePayment?: boolean; showMaintenance?: boolean;
    showCommunity?: boolean; showBookings?: boolean; customCss?: string;
  }) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId },
      select: { settings: true },
    });
    if (!property) throw AppError.notFound('Property');

    const settings = (property.settings || {}) as Record<string, any>;
    settings.portal = { ...(settings.portal || {}), ...dto };

    await prisma.property.update({
      where: { id: propertyId },
      data: { settings },
    });

    return this.getPortalBranding(companyId, propertyId);
  }

  // ── Portal Session Tracking ────────────────

  async startSession(companyId: string, userId: string, meta: { ipAddress?: string; userAgent?: string }) {
    const resident = await prisma.resident.findFirst({
      where: { companyId, userId, isActive: true },
      select: { tenantId: true, unitId: true },
    });
    return prisma.portalSession.create({
      data: {
        companyId,
        userId,
        tenantId: resident?.tenantId || null,
        unitId: resident?.unitId || null,
        ipAddress: meta.ipAddress || null,
        userAgent: meta.userAgent || null,
      },
    });
  }

  async endSession(sessionId: string) {
    return prisma.portalSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  async heartbeatSession(sessionId: string) {
    return prisma.portalSession.update({
      where: { id: sessionId },
      data: { pagesVisited: { increment: 1 } },
    });
  }

  // ── Admin Session Analytics ────────────────

  async getSessionAnalytics(companyId: string, filters: {
    startDate?: string; endDate?: string; propertyId?: string;
  }) {
    const start = filters.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = filters.endDate || new Date().toISOString().split('T')[0];

    // Daily session counts
    const dailyCounts = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(started_at) AS date, COUNT(*) AS count
      FROM portal_sessions
      WHERE company_id = ${companyId}::uuid
        AND started_at >= ${start}::date
        AND started_at <= (${end}::date + INTERVAL '1 day')
      GROUP BY DATE(started_at)
      ORDER BY date
    `;

    // Summary stats
    const summary = await prisma.$queryRaw<{
      total_sessions: bigint;
      unique_users: bigint;
      avg_duration_minutes: number;
      avg_pages: number;
    }[]>`
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(DISTINCT user_id) AS unique_users,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60)::NUMERIC, 1) AS avg_duration_minutes,
        ROUND(AVG(pages_visited)::NUMERIC, 1) AS avg_pages
      FROM portal_sessions
      WHERE company_id = ${companyId}::uuid
        AND started_at >= ${start}::date
        AND started_at <= (${end}::date + INTERVAL '1 day')
    `;

    // Top users by session count
    const topUsers = await prisma.$queryRaw<{
      user_id: string; email: string; first_name: string; last_name: string;
      session_count: bigint; total_pages: bigint;
    }[]>`
      SELECT
        ps.user_id, u.email,
        COALESCE(up.first_name, '') AS first_name,
        COALESCE(up.last_name, '') AS last_name,
        COUNT(*) AS session_count,
        SUM(ps.pages_visited) AS total_pages
      FROM portal_sessions ps
      JOIN users u ON u.id = ps.user_id
      LEFT JOIN user_profiles up ON up.user_id = ps.user_id
      WHERE ps.company_id = ${companyId}::uuid
        AND ps.started_at >= ${start}::date
        AND ps.started_at <= (${end}::date + INTERVAL '1 day')
      GROUP BY ps.user_id, u.email, up.first_name, up.last_name
      ORDER BY session_count DESC
      LIMIT 10
    `;

    // Peak hours (0-23)
    const peakHours = await prisma.$queryRaw<{ hour: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM started_at)::INT AS hour, COUNT(*) AS count
      FROM portal_sessions
      WHERE company_id = ${companyId}::uuid
        AND started_at >= ${start}::date
        AND started_at <= (${end}::date + INTERVAL '1 day')
      GROUP BY hour
      ORDER BY hour
    `;

    // Active now (sessions without ended_at in last 15 min)
    const activeNow = await prisma.portalSession.count({
      where: {
        companyId,
        endedAt: null,
        startedAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    return {
      period: { start, end },
      summary: summary[0] ? {
        totalSessions: Number(summary[0].total_sessions),
        uniqueUsers: Number(summary[0].unique_users),
        avgDurationMinutes: Number(summary[0].avg_duration_minutes) || 0,
        avgPages: Number(summary[0].avg_pages) || 0,
      } : { totalSessions: 0, uniqueUsers: 0, avgDurationMinutes: 0, avgPages: 0 },
      activeNow,
      dailyCounts: dailyCounts.map(d => ({ date: String(d.date).split('T')[0], count: Number(d.count) })),
      topUsers: topUsers.map(u => ({
        userId: u.user_id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`.trim(),
        sessionCount: Number(u.session_count),
        totalPages: Number(u.total_pages),
      })),
      peakHours: peakHours.map(h => ({ hour: h.hour, count: Number(h.count) })),
    };
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

export const portalService = new PortalService();
