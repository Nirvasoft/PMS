import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

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

    const [invoiceSummary, openTickets, recentAnnouncements] = await Promise.all([
      this.getInvoiceSummary(companyId, resident.tenantId),
      this.getOpenTickets(companyId, resident.unitId),
      this.getRecentAnnouncements(companyId, resident.propertyId),
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
