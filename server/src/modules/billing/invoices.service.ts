import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { taxService } from './tax.service';
import { logger } from '../../common/logger';
import { billingNotifications } from './billingNotifications.service';
import { workflowEngine } from '../workflow/services/engine.service';
import { glService } from '../gl/gl.service';
import { webhookInvoiceIssued } from '../../common/webhookHooks';

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
        receiptAllocations: {
          include: {
            receipt: {
              select: {
                id: true, receiptNumber: true, receiptDate: true,
                paymentMethod: true, paymentReference: true,
                amount: true, currency: true, status: true,
              },
            },
          },
          orderBy: { allocatedAt: 'desc' },
        },
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

    // GL auto-posting: Dr Accounts Receivable / Cr Revenue / Cr Tax Payable
    const glLines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [
      { accountCode: '1100', debit: Number(invoice.totalAmount), credit: 0, description: `AR — ${invoiceNumber}` },
    ];
    // Credit revenue for subtotal
    glLines.push({ accountCode: '4100', debit: 0, credit: subtotal, description: `Revenue — ${invoiceNumber}` });
    // Credit tax payable if tax exists
    if (totalTax > 0) {
      glLines.push({ accountCode: '2200', debit: 0, credit: totalTax, description: `Tax Payable — ${invoiceNumber}` });
    }
    await glService.postAutoJournal({
      companyId,
      entryDate: dto.invoiceDate as string,
      entryType: 'ar_invoice',
      description: `AR Invoice ${invoiceNumber}`,
      referenceType: 'invoice',
      referenceId: invoice.id,
      propertyId: dto.propertyId as string,
      lines: glLines,
    });

    // Send notification
    const tenantName = invoice.tenant
      ? `${invoice.tenant.firstName || ''} ${invoice.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, totalAmount: invoice.totalAmount, currency: (dto.currency as string) || 'USD',
      companyId, tenantId: dto.tenantId as string,
    }, tenantName);

    webhookInvoiceIssued(invoice);
    return invoice;
  }

  // ── Auto-Generate from Billing Schedule(s) ──

  /** Single-schedule convenience wrapper around {@link generateFromSchedules}. */
  async generateFromSchedule(scheduleId: string) {
    return this.generateFromSchedules([scheduleId]);
  }

  /**
   * Generates ONE invoice covering every given schedule as its own line item.
   * Callers group schedules that share property + tenant + unit (a unit implies its
   * floor, so matching on unit already covers "same floor, same unit") before calling
   * this — see {@link runBilling}. A schedule that already has an invoice for its
   * current period is skipped; if every schedule in the batch is already invoiced,
   * no invoice is created and this returns null.
   */
  async generateFromSchedules(scheduleIds: string[]) {
    const schedules = await prisma.billingSchedule.findMany({
      where: { id: { in: scheduleIds } },
      include: { chargeType: true, lease: true, tenant: true },
    });
    if (schedules.length === 0) throw AppError.notFound('Billing schedule');

    type LineInput = {
      schedule: (typeof schedules)[number];
      periodFrom: Date; periodTo: Date; amount: number; taxRate: number; taxAmount: number; lineTotal: number;
    };
    const lineInputs: LineInput[] = [];

    for (const schedule of schedules) {
      const periodFrom = schedule.nextBillingDate!;
      const periodTo = this.computePeriodEnd(periodFrom, schedule.billingCycle);

      // Idempotency: check if this schedule already has an invoice for this period.
      // Scoped to tenant/property/unit/charge type (not just leaseId) — multiple ad-hoc
      // schedules commonly share a null leaseId and the same period, and must not be
      // mistaken for each other's invoices.
      const existing = await prisma.invoice.findFirst({
        where: {
          tenantId: schedule.tenantId,
          propertyId: schedule.propertyId,
          unitId: schedule.unitId,
          periodFrom,
          invoiceType: 'invoice',
          status: { not: 'void' },
          lines: { some: { chargeTypeId: schedule.chargeTypeId } },
        },
      });
      if (existing) {
        logger.warn(`Invoice already exists for schedule ${schedule.id} period ${periodFrom.toISOString()}, skipping`);
        continue;
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
      lineInputs.push({ schedule, periodFrom, periodTo, amount, taxRate, taxAmount, lineTotal: amount + taxAmount });
    }

    if (lineInputs.length === 0) return null;

    const first = lineInputs[0].schedule;
    const invoiceDate = lineInputs.reduce((min, l) => (l.periodFrom < min ? l.periodFrom : min), lineInputs[0].periodFrom);
    const periodFrom = invoiceDate;
    const periodTo = lineInputs.reduce((max, l) => (l.periodTo > max ? l.periodTo : max), lineInputs[0].periodTo);
    const dueDate = lineInputs.reduce((min, l) => {
      const d = new Date(l.periodFrom);
      d.setDate(d.getDate() + l.schedule.paymentDueDays);
      return d < min ? d : min;
    }, (() => {
      const d = new Date(lineInputs[0].periodFrom);
      d.setDate(d.getDate() + lineInputs[0].schedule.paymentDueDays);
      return d;
    })());
    const leaseId = lineInputs.every(l => l.schedule.leaseId === first.leaseId) ? first.leaseId : null;

    const subtotal = lineInputs.reduce((sum, l) => sum + l.amount, 0);
    const taxAmount = lineInputs.reduce((sum, l) => sum + l.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    const invoiceNumber = await this.generateInvoiceNumber(first.companyId);

    // Get grace period
    const penaltyConfig = await prisma.penaltyConfiguration.findFirst({
      where: { companyId: first.companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const invoice = await prisma.invoice.create({
      data: {
        companyId: first.companyId,
        propertyId: first.propertyId,
        unitId: first.unitId,
        tenantId: first.tenantId,
        leaseId,
        invoiceNumber,
        invoiceType: 'invoice',
        status: 'issued',
        invoiceDate,
        dueDate,
        periodFrom,
        periodTo,
        subtotal,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        currency: first.currency,
        gracePeriodDays: penaltyConfig?.gracePeriodDays || 0,
        lines: {
          create: lineInputs.map((l, idx) => ({
            chargeTypeId: l.schedule.chargeTypeId,
            description: l.schedule.description || l.schedule.chargeType.name,
            quantity: 1,
            unitPrice: l.amount,
            amount: l.amount,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
            lineTotal: l.lineTotal,
            periodFrom: l.periodFrom,
            periodTo: l.periodTo,
            sortOrder: idx,
          })),
        },
      },
    });

    // Advance each included schedule independently.
    for (const l of lineInputs) {
      const nextDate = this.computeNextBillingDate(l.periodTo, l.schedule.billingDay, l.schedule.billingCycle);
      const scheduleEndDate = l.schedule.endDate;
      const isCompleted = scheduleEndDate && nextDate > scheduleEndDate;

      await prisma.billingSchedule.update({
        where: { id: l.schedule.id },
        data: {
          nextBillingDate: isCompleted ? null : nextDate,
          lastInvoicedAt: new Date(),
          invoiceCount: { increment: 1 },
          isProrated: false,
          status: isCompleted ? 'completed' : 'active',
        },
      });
    }

    // GL auto-posting: Dr AR / Cr Revenue / Cr Tax Payable
    const glLines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [
      { accountCode: '1100', debit: totalAmount, credit: 0, description: `AR — ${invoiceNumber}` },
      { accountCode: '4100', debit: 0, credit: subtotal, description: `Revenue — ${invoiceNumber}` },
    ];
    if (taxAmount > 0) {
      glLines.push({ accountCode: '2200', debit: 0, credit: taxAmount, description: `Tax Payable — ${invoiceNumber}` });
    }
    await glService.postAutoJournal({
      companyId: first.companyId,
      entryDate: invoiceDate,
      entryType: 'ar_invoice',
      description: `AR Invoice ${invoiceNumber}`,
      referenceType: 'invoice',
      referenceId: invoice.id,
      propertyId: first.propertyId,
      lines: glLines,
    });
    // Send notification
    const tenantName = first.tenant
      ? `${first.tenant.firstName || ''} ${first.tenant.lastName || ''}`.trim()
      : '';
    billingNotifications.invoiceIssued({
      ...invoice, companyId: first.companyId, tenantId: first.tenantId,
      totalAmount: invoice.totalAmount, currency: first.currency,
    }, tenantName);

    logger.info(`Generated invoice ${invoiceNumber} for ${lineInputs.length} schedule(s) [${lineInputs.map(l => l.schedule.id).join(', ')}] (${totalAmount} ${first.currency})`);
    webhookInvoiceIssued({ ...invoice, companyId: first.companyId, tenantId: first.tenantId, currency: first.currency });
    return invoice;
  }

  /**
   * Groups due schedules by property + tenant + unit (unit implies floor) and generates
   * one consolidated invoice per group. Used by both the manual "Run Billing" endpoint
   * and the daily billing cron so their behavior stays identical.
   */
  async runBilling(dueSchedules: Array<{ id: string; propertyId: string; tenantId: string; unitId: string | null }>) {
    const groups = new Map<string, string[]>();
    for (const s of dueSchedules) {
      const key = `${s.propertyId}|${s.tenantId}|${s.unitId ?? 'none'}`;
      const ids = groups.get(key);
      if (ids) ids.push(s.id); else groups.set(key, [s.id]);
    }

    let generated = 0;
    const errors: string[] = [];

    for (const scheduleIds of groups.values()) {
      try {
        const invoice = await this.generateFromSchedules(scheduleIds);
        if (invoice) generated++;
      } catch (err: any) {
        errors.push(`Schedules ${scheduleIds.join(', ')}: ${err.message}`);
      }
    }

    return { processed: dueSchedules.length, generated, errors };
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
