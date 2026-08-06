import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { glService } from '../gl/gl.service';

export class ApInvoicesService {
  // ── Number Generation ────────────────────────
  async generateApNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `API-${year}-`;

    const last = await prisma.apInvoice.findFirst({
      where: { companyId, apInvoiceNumber: { startsWith: prefix } },
      orderBy: { apInvoiceNumber: 'desc' },
      select: { apInvoiceNumber: true },
    });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.apInvoiceNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── Create ───────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const lines = dto.lines as Array<{
      chargeTypeId?: string; description: string; quantity: number;
      unitPrice: number; taxRate: number; glAccountCode?: string;
    }>;

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    const lineData = lines.map((line, idx) => {
      const amount = Math.round(line.quantity * line.unitPrice * 100) / 100;
      const lineTax = Math.round(amount * (line.taxRate || 0) * 100) / 100;
      const lineTotal = Math.round((amount + lineTax) * 100) / 100;
      subtotal += amount;
      totalTax += lineTax;
      return {
        chargeTypeId: line.chargeTypeId || null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount,
        taxRate: line.taxRate || 0,
        taxAmount: lineTax,
        lineTotal,
        glAccountCode: line.glAccountCode || null,
        sortOrder: idx,
      };
    });

    const totalAmount = Math.round((subtotal + totalTax) * 100) / 100;
    const apInvoiceNumber = await this.generateApNumber(companyId);

    const invoice = await prisma.apInvoice.create({
      data: {
        companyId,
        propertyId: (dto.propertyId as string) || null,
        vendorName: dto.vendorName as string,
        vendorInvoiceNo: (dto.vendorInvoiceNo as string) || null,
        apInvoiceNumber,
        invoiceDate: new Date(dto.invoiceDate as string),
        dueDate: new Date(dto.dueDate as string),
        description: (dto.description as string) || null,
        subtotal,
        taxAmount: totalTax,
        totalAmount,
        currency: (dto.currency as string) || 'USD',
        status: 'pending',
        departmentId: (dto.departmentId as string) || null,
        costCenter: (dto.costCenter as string) || null,
        poReference: (dto.poReference as string) || null,
        attachmentUrl: (dto.attachmentUrl as string) || null,
        notes: (dto.notes as string) || null,
        createdBy: userId,
        lines: { create: lineData },
      },
      include: {
        lines: { include: { chargeType: true }, orderBy: { sortOrder: 'asc' } },
        property: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    logger.info(`Created AP invoice ${apInvoiceNumber} from ${dto.vendorName} (${totalAmount} ${invoice.currency})`);
    return invoice;
  }

  // ── Find All ─────────────────────────────────
  async findAll(companyId: string, filters: {
    vendorName?: string; status?: string; propertyId?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const { vendorName, status, propertyId, from, to, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (vendorName) where.vendorName = { contains: vendorName, mode: 'insensitive' };
    if (status) where.status = status;
    if (propertyId) where.propertyId = propertyId;
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to) where.invoiceDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.apInvoice.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          _count: { select: { pvAllocations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.apInvoice.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Find By ID ───────────────────────────────
  async findById(id: string, companyId: string) {
    const invoice = await prisma.apInvoice.findFirst({
      where: { id, companyId },
      include: {
        lines: { include: { chargeType: true }, orderBy: { sortOrder: 'asc' } },
        property: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        approver: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        pvAllocations: {
          include: {
            voucher: { select: { id: true, voucherNumber: true, status: true, totalAmount: true, paidAt: true } },
          },
        },
      },
    });
    if (!invoice) throw AppError.notFound('AP Invoice');
    return invoice;
  }

  // ── Approve ──────────────────────────────────
  async approve(id: string, companyId: string, userId: string) {
    const invoice = await prisma.apInvoice.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!invoice) throw AppError.notFound('AP Invoice');
    if (invoice.status !== 'pending') throw AppError.validation('Only pending AP invoices can be approved');

    const updated = await prisma.apInvoice.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
      include: {
        lines: { include: { chargeType: true }, orderBy: { sortOrder: 'asc' } },
        property: { select: { id: true, name: true } },
      },
    });

    // ── GL Auto-Post: Dr Expense accounts / Cr Accounts Payable ──
    try {
      const glLines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [];

      // Debit each line's expense account (use glAccountCode from line, default 5000)
      for (const line of invoice.lines) {
        const expenseCode = line.glAccountCode || '5000';
        glLines.push({
          accountCode: expenseCode,
          debit: Number(line.amount),
          credit: 0,
          description: `${line.description} — ${invoice.vendorName}`,
        });
      }

      // Debit tax to Tax Expense/Payable if tax exists
      if (Number(invoice.taxAmount) > 0) {
        glLines.push({
          accountCode: '2200', // Tax Payable — Input Tax
          debit: Number(invoice.taxAmount),
          credit: 0,
          description: `Input Tax — ${invoice.apInvoiceNumber}`,
        });
      }

      // Credit Accounts Payable for the total
      glLines.push({
        accountCode: '2100', // Accounts Payable
        debit: 0,
        credit: Number(invoice.totalAmount),
        description: `AP — ${invoice.apInvoiceNumber} (${invoice.vendorName})`,
      });

      await glService.postAutoJournal({
        companyId,
        entryDate: invoice.invoiceDate,
        entryType: 'ap_invoice',
        description: `AP Invoice ${invoice.apInvoiceNumber} — ${invoice.vendorName}`,
        referenceType: 'ap_invoice',
        referenceId: invoice.id,
        propertyId: invoice.propertyId || undefined,
        lines: glLines,
      });
    } catch (err: any) {
      logger.warn(`GL auto-post for AP invoice ${invoice.apInvoiceNumber} failed: ${err.message}`);
    }

    logger.info(`Approved AP invoice ${invoice.apInvoiceNumber}`);
    return updated;
  }

  // ── Reject ───────────────────────────────────
  async reject(id: string, companyId: string, reason: string) {
    const invoice = await prisma.apInvoice.findFirst({ where: { id, companyId } });
    if (!invoice) throw AppError.notFound('AP Invoice');
    if (invoice.status !== 'pending') throw AppError.validation('Only pending AP invoices can be rejected');

    const updated = await prisma.apInvoice.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: reason },
    });

    logger.info(`Rejected AP invoice ${invoice.apInvoiceNumber}: ${reason}`);
    return updated;
  }

  // ── Due Payments Report ──────────────────────
  async getDuePayments(companyId: string, filters: { dueBefore?: string; propertyId?: string }) {
    const where: any = {
      companyId,
      status: { in: ['approved', 'scheduled'] },
    };
    if (filters.dueBefore) {
      where.dueDate = { lte: new Date(filters.dueBefore) };
    }
    if (filters.propertyId) {
      where.propertyId = filters.propertyId;
    }

    const invoices = await prisma.apInvoice.findMany({
      where,
      select: {
        id: true, apInvoiceNumber: true, vendorName: true,
        dueDate: true, totalAmount: true, paidAmount: true, currency: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    const today = new Date();
    const result = invoices.map(inv => ({
      ...inv,
      outstanding: Number(inv.totalAmount) - Number(inv.paidAmount),
      daysUntilDue: Math.ceil((new Date(inv.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    })).filter(inv => inv.outstanding > 0);

    return {
      totalDue: result.reduce((s, i) => s + i.outstanding, 0),
      invoices: result,
    };
  }
}

export const apInvoicesService = new ApInvoicesService();
