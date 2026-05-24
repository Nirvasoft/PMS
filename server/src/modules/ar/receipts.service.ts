import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { glService } from '../gl/gl.service';
import { webhookPaymentReceived, webhookRefundProcessed } from '../../common/webhookHooks';

export class ReceiptsService {
  // ── Receipt Number ──────────────────────────

  async generateReceiptNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RCT-${year}-`;

    const last = await prisma.receipt.findFirst({
      where: { companyId, receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.receiptNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── Create Receipt ──────────────────────────

  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    let allocations = (dto.allocations || []) as Array<{ invoiceId: string; amount: number }>;
    const amount = dto.amount as number;

    // Auto-allocate if no manual allocations provided
    if (allocations.length === 0) {
      const outstanding = await prisma.invoice.findMany({
        where: {
          companyId,
          tenantId: dto.tenantId as string,
          invoiceType: 'invoice',
          status: { in: ['issued', 'sent', 'partially_paid', 'overdue'] },
        },
        select: { id: true, totalAmount: true, paidAmount: true },
        orderBy: { dueDate: 'asc' },
      });

      let remaining = amount;
      const autoAllocs: Array<{ invoiceId: string; amount: number }> = [];
      for (const inv of outstanding) {
        if (remaining <= 0.01) break;
        const owed = Number(inv.totalAmount) - Number(inv.paidAmount);
        if (owed <= 0) continue;
        const allocAmt = Math.min(remaining, owed);
        autoAllocs.push({ invoiceId: inv.id, amount: Math.round(allocAmt * 100) / 100 });
        remaining -= allocAmt;
      }
      allocations = autoAllocs;
    }

    // Validate allocations don't exceed receipt amount
    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    if (totalAllocated > amount + 0.01) {
      throw AppError.validation('Total allocations exceed receipt amount');
    }

    const receiptNumber = await this.generateReceiptNumber(companyId);

    // Create receipt in transaction
    const receipt = await prisma.$transaction(async (tx) => {
      const rct = await tx.receipt.create({
        data: {
          companyId,
          tenantId: dto.tenantId as string,
          propertyId: (dto.propertyId as string) || null,
          receiptNumber,
          receiptDate: dto.receiptDate ? new Date(dto.receiptDate as string) : new Date(),
          paymentMethod: dto.paymentMethod as string,
          paymentReference: (dto.paymentReference as string) || null,
          bankAccountId: (dto.bankAccountId as string) || null,
          amount,
          currency: (dto.currency as string) || 'USD',
          exchangeRate: (dto.exchangeRate as number) || 1,
          baseCurrencyAmount: amount * ((dto.exchangeRate as number) || 1),
          status: 'confirmed',
          notes: (dto.notes as string) || null,
          createdBy: userId,
        },
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          property: { select: { id: true, name: true } },
        },
      });

      // Apply allocations
      for (const alloc of allocations) {
        await tx.receiptAllocation.create({
          data: { receiptId: rct.id, invoiceId: alloc.invoiceId, amount: alloc.amount },
        });

        // Update invoice paidAmount and status
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
        const newPaidAmount = Number(invoice.paidAmount) + alloc.amount;
        const newStatus = newPaidAmount >= Number(invoice.totalAmount) ? 'paid'
          : newPaidAmount > 0 ? 'partially_paid'
          : invoice.status;

        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: { paidAmount: newPaidAmount, status: newStatus },
        });
      }

      // Handle overpayment → create tenant credit
      const overpayment = amount - totalAllocated;
      if (overpayment > 0.01) {
        await tx.tenantCredit.create({
          data: {
            companyId,
            tenantId: dto.tenantId as string,
            amount: overpayment,
            currency: (dto.currency as string) || 'USD',
            sourceType: 'overpayment',
            sourceId: rct.id,
            description: `Overpayment from receipt ${receiptNumber}`,
          },
        });
      }

      return rct;
    });

    logger.info(`Created receipt ${receiptNumber} for amount ${amount}`);

    // GL auto-posting: Dr Bank / Cr Accounts Receivable
    try {
      await glService.postAutoJournal({
        companyId,
        entryDate: dto.receiptDate as string || new Date().toISOString().split('T')[0],
        entryType: 'ar_receipt',
        description: `AR Receipt ${receiptNumber}`,
        referenceType: 'receipt',
        referenceId: receipt.id,
        propertyId: (dto.propertyId as string) || undefined,
        lines: [
          { accountCode: '1210', debit: amount, credit: 0, description: `Bank deposit — ${receiptNumber}` },
          { accountCode: '1100', debit: 0, credit: amount, description: `AR cleared — ${receiptNumber}` },
        ],
      });
    } catch (err: any) {
      logger.warn(`GL auto-post for receipt ${receiptNumber} failed: ${err.message}`);
    }

    webhookPaymentReceived(receipt);
    return receipt;
  }

  // ── Query ───────────────────────────────────

  async findAll(companyId: string, filters: {
    tenantId?: string; propertyId?: string; status?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const { tenantId, propertyId, status, from, to, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (tenantId) where.tenantId = tenantId;
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (from || to) {
      where.receiptDate = {};
      if (from) where.receiptDate.gte = new Date(from);
      if (to) where.receiptDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          property: { select: { id: true, name: true } },
          _count: { select: { allocations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.receipt.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, companyId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { id, companyId },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        property: { select: { id: true, name: true } },
        allocations: {
          include: {
            invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, status: true } },
          },
        },
      },
    });
    if (!receipt) throw AppError.notFound('Receipt');
    return receipt;
  }

  // ── Reverse Receipt ─────────────────────────

  async reverse(id: string, companyId: string, reason: string, userId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { id, companyId },
      include: { allocations: true },
    });
    if (!receipt) throw AppError.notFound('Receipt');
    if (receipt.status !== 'confirmed') {
      throw AppError.validation('Only confirmed receipts can be reversed');
    }

    await prisma.$transaction(async (tx) => {
      // Undo allocations — reduce invoice paidAmount
      for (const alloc of receipt.allocations) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
        const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - Number(alloc.amount));
        const newStatus = newPaidAmount <= 0 ? 'issued'
          : newPaidAmount < Number(invoice.totalAmount) ? 'partially_paid'
          : 'paid';

        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: { paidAmount: newPaidAmount, status: newStatus },
        });
      }

      // Delete allocations
      await tx.receiptAllocation.deleteMany({ where: { receiptId: id } });

      // Mark receipt as reversed
      await tx.receipt.update({
        where: { id },
        data: { status: 'reversed', notes: `${receipt.notes || ''}\n[REVERSED] ${reason}`.trim() },
      });
    });

    logger.info(`Reversed receipt ${receipt.receiptNumber}: ${reason}`);
    webhookRefundProcessed(receipt);
    return { id, status: 'reversed' };
  }

  // ── Aging Report ────────────────────────────

  async getAgingReport(companyId: string, params: { propertyId?: string; asOfDate?: string }) {
    const today = params.asOfDate ? new Date(params.asOfDate) : new Date();
    const d30 = new Date(today); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(today); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(today); d90.setDate(d90.getDate() - 90);

    const where: any = {
      companyId,
      status: { in: ['issued', 'sent', 'partially_paid', 'overdue'] },
      invoiceType: 'invoice',
    };
    if (params.propertyId) where.propertyId = params.propertyId;

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        tenantId: true,
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
      },
    });

    // Group by tenant and bucket
    const tenantMap = new Map<string, {
      tenantId: string; tenantName: string;
      current: number; days1to30: number; days31to60: number; days61to90: number; over90: number; total: number;
    }>();

    for (const inv of invoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;

      const due = new Date(inv.dueDate);
      const tenantName = inv.tenant.tenantType === 'corporate'
        ? inv.tenant.companyName || ''
        : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();

      if (!tenantMap.has(inv.tenantId)) {
        tenantMap.set(inv.tenantId, {
          tenantId: inv.tenantId, tenantName,
          current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0,
        });
      }
      const row = tenantMap.get(inv.tenantId)!;

      if (due >= today) {
        row.current += outstanding;
      } else if (due >= d30) {
        row.days1to30 += outstanding;
      } else if (due >= d60) {
        row.days31to60 += outstanding;
      } else if (due >= d90) {
        row.days61to90 += outstanding;
      } else {
        row.over90 += outstanding;
      }
      row.total += outstanding;
    }

    const rows = Array.from(tenantMap.values()).sort((a, b) => b.total - a.total);

    const summary = rows.reduce(
      (s, r) => ({
        current: s.current + r.current,
        days1to30: s.days1to30 + r.days1to30,
        days31to60: s.days31to60 + r.days31to60,
        days61to90: s.days61to90 + r.days61to90,
        over90: s.over90 + r.over90,
        total: s.total + r.total,
      }),
      { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
    );

    return { summary, rows, generatedAt: today.toISOString() };
  }

  // ── Collection Summary ──────────────────────

  async getCollectionSummary(companyId: string, params: { propertyId?: string }) {
    const where: any = { companyId, invoiceType: 'invoice', status: { not: 'void' } };
    if (params.propertyId) where.propertyId = params.propertyId;

    const invoices = await prisma.invoice.findMany({
      where,
      select: { totalAmount: true, paidAmount: true, status: true, dueDate: true },
    });

    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const totalOutstanding = totalInvoiced - totalCollected;
    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0;

    const today = new Date();
    const overdueInvoices = invoices.filter(i => ['overdue', 'issued', 'sent', 'partially_paid'].includes(i.status) && new Date(i.dueDate) < today);
    const overdueCount = overdueInvoices.length;
    const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.totalAmount) - Number(i.paidAmount), 0);

    return { totalInvoiced, totalCollected, totalOutstanding, collectionRate, overdueCount, overdueAmount };
  }

  // ── Tenant Statement ────────────────────────

  async getStatement(companyId: string, tenantId: string, from: string, to: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, companyId },
      select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true },
    });
    if (!tenant) throw AppError.notFound('Tenant');

    const displayName = tenant.tenantType === 'corporate'
      ? tenant.companyName || ''
      : `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Get opening balance (outstanding before 'from' date)
    const priorInvoices = await prisma.invoice.findMany({
      where: {
        companyId, tenantId, invoiceType: 'invoice', status: { not: 'void' },
        invoiceDate: { lt: fromDate },
      },
      select: { totalAmount: true, paidAmount: true },
    });
    const openingBalance = priorInvoices.reduce((s, i) => s + Number(i.totalAmount) - Number(i.paidAmount), 0);

    // Invoices in period
    const invoices = await prisma.invoice.findMany({
      where: { companyId, tenantId, invoiceDate: { gte: fromDate, lte: toDate }, status: { not: 'void' } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true, invoiceType: true, notes: true },
      orderBy: { invoiceDate: 'asc' },
    });

    // Receipts in period
    const receipts = await prisma.receipt.findMany({
      where: { companyId, tenantId, receiptDate: { gte: fromDate, lte: toDate }, status: 'confirmed' },
      select: { id: true, receiptNumber: true, receiptDate: true, amount: true, paymentMethod: true, notes: true },
      orderBy: { receiptDate: 'asc' },
    });

    // Merge & sort by date
    type TxnRow = {
      date: string; type: string; reference: string; description: string;
      debit: number; credit: number; balance: number;
    };

    const transactions: TxnRow[] = [];

    const allItems: { date: Date; type: 'invoice' | 'credit_note' | 'receipt'; item: any }[] = [];

    for (const inv of invoices) {
      allItems.push({
        date: new Date(inv.invoiceDate),
        type: inv.invoiceType === 'credit_note' ? 'credit_note' : 'invoice',
        item: inv,
      });
    }
    for (const rct of receipts) {
      allItems.push({ date: new Date(rct.receiptDate), type: 'receipt', item: rct });
    }

    allItems.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = openingBalance;

    for (const entry of allItems) {
      if (entry.type === 'invoice') {
        const debit = Number(entry.item.totalAmount);
        runningBalance += debit;
        transactions.push({
          date: entry.date.toISOString().split('T')[0],
          type: 'invoice',
          reference: entry.item.invoiceNumber,
          description: entry.item.notes || `Invoice ${entry.item.invoiceNumber}`,
          debit,
          credit: 0,
          balance: runningBalance,
        });
      } else if (entry.type === 'credit_note') {
        const credit = Number(entry.item.totalAmount);
        runningBalance -= credit;
        transactions.push({
          date: entry.date.toISOString().split('T')[0],
          type: 'credit_note',
          reference: entry.item.invoiceNumber,
          description: entry.item.notes || `Credit Note ${entry.item.invoiceNumber}`,
          debit: 0,
          credit,
          balance: runningBalance,
        });
      } else {
        const credit = Number(entry.item.amount);
        runningBalance -= credit;
        transactions.push({
          date: entry.date.toISOString().split('T')[0],
          type: 'receipt',
          reference: entry.item.receiptNumber,
          description: `Payment received${entry.item.paymentMethod ? ` (${entry.item.paymentMethod.replace('_', ' ')})` : ''}`,
          debit: 0,
          credit,
          balance: runningBalance,
        });
      }
    }

    return {
      tenant: { id: tenant.id, displayName },
      period: { from, to },
      openingBalance,
      closingBalance: runningBalance,
      transactions,
    };
  }

  // ── Outstanding by Property ──────────────────

  async getOutstandingByProperty(companyId: string) {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceType: 'invoice',
        status: { in: ['issued', 'sent', 'partially_paid', 'overdue'] },
      },
      select: {
        totalAmount: true,
        paidAmount: true,
        propertyId: true,
        property: { select: { id: true, name: true } },
      },
    });

    const propertyMap = new Map<string, { propertyId: string; propertyName: string; outstanding: number; invoiceCount: number }>();

    for (const inv of invoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;

      const key = inv.propertyId || '__unassigned__';
      if (!propertyMap.has(key)) {
        propertyMap.set(key, {
          propertyId: inv.propertyId || '',
          propertyName: inv.property?.name || 'Unassigned',
          outstanding: 0,
          invoiceCount: 0,
        });
      }
      const row = propertyMap.get(key)!;
      row.outstanding += outstanding;
      row.invoiceCount += 1;
    }

    return Array.from(propertyMap.values()).sort((a, b) => b.outstanding - a.outstanding);
  }

  // ── Aging Report CSV ─────────────────────────

  generateAgingCsv(report: { summary: any; rows: any[]; generatedAt: string }): string {
    const lines: string[] = [];
    lines.push(`AR Aging Report — Generated ${report.generatedAt}`);
    lines.push('');
    lines.push('Tenant,Current,1-30 Days,31-60 Days,61-90 Days,Over 90 Days,Total');

    for (const row of report.rows) {
      const name = `"${(row.tenantName || '').replace(/"/g, '""')}"`;
      lines.push(`${name},${row.current.toFixed(2)},${row.days1to30.toFixed(2)},${row.days31to60.toFixed(2)},${row.days61to90.toFixed(2)},${row.over90.toFixed(2)},${row.total.toFixed(2)}`);
    }

    const s = report.summary;
    lines.push('');
    lines.push(`"TOTAL",${s.current.toFixed(2)},${s.days1to30.toFixed(2)},${s.days31to60.toFixed(2)},${s.days61to90.toFixed(2)},${s.over90.toFixed(2)},${s.total.toFixed(2)}`);

    return lines.join('\n');
  }

  // ── Overdue Trend (6 months) ─────────────────

  async getOverdueTrend(companyId: string) {
    // Generate 6 monthly data points ending with current month
    const now = new Date();
    const points: { month: string; overdueAmount: number; overdueCount: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const asOf = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // end of month
      const monthLabel = asOf.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

      const invoices = await prisma.invoice.findMany({
        where: {
          companyId,
          invoiceType: 'invoice',
          status: { in: ['issued', 'sent', 'partially_paid', 'overdue', 'paid'] },
          dueDate: { lt: asOf },
          invoiceDate: { lte: asOf },
        },
        select: { totalAmount: true, paidAmount: true, dueDate: true, status: true },
      });

      let overdueAmount = 0;
      let overdueCount = 0;

      for (const inv of invoices) {
        const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
        if (outstanding > 0 && new Date(inv.dueDate) < asOf) {
          overdueAmount += outstanding;
          overdueCount++;
        }
      }

      points.push({ month: monthLabel, overdueAmount, overdueCount });
    }

    return points;
  }

  // ── Statement HTML (printable) ────────────────

  async generateStatementHtml(companyId: string, tenantId: string, from: string, to: string): Promise<string> {
    const statement = await this.getStatement(companyId, tenantId, from, to);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });

    const fmtCur = (amount: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    const txRows = statement.transactions.map(t =>
      `<tr>
        <td>${fmtDate(t.date)}</td>
        <td><span class="type-badge type-${t.type}">${t.type.replace('_', ' ')}</span></td>
        <td style="font-weight:600">${t.reference}</td>
        <td>${t.description}</td>
        <td class="text-right">${t.debit > 0 ? fmtCur(t.debit) : ''}</td>
        <td class="text-right">${t.credit > 0 ? fmtCur(t.credit) : ''}</td>
        <td class="text-right" style="font-weight:600">${fmtCur(t.balance)}</td>
      </tr>`
    ).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Statement — ${statement.tenant.displayName}</title>
  <style>
    @media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 12mm; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #1a1a2e; padding: 40px; background: #fff; }
    .no-print { position: fixed; top: 16px; right: 16px; z-index: 999; }
    .no-print button { padding: 10px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .no-print button:hover { background: #4f46e5; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 3px solid #6366f1; padding-bottom: 16px; }
    .company-name { font-size: 22px; font-weight: 700; }
    .title { font-size: 24px; font-weight: 700; color: #6366f1; text-align: right; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .meta-box { background: #f8fafc; border-radius: 8px; padding: 14px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #6366f1; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
    .text-right { text-align: right; }
    .type-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
    .type-invoice { background: #dbeafe; color: #2563eb; }
    .type-receipt { background: #dcfce7; color: #16a34a; }
    .type-credit_note, .type-credit { background: #fef3c7; color: #d97706; }
    .summary-row { display: flex; justify-content: space-between; padding: 8px 16px; }
    .summary-row.closing { border-top: 2px solid #1a1a2e; font-size: 15px; font-weight: 700; margin-top: 4px; padding: 12px 16px; }
    .summary-row .label { color: #64748b; }
    .summary-row .amount { font-weight: 600; }
    .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="header">
    <div><div class="company-name">${company?.name || ''}</div></div>
    <div><div class="title">STATEMENT OF ACCOUNT</div></div>
  </div>
  <div class="meta-grid">
    <div class="meta-box">
      <div class="meta-label">Tenant</div>
      <div class="meta-value">${statement.tenant.displayName}</div>
    </div>
    <div class="meta-box">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div class="meta-label">From</div><div class="meta-value">${fmtDate(from)}</div></div>
        <div><div class="meta-label">To</div><div class="meta-value">${fmtDate(to)}</div></div>
      </div>
    </div>
  </div>
  <div style="margin-bottom:20px;width:320px;margin-left:auto;">
    <div class="summary-row"><span class="label">Opening Balance</span><span class="amount">${fmtCur(statement.openingBalance)}</span></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:85px">Date</th><th style="width:80px">Type</th><th style="width:120px">Reference</th>
      <th>Description</th><th class="text-right" style="width:90px">Debit</th>
      <th class="text-right" style="width:90px">Credit</th><th class="text-right" style="width:100px">Balance</th>
    </tr></thead>
    <tbody>
      ${txRows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">No transactions in this period</td></tr>'}
    </tbody>
  </table>
  <div style="width:320px;margin-left:auto;">
    <div class="summary-row closing"><span class="label">Closing Balance</span><span class="amount" style="color:${statement.closingBalance > 0 ? '#dc2626' : '#16a34a'}">${fmtCur(statement.closingBalance)}</span></div>
  </div>
  <div class="footer">Generated on ${fmtDate(new Date().toISOString())} &bull; ${company?.name || ''}</div>
</body>
</html>`;
  }
}

export const receiptsService = new ReceiptsService();

