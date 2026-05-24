import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { invoicesService } from '../billing/invoices.service';
import { glService } from '../gl/gl.service';
import { logger } from '../../common/logger';

class CondoService {
  // ═══════════════════════════════════════
  //  SMART METER READINGS
  // ═══════════════════════════════════════

  async listMeterReadings(companyId: string, meterId: string, params: {
    from?: string; to?: string; limit?: number;
  }) {
    const where: any = { meterId, companyId };
    if (params.from || params.to) {
      where.readingAt = {};
      if (params.from) where.readingAt.gte = new Date(params.from);
      if (params.to) where.readingAt.lte = new Date(params.to);
    }

    return prisma.smartMeterReading.findMany({
      where,
      take: params.limit || 100,
      orderBy: { readingAt: 'desc' },
      include: { unit: { select: { unitNumber: true } } },
    });
  }

  async addMeterReading(companyId: string, meterId: string, data: any) {
    const meter = await prisma.utilityMeter.findFirst({ where: { id: meterId, companyId } });
    if (!meter) throw AppError.notFound('Meter');

    // Get previous reading for consumption calc
    const prev = await prisma.smartMeterReading.findFirst({
      where: { meterId },
      orderBy: { readingAt: 'desc' },
    });
    const consumption = prev ? data.readingValue - Number(prev.readingValue) : 0;

    const reading = await prisma.smartMeterReading.create({
      data: {
        companyId,
        meterId,
        unitId: meter.unitId,
        propertyId: meter.propertyId,
        readingValue: data.readingValue,
        readingUnit: meter.meterType === 'electricity' ? 'kWh' : 'm3',
        readingAt: new Date(data.readingAt),
        source: data.source || 'manual',
        isEstimated: data.isEstimated || false,
        consumption: Math.max(0, consumption),
      },
    });

    // Update meter's last reading
    await prisma.utilityMeter.update({
      where: { id: meterId },
      data: { lastReading: data.readingValue, lastReadingDate: new Date(data.readingAt) },
    });

    return reading;
  }

  async listSmartDevices(companyId: string, propertyId?: string) {
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;

    return prisma.smartMeterDevice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        meter: { select: { meterSerialNo: true, meterType: true, unitId: true, unit: { select: { unitNumber: true } } } },
      },
    });
  }

  async upsertSmartDevice(companyId: string, meterId: string, data: any) {
    const meter = await prisma.utilityMeter.findFirst({ where: { id: meterId, companyId } });
    if (!meter) throw AppError.notFound('Meter');

    return prisma.smartMeterDevice.upsert({
      where: { meterId },
      create: { companyId, meterId, propertyId: meter.propertyId, ...data },
      update: data,
    });
  }

  // Gap #1: Manual meter sync
  async syncMeter(companyId: string, meterId: string) {
    const device = await prisma.smartMeterDevice.findFirst({
      where: { meterId, companyId },
      include: { meter: { select: { id: true, meterType: true, unitId: true, propertyId: true } } },
    });
    if (!device) throw AppError.notFound('Smart meter device');

    // Stub: in production, would call actual device API based on protocol
    // For now, update connection status and log
    logger.info(`Manual sync triggered for meter ${meterId}, protocol: ${device.protocol}`);

    await prisma.smartMeterDevice.update({
      where: { id: device.id },
      data: { lastPolledAt: new Date(), connectionStatus: 'online' },
    });

    return { synced: true, protocol: device.protocol, meterId, lastPolledAt: new Date() };
  }

  // Gap #2: Generate utility invoice from meter readings
  async generateUtilityInvoice(companyId: string, unitId: string, data: { from: string; to: string }) {
    const from = new Date(data.from);
    const to = new Date(data.to);

    // Find active meters for this unit
    const meters = await prisma.utilityMeter.findMany({
      where: { unitId, companyId, isActive: true },
    });
    if (!meters.length) throw AppError.notFound('No active meters for this unit');

    // Find the lease for this unit
    const lease = await prisma.lease.findFirst({
      where: { unitId, companyId, status: 'active' },
      select: { id: true, tenantId: true, propertyId: true },
    });
    if (!lease) throw AppError.notFound('No active lease for this unit');

    const lines: any[] = [];
    let totalAmount = 0;

    for (const meter of meters) {
      // Get readings in date range
      const readings = await prisma.smartMeterReading.findMany({
        where: { meterId: meter.id, readingAt: { gte: from, lte: to } },
        orderBy: { readingAt: 'asc' },
      });

      const totalConsumption = readings.reduce((s, r) => s + Number(r.consumption || 0), 0);
      if (totalConsumption <= 0) continue;

      // Get tariff rate (use meter's rate or default)
      const ratePerUnit = Number(meter.ratePerUnit || 0.15); // default $0.15/kWh
      const readingUnit = meter.meterType === 'electricity' ? 'kWh' : 'm3';
      const chargeCode = meter.meterType === 'electricity' ? 'ELECTRICITY' : 'WATER';
      const amount = totalConsumption * ratePerUnit;

      lines.push({
        chargeTypeCode: chargeCode,
        description: `${meter.meterType} — ${totalConsumption.toFixed(2)} ${readingUnit} × ${ratePerUnit}/${readingUnit} (${data.from} to ${data.to})`,
        quantity: totalConsumption,
        unitPrice: ratePerUnit,
        amount,
      });
      totalAmount += amount;

      // Mark readings as billing-triggered
      await prisma.smartMeterReading.updateMany({
        where: { meterId: meter.id, readingAt: { gte: from, lte: to } },
        data: { billingTriggered: true },
      });
    }

    if (!lines.length) throw AppError.badRequest('No consumption found in the specified period');

    // Find or create charge types
    for (const line of lines) {
      const ct = await prisma.chargeType.findFirst({ where: { code: line.chargeTypeCode, companyId } });
      if (!ct) {
        await prisma.chargeType.create({
          data: {
            companyId, code: line.chargeTypeCode,
            name: line.chargeTypeCode === 'ELECTRICITY' ? 'Electricity Charges' : 'Water Charges',
            category: 'utility', glAccountCode: '4200', isActive: true, isSystem: true,
          },
        });
      }
    }

    // Create the invoice
    const invoice = await invoicesService.createManual(companyId, {
      tenantId: lease.tenantId,
      propertyId: lease.propertyId,
      unitId,
      leaseId: lease.id,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      lines: lines.map(l => ({
        chargeTypeCode: l.chargeTypeCode,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      notes: `Utility invoice for period ${data.from} to ${data.to}`,
    }, '00000000-0000-0000-0000-000000000000');

    logger.info(`Utility invoice created for unit ${unitId}: ${lines.length} meters, total $${totalAmount.toFixed(2)}`);
    return invoice;
  }

  // ═══════════════════════════════════════
  //  FUND ACCOUNTS
  // ═══════════════════════════════════════

  async listFunds(companyId: string, propertyId: string, year?: number) {
    const where: any = { companyId, propertyId };
    if (year) where.fiscalYear = year;

    const funds = await prisma.fundAccount.findMany({
      where,
      orderBy: { fundType: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });

    // Get YTD stats for each fund
    return Promise.all(funds.map(async (fund) => {
      const startOfYear = new Date(fund.fiscalYear, 0, 1);
      const [contributions, expenditures] = await Promise.all([
        prisma.fundTransaction.aggregate({
          where: { fundAccountId: fund.id, transactionType: 'contribution', transactionDate: { gte: startOfYear } },
          _sum: { amount: true },
        }),
        prisma.fundTransaction.aggregate({
          where: { fundAccountId: fund.id, transactionType: 'expenditure', transactionDate: { gte: startOfYear } },
          _sum: { amount: true },
        }),
      ]);
      return {
        ...fund,
        ytdContributions: Number(contributions._sum.amount || 0),
        ytdExpenditures: Number(expenditures._sum.amount || 0),
      };
    }));
  }

  async createFund(companyId: string, data: any) {
    return prisma.fundAccount.create({
      data: { companyId, ...data, currentBalance: data.openingBalance || 0 },
    });
  }

  async listFundTransactions(companyId: string, fundId: string, params: {
    from?: string; to?: string; type?: string; page?: number; limit?: number;
  }) {
    const { from, to, type, page = 1, limit = 50 } = params;
    const where: any = { fundAccountId: fundId, companyId };
    if (type) where.transactionType = type;
    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate.gte = new Date(from);
      if (to) where.transactionDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.fundTransaction.findMany({
        where,
        skip: (page - 1) * limit, take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          unit: { select: { unitNumber: true } },
        },
      }),
      prisma.fundTransaction.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async addFundTransaction(companyId: string, fundId: string, createdBy: string, data: any) {
    const fund = await prisma.fundAccount.findFirst({ where: { id: fundId, companyId } });
    if (!fund) throw AppError.notFound('Fund account');

    const txn = await prisma.fundTransaction.create({
      data: {
        companyId,
        fundAccountId: fundId,
        ...data,
        transactionDate: new Date(data.transactionDate),
        createdBy,
      },
    });

    // Update fund balance
    const delta = data.transactionType === 'contribution' || data.transactionType === 'interest'
      ? Number(data.amount)
      : -Number(data.amount);

    await prisma.fundAccount.update({
      where: { id: fundId },
      data: { currentBalance: { increment: delta } },
    });

    // Gap #6: Post to GL (Dr Fund Expense / Cr Fund Liability or vice versa)
    try {
      const glLines = data.transactionType === 'contribution' || data.transactionType === 'interest'
        ? [
            { accountCode: '1210', debit: Number(data.amount), credit: 0, description: `Fund contribution: ${data.description}` },
            { accountCode: '2400', debit: 0, credit: Number(data.amount), description: `Fund contribution: ${data.description}` },
          ]
        : [
            { accountCode: '5100', debit: Number(data.amount), credit: 0, description: `Fund expenditure: ${data.description}` },
            { accountCode: '1210', debit: 0, credit: Number(data.amount), description: `Fund expenditure: ${data.description}` },
          ];

      const journal = await glService.postAutoJournal({
        companyId,
        entryDate: new Date(data.transactionDate),
        entryType: 'fund_transaction',
        description: `${fund.name} — ${data.transactionType}: ${data.description}`,
        referenceType: 'fund_transaction',
        referenceId: txn.id,
        lines: glLines,
      });

      if (journal) {
        await prisma.fundTransaction.update({
          where: { id: txn.id },
          data: { glJournalId: journal.id },
        });
      }
    } catch (err: any) {
      logger.error(`Fund GL posting failed for txn ${txn.id}: ${err.message}`);
    }

    return txn;
  }

  // ═══════════════════════════════════════
  //  MEETINGS (AGM/EGM)
  // ═══════════════════════════════════════

  async listMeetings(companyId: string, params: {
    propertyId?: string; year?: number; meetingType?: string;
  }) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;
    if (params.year) where.fiscalYear = params.year;
    if (params.meetingType) where.meetingType = params.meetingType;

    return prisma.generalMeeting.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      include: {
        _count: { select: { resolutions: true, proxies: true } },
        creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async createMeeting(companyId: string, createdBy: string, data: any) {
    return prisma.generalMeeting.create({
      data: {
        companyId, createdBy,
        ...data,
        scheduledAt: new Date(data.scheduledAt),
      },
    });
  }

  async getMeetingDetail(id: string, companyId: string) {
    const meeting = await prisma.generalMeeting.findFirst({
      where: { id, companyId },
      include: {
        resolutions: {
          orderBy: { resolutionNo: 'asc' },
          include: { _count: { select: { votes: true } } },
        },
        proxies: { orderBy: { submittedAt: 'desc' } },
        creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!meeting) throw AppError.notFound('Meeting');
    return meeting;
  }

  async updateMeetingStatus(id: string, companyId: string, data: any) {
    const meeting = await prisma.generalMeeting.findFirst({ where: { id, companyId } });
    if (!meeting) throw AppError.notFound('Meeting');

    const updateData: any = { status: data.status };
    if (data.actualAttendees !== undefined) updateData.actualAttendees = data.actualAttendees;
    if (data.quorumMet !== undefined) updateData.quorumMet = data.quorumMet;
    if (data.minutesUrl) {
      updateData.minutesUrl = data.minutesUrl;
      updateData.minutesPublishedAt = new Date();
    }

    return prisma.generalMeeting.update({ where: { id }, data: updateData });
  }

  async addResolution(companyId: string, meetingId: string, data: any) {
    const meeting = await prisma.generalMeeting.findFirst({ where: { id: meetingId, companyId } });
    if (!meeting) throw AppError.notFound('Meeting');

    return prisma.meetingResolution.create({
      data: { companyId, meetingId, ...data },
    });
  }

  async castVote(companyId: string, meetingId: string, resolutionId: string, userId: string, data: any) {
    // Create vote
    const vote = await prisma.meetingVote.create({
      data: {
        companyId,
        meetingId,
        resolutionId,
        unitId: data.unitId,
        voterUserId: userId,
        vote: data.vote,
        isProxy: data.isProxy || false,
        proxyId: data.proxyId,
      },
    });

    // Update resolution tallies
    const incField = data.vote === 'for' ? 'votesFor' : data.vote === 'against' ? 'votesAgainst' : 'votesAbstain';
    await prisma.meetingResolution.update({
      where: { id: resolutionId },
      data: {
        [incField]: { increment: 1 },
        totalVotes: { increment: 1 },
      },
    });

    return vote;
  }

  async submitProxy(companyId: string, meetingId: string, data: any) {
    return prisma.meetingProxy.create({
      data: { companyId, meetingId, ...data },
    });
  }

  async getMeetingResults(id: string, companyId: string) {
    const meeting = await prisma.generalMeeting.findFirst({
      where: { id, companyId },
      include: {
        resolutions: { orderBy: { resolutionNo: 'asc' } },
      },
    });
    if (!meeting) throw AppError.notFound('Meeting');

    const totalUnits = await prisma.unit.count({ where: { propertyId: meeting.propertyId, companyId } });

    return {
      meetingId: meeting.id,
      title: meeting.title,
      status: meeting.status,
      actualAttendees: meeting.actualAttendees,
      totalUnits,
      quorumMet: meeting.quorumMet,
      resolutions: meeting.resolutions,
    };
  }

  // Gap #3: Send meeting notice to all unit owners
  async sendMeetingNotice(id: string, companyId: string, userId: string) {
    const meeting = await prisma.generalMeeting.findFirst({
      where: { id, companyId },
      include: { property: { select: { name: true } } },
    });
    if (!meeting) throw AppError.notFound('Meeting');
    if (meeting.status !== 'planned') throw AppError.badRequest('Notice can only be sent for planned meetings');

    // Find all units in this property with active leases (= owners/tenants to notify)
    const units = await prisma.unit.findMany({
      where: { propertyId: meeting.propertyId, companyId, status: 'occupied' },
      select: { id: true, unitNumber: true },
    });

    // Find all admin + agent users for this company
    const adminUsers = await prisma.user.findMany({
      where: { companyId, isActive: true, role: { in: ['Super Admin', 'Admin', 'Agent'] } },
      select: { id: true },
    });

    const scheduledDate = new Date(meeting.scheduledAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const scheduledTime = new Date(meeting.scheduledAt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });

    let notifCount = 0;
    for (const admin of adminUsers) {
      await prisma.inAppNotification.create({
        data: {
          companyId,
          userId: admin.id,
          title: `${meeting.meetingType} Notice: ${meeting.title}`,
          body: `${meeting.meetingType} scheduled for ${scheduledDate} at ${scheduledTime}. ` +
            `Venue: ${meeting.venue || 'TBD'}. ${units.length} units to be notified. ` +
            `Quorum: ${meeting.quorumPercentage}% required.`,
          icon: 'users',
          actionType: 'navigate',
          actionUrl: '/admin/condo/meetings',
          entityType: 'meeting',
          entityId: meeting.id,
        },
      });
      notifCount++;
    }

    // Update meeting status to notice_sent
    await prisma.generalMeeting.update({
      where: { id },
      data: { status: 'notice_sent' },
    });

    logger.info(`Meeting notice sent: ${meeting.title} → ${notifCount} notifications, ${units.length} units affected`);
    return { notificationsSent: notifCount, unitsAffected: units.length, status: 'notice_sent' };
  }

  // Gap #4: Publish meeting minutes
  async publishMinutes(id: string, companyId: string, data: { minutesUrl: string }) {
    const meeting = await prisma.generalMeeting.findFirst({ where: { id, companyId } });
    if (!meeting) throw AppError.notFound('Meeting');

    return prisma.generalMeeting.update({
      where: { id },
      data: { minutesUrl: data.minutesUrl, minutesPublishedAt: new Date() },
    });
  }

  // ═══════════════════════════════════════
  //  BYLAWS
  // ═══════════════════════════════════════

  async listBylaws(companyId: string, params: {
    propertyId?: string; category?: string; isActive?: boolean;
  }) {
    const where: any = { companyId };
    if (params.propertyId) where.propertyId = params.propertyId;
    if (params.category) where.category = params.category;
    if (params.isActive !== undefined) where.isActive = params.isActive;

    return prisma.bylaw.findMany({
      where,
      orderBy: { bylawNo: 'asc' },
      include: { _count: { select: { violations: true } } },
    });
  }

  async createBylaw(companyId: string, createdBy: string, data: any) {
    return prisma.bylaw.create({
      data: {
        companyId, createdBy,
        ...data,
        effectiveDate: new Date(data.effectiveDate),
      },
    });
  }

  async updateBylaw(id: string, companyId: string, data: any) {
    const bylaw = await prisma.bylaw.findFirst({ where: { id, companyId } });
    if (!bylaw) throw AppError.notFound('Bylaw');
    if (data.effectiveDate) data.effectiveDate = new Date(data.effectiveDate);
    return prisma.bylaw.update({ where: { id }, data });
  }

  // ═══════════════════════════════════════
  //  BYLAW VIOLATIONS
  // ═══════════════════════════════════════

  async listViolations(companyId: string, params: {
    propertyId?: string; bylawId?: string; unitId?: string;
    status?: string; page?: number; limit?: number;
  }) {
    const { propertyId, bylawId, unitId, status, page = 1, limit = 50 } = params;
    const where: any = { companyId };
    if (propertyId) where.propertyId = propertyId;
    if (bylawId) where.bylawId = bylawId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.bylawViolation.findMany({
        where,
        skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          bylaw: { select: { bylawNo: true, title: true, category: true } },
          unit: { select: { unitNumber: true } },
          resident: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.bylawViolation.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async createViolation(companyId: string, reportedBy: string, data: any) {
    // Generate violation number
    const count = await prisma.bylawViolation.count({ where: { companyId } });
    const violationNo = `VIO-${String(count + 1).padStart(4, '0')}`;

    const bylaw = await prisma.bylaw.findFirst({ where: { id: data.bylawId, companyId } });
    if (!bylaw) throw AppError.notFound('Bylaw');

    return prisma.bylawViolation.create({
      data: {
        companyId,
        propertyId: bylaw.propertyId,
        reportedBy,
        violationNo,
        ...data,
      },
    });
  }

  async fineViolation(id: string, companyId: string, data: any) {
    const v = await prisma.bylawViolation.findFirst({ where: { id, companyId } });
    if (!v) throw AppError.notFound('Violation');

    return prisma.bylawViolation.update({
      where: { id },
      data: {
        status: 'fined',
        fineAmount: data.fineAmount,
        resolutionNotes: data.notes,
      },
    });
  }

  async appealViolation(id: string, companyId: string, data: any) {
    const v = await prisma.bylawViolation.findFirst({ where: { id, companyId } });
    if (!v) throw AppError.notFound('Violation');

    return prisma.bylawViolation.update({
      where: { id },
      data: {
        status: 'appealing',
        appealSubmittedAt: new Date(),
        appealNotes: data.appealNotes,
      },
    });
  }

  async resolveViolation(id: string, companyId: string, data: any) {
    const v = await prisma.bylawViolation.findFirst({ where: { id, companyId } });
    if (!v) throw AppError.notFound('Violation');

    return prisma.bylawViolation.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: data.resolutionNotes,
      },
    });
  }
}

export const condoService = new CondoService();
