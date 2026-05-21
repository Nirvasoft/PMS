import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { taxService } from './tax.service';
import { logger } from '../../common/logger';
import { billingNotifications } from './billingNotifications.service';
import { workflowEngine } from '../workflow/services/engine.service';

/** Adds computed `outstandingAmount` to an invoice object */
function withOutstanding<T extends { totalAmount: any; paidAmount: any }>(inv: T): T & { outstandingAmount: number } {
  return { ...inv, outstandingAmount: Number(inv.totalAmount) - Number(inv.paidAmount) };
}

export class InvoicesService {
  // ── Query ───────────────────────────────────

  async findAll(companyId: string, filters: {
    tenantId?: string; leaseId?: string; propertyId?: string; status?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const { tenantId, leaseId, propertyId, status, from, to, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (tenantId) where.tenantId = tenantId;
    if (leaseId) where.leaseId = leaseId;
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) where.invoiceDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          unit: { select: { id: true, unitNumber: true } },
          property: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data: data.map(withOutstanding), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        lines: {
          include: { chargeType: { select: { id: true, code: true, name: true, category: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true, email: true } },
        unit: { select: { id: true, unitNumber: true } },
        property: { select: { id: true, name: true } },
        creditNotes: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    return withOutstanding(invoice);
  }

  // ── Invoice Number ──────────────────────────

  async generateInvoiceNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const lastInvoice = await prisma.invoice.findFirst({
      where: { companyId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (lastInvoice) {
      const lastSeq = parseInt(lastInvoice.invoiceNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── Manual Invoice Creation ─────────────────

  async createManual(companyId: string, dto: Record<string, unknown>, userId: string) {
    const invoiceNumber = await this.generateInvoiceNumber(companyId);
    const lines = dto.lines as Array<{
      chargeTypeId: string; description: string; quantity?: number; unitPrice: number; taxRate?: number; discountPct?: number;
    }>;

    let subtotal = 0;
    let totalTax = 0;
    const lineData = lines.map((line, idx) => {
      const qty = line.quantity || 1;
      const discountMultiplier = 1 - ((line.discountPct || 0) / 100);
      const amount = Math.round(qty * line.unitPrice * discountMultiplier * 100) / 100;
      const taxRate = line.taxRate || 0;
      const taxAmount = Math.round(amount * taxRate * 100) / 100;
      const lineTotal = amount + taxAmount;
      subtotal += amount;
      totalTax += taxAmount;

      return {
        chargeTypeId: line.chargeTypeId,
        description: line.description,
        quantity: qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct || 0,
        amount,
        taxRate,
        taxAmount,
        lineTotal,
        sortOrder: idx,
      };
    });

    const totalAmount = subtotal + totalTax;

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        propertyId: dto.propertyId as string,
        unitId: (dto.unitId as string) || null,
        tenantId: dto.tenantId as string,
        leaseId: (dto.leaseId as string) || null,
        invoiceNumber,
        invoiceType: 'invoice',
        status: 'issued',
        invoiceDate: new Date(dto.invoiceDate as string),
        dueDate: new Date(dto.dueDate as string),
        periodFrom: dto.periodFrom ? new Date(dto.periodFrom as string) : null,
        periodTo: dto.periodTo ? new Date(dto.periodTo as string) : null,
        subtotal,
        taxAmount: totalTax,
        totalAmount,
        paidAmount: 0,
        currency: (dto.currency as string) || 'USD',
        notes: (dto.notes as string) || null,
        createdBy: userId,
        lines: { create: lineData },
      },
      include: {
        lines: { include: { chargeType: { select: { code: true, name: true } } } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // TODO: GL posting hook — Dr Accounts Receivable / Cr Revenue accounts

    // Send notification
    const tenantName = invoice.tenant
      ? `${invoice.tenant.firstName || ''} ${invoice.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, totalAmount: invoice.totalAmount, currency: (dto.currency as string) || 'USD',
      companyId, tenantId: dto.tenantId as string,
    }, tenantName);

    return invoice;
  }

  // ── Auto-Generate from Billing Schedule ─────

  async generateFromSchedule(scheduleId: string) {
    const schedule = await prisma.billingSchedule.findUnique({
      where: { id: scheduleId },
      include: { chargeType: true, lease: true },
    });
    if (!schedule) throw AppError.notFound('Billing schedule');

    const periodFrom = schedule.nextBillingDate!;
    const periodTo = this.computePeriodEnd(periodFrom, schedule.billingCycle);

    // Idempotency: check if invoice already exists for this period
    const existing = await prisma.invoice.findFirst({
      where: {
        leaseId: schedule.leaseId,
        periodFrom,
        invoiceType: 'invoice',
        status: { not: 'void' },
      },
    });
    if (existing) {
      logger.warn(`Invoice already exists for schedule ${scheduleId} period ${periodFrom.toISOString()}, skipping`);
      return existing;
    }

    let amount = Number(schedule.amount);

    // Prorate first invoice if needed
    if (schedule.isProrated && schedule.invoiceCount === 0 && schedule.prorateStart) {
      amount = this.calculateProratedAmount(amount, schedule.prorateStart, periodTo, schedule.billingCycle);
    }

    // Tax calculation
    const taxRate = await taxService.getApplicableRate(
      schedule.companyId, schedule.chargeType.code, periodFrom,
    );
    const taxAmount = Math.round(amount * taxRate * 100) / 100;
    const totalAmount = amount + taxAmount;

    const invoiceNumber = await this.generateInvoiceNumber(schedule.companyId);
    const dueDate = new Date(periodFrom);
    dueDate.setDate(dueDate.getDate() + schedule.paymentDueDays);

    // Get grace period
    const penaltyConfig = await prisma.penaltyConfiguration.findFirst({
      where: { companyId: schedule.companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const invoice = await prisma.invoice.create({
      data: {
        companyId: schedule.companyId,
        propertyId: schedule.propertyId,
        unitId: schedule.unitId,
        tenantId: schedule.tenantId,
        leaseId: schedule.leaseId,
        invoiceNumber,
        invoiceType: 'invoice',
        status: 'issued',
        invoiceDate: periodFrom,
        dueDate,
        periodFrom,
        periodTo,
        subtotal: amount,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        currency: schedule.currency,
        gracePeriodDays: penaltyConfig?.gracePeriodDays || 0,
        lines: {
          create: [{
            chargeTypeId: schedule.chargeTypeId,
            description: schedule.description || schedule.chargeType.name,
            quantity: 1,
            unitPrice: amount,
            amount,
            taxRate,
            taxAmount,
            lineTotal: totalAmount,
            periodFrom,
            periodTo,
            sortOrder: 0,
          }],
        },
      },
    });

    // Advance schedule
    const nextDate = this.computeNextBillingDate(periodTo, schedule.billingDay, schedule.billingCycle);
    const scheduleEndDate = schedule.endDate;
    const isCompleted = scheduleEndDate && nextDate > scheduleEndDate;

    await prisma.billingSchedule.update({
      where: { id: scheduleId },
      data: {
        nextBillingDate: isCompleted ? null : nextDate,
        lastInvoicedAt: new Date(),
        invoiceCount: { increment: 1 },
        isProrated: false,
        status: isCompleted ? 'completed' : 'active',
      },
    });

    // TODO: GL posting hook
    // Send notification
    const tenantName = schedule.tenant
      ? `${schedule.tenant.firstName || ''} ${schedule.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, companyId: schedule.companyId, tenantId: schedule.tenantId,
      totalAmount: invoice.totalAmount, currency: schedule.currency,
    }, tenantName);

    logger.info(`Generated invoice ${invoiceNumber} for schedule ${scheduleId} (${amount} ${schedule.currency})`);
    return invoice;
  }

  // ── Void ────────────────────────────────────

  async void(id: string, companyId: string, reason: string, userId: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
    if (!invoice) throw AppError.notFound('Invoice');
    if (!['draft', 'issued', 'sent'].includes(invoice.status)) {
      throw AppError.validation('Can only void draft, issued, or sent invoices. Use credit note for paid invoices.');
    }

    return prisma.invoice.update({
      where: { id },
      data: {
        status: 'void',
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason,
      },
    });
    // TODO: Reverse GL postings
  }

  // ── Credit Note ─────────────────────────────

  async createCreditNote(originalId: string, companyId: string, dto: Record<string, unknown>, userId: string) {
    const original = await prisma.invoice.findFirst({ where: { id: originalId, companyId } });
    if (!original) throw AppError.notFound('Original invoice');

    const lines = dto.lines as Array<{
      chargeTypeId: string; description: string; quantity?: number; unitPrice: number; taxRate?: number;
    }>;

    let subtotal = 0;
    let totalTax = 0;
    const lineData = lines.map((line, idx) => {
      const qty = line.quantity || 1;
      const amount = Math.round(qty * line.unitPrice * 100) / 100;
      const taxRate = line.taxRate || 0;
      const taxAmount = Math.round(amount * taxRate * 100) / 100;
      subtotal += amount;
      totalTax += taxAmount;

      return {
        chargeTypeId: line.chargeTypeId,
        description: line.description,
        quantity: qty,
        unitPrice: line.unitPrice,
        amount,
        taxRate,
        taxAmount,
        lineTotal: amount + taxAmount,
        sortOrder: idx,
      };
    });

    const totalAmount = subtotal + totalTax;

    // Credit note total must not exceed original invoice total
    if (totalAmount > Number(original.totalAmount)) {
      throw AppError.validation('Credit note amount cannot exceed original invoice total');
    }

    // Check if credit note requires workflow approval (threshold check)
    const workflowDef = await prisma.workflowDefinition.findFirst({
      where: { companyId, entityType: 'credit_note', status: 'active' },
    });

    // Determine if amount exceeds threshold (default: always approve if workflow exists)
    const needsApproval = workflowDef != null;
    const creditNoteStatus = needsApproval ? 'draft' : 'issued';

    const invoiceNumber = await this.generateInvoiceNumber(companyId);

    const creditNote = await prisma.invoice.create({
      data: {
        companyId,
        propertyId: original.propertyId,
        unitId: original.unitId,
        tenantId: original.tenantId,
        leaseId: original.leaseId,
        invoiceNumber,
        invoiceType: 'credit_note',
        status: creditNoteStatus,
        invoiceDate: new Date(),
        dueDate: new Date(),
        subtotal,
        taxAmount: totalTax,
        totalAmount,
        paidAmount: 0,
        currency: original.currency,
        originalInvoiceId: originalId,
        creditReason: dto.creditReason as string,
        createdBy: userId,
        lines: { create: lineData },
      },
    });

    // Start workflow if approval is needed
    if (needsApproval && workflowDef) {
      try {
        const instance = await workflowEngine.startInstance(
          workflowDef.id,
          'credit_note',
          creditNote.id,
          {
            creditNoteId: creditNote.id,
            invoiceNumber: creditNote.invoiceNumber,
            originalInvoiceId: originalId,
            amount: totalAmount,
            creditReason: dto.creditReason,
          },
          userId,
        );
        if (instance) {
          await prisma.invoice.update({
            where: { id: creditNote.id },
            data: { workflowInstanceId: instance.id },
          });
        }
      } catch (err: any) {
        logger.error(`Failed to start credit note workflow: ${err.message}`);
      }
    }

    // Only apply credit immediately if no approval workflow
    if (!needsApproval) {
      // Apply credit to original invoice's paid amount
      await prisma.invoice.update({
        where: { id: originalId },
        data: { paidAmount: { increment: totalAmount } },
      });

      // Check if original is now fully paid
      const updated = await prisma.invoice.findUnique({ where: { id: originalId } });
      if (updated && Number(updated.paidAmount) >= Number(updated.totalAmount)) {
        await prisma.invoice.update({ where: { id: originalId }, data: { status: 'paid' } });
      }
    }

    // TODO: GL posting hook

    // Send credit note notification
    const tenantObj = await prisma.tenant.findUnique({ where: { id: original.tenantId }, select: { firstName: true, lastName: true, companyName: true, tenantType: true } });
    const tenantName = tenantObj?.tenantType === 'company'
      ? tenantObj.companyName || ''
      : `${tenantObj?.firstName || ''} ${tenantObj?.lastName || ''}`.trim();
    billingNotifications.creditNoteIssued({
      ...creditNote, companyId, tenantId: original.tenantId, currency: original.currency,
    }, original.invoiceNumber || '', tenantName);

    return creditNote;
  }

  // ── Overdue Transition ──────────────────────

  async transitionOverdue() {
    const today = new Date();
    const result = await prisma.$executeRaw`
      UPDATE invoices
      SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('issued', 'sent')
        AND invoice_type = 'invoice'
        AND (due_date + grace_period_days * INTERVAL '1 day') < ${today}
    `;
    if (result > 0) {
      logger.info(`Transitioned ${result} invoices to overdue`);
    }
    return result;
  }

  // ── Helpers ─────────────────────────────────

  private calculateProratedAmount(monthlyAmount: number, prorateFrom: Date, periodEnd: Date, billingCycle: string): number {
    if (billingCycle !== 'monthly') return monthlyAmount;
    const daysInMonth = new Date(prorateFrom.getFullYear(), prorateFrom.getMonth() + 1, 0).getDate();
    const daysInPeriod = Math.ceil((periodEnd.getTime() - prorateFrom.getTime()) / 86400000) + 1;
    return Math.round((monthlyAmount / daysInMonth) * daysInPeriod * 100) / 100;
  }

  private computePeriodEnd(periodFrom: Date, billingCycle: string): Date {
    const d = new Date(periodFrom);
    switch (billingCycle) {
      case 'monthly':     d.setMonth(d.getMonth() + 1); break;
      case 'quarterly':   d.setMonth(d.getMonth() + 3); break;
      case 'semi_annual': d.setMonth(d.getMonth() + 6); break;
      case 'annual':      d.setMonth(d.getMonth() + 12); break;
    }
    d.setDate(d.getDate() - 1); // End of period = day before next start
    return d;
  }

  private computeNextBillingDate(periodEnd: Date, billingDay: number, billingCycle: string): Date {
    const next = new Date(periodEnd);
    next.setDate(next.getDate() + 1); // Day after period end
    // Clamp billing day to max days in the month
    const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(billingDay, maxDay));
    return next;
  }
}

export const invoicesService = new InvoicesService();
