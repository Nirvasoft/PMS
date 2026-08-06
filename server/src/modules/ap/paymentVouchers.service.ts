import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { glService } from '../gl/gl.service';

export class PaymentVouchersService {
  // ── Number Generation ────────────────────────
  async generateVoucherNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PV-${year}-`;

    const last = await prisma.paymentVoucher.findFirst({
      where: { companyId, voucherNumber: { startsWith: prefix } },
      orderBy: { voucherNumber: 'desc' },
      select: { voucherNumber: true },
    });

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.voucherNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── Create ───────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const allocations = dto.allocations as Array<{ apInvoiceId: string; amount: number }>;

    // Validate all AP invoices are approved
    for (const alloc of allocations) {
      const apInvoice = await prisma.apInvoice.findFirst({
        where: { id: alloc.apInvoiceId, companyId },
      });
      if (!apInvoice) throw AppError.notFound(`AP Invoice ${alloc.apInvoiceId}`);
      if (!['approved', 'scheduled'].includes(apInvoice.status)) {
        throw AppError.validation(`AP Invoice ${apInvoice.apInvoiceNumber} is not approved`);
      }
      const outstanding = Number(apInvoice.totalAmount) - Number(apInvoice.paidAmount);
      if (alloc.amount > outstanding + 0.01) {
        throw AppError.validation(
          `Allocation ${alloc.amount} exceeds outstanding ${outstanding} for ${apInvoice.apInvoiceNumber}`,
        );
      }
    }

    const totalAmount = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const voucherNumber = await this.generateVoucherNumber(companyId);

    const voucher = await prisma.paymentVoucher.create({
      data: {
        companyId,
        voucherNumber,
        voucherDate: new Date(dto.voucherDate as string),
        paymentMethod: dto.paymentMethod as string,
        bankAccountId: (dto.bankAccountId as string) || null,
        vendorName: dto.vendorName as string,
        vendorBankName: (dto.vendorBankName as string) || null,
        vendorBankAcc: (dto.vendorBankAcc as string) || null,
        totalAmount,
        currency: dto.currency as string,
        notes: (dto.notes as string) || null,
        status: 'pending',
        createdBy: userId,
        allocations: {
          create: allocations.map(a => ({
            apInvoiceId: a.apInvoiceId,
            amount: a.amount,
          })),
        },
      },
      include: {
        allocations: {
          include: {
            apInvoice: { select: { id: true, apInvoiceNumber: true, vendorName: true, totalAmount: true } },
          },
        },
        creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    logger.info(`Created payment voucher ${voucherNumber} for ${totalAmount} ${dto.currency}`);
    return voucher;
  }

  // ── Find All ─────────────────────────────────
  async findAll(companyId: string, filters: {
    status?: string; vendorName?: string; page?: number; limit?: number;
  }) {
    const { status, vendorName, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (status) where.status = status;
    if (vendorName) where.vendorName = { contains: vendorName, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.paymentVoucher.findMany({
        where,
        include: {
          allocations: {
            include: {
              apInvoice: { select: { id: true, apInvoiceNumber: true, vendorName: true } },
            },
          },
          bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
          creator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.paymentVoucher.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Mark Paid ────────────────────────────────
  async markPaid(id: string, companyId: string, dto: { paymentReference: string; paidAt?: string }) {
    const voucher = await prisma.paymentVoucher.findFirst({
      where: { id, companyId },
      include: { allocations: { include: { apInvoice: true } } },
    });
    if (!voucher) throw AppError.notFound('Payment Voucher');
    if (voucher.status === 'paid') throw AppError.validation('Voucher is already paid');
    if (voucher.status === 'cancelled') throw AppError.validation('Cannot pay a cancelled voucher');

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    // Update voucher
    const updated = await prisma.paymentVoucher.update({
      where: { id },
      data: {
        status: 'paid',
        paymentReference: dto.paymentReference,
        paidAt,
      },
    });

    // Update AP invoice paid amounts
    for (const alloc of voucher.allocations) {
      const apInvoice = await prisma.apInvoice.findUnique({ where: { id: alloc.apInvoiceId } });
      if (!apInvoice) continue;

      const newPaidAmount = Number(apInvoice.paidAmount) + Number(alloc.amount);
      const newStatus = newPaidAmount >= Number(apInvoice.totalAmount) ? 'paid' : apInvoice.status;

      await prisma.apInvoice.update({
        where: { id: alloc.apInvoiceId },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
    }

    // ── GL Auto-Post: Dr Accounts Payable / Cr Cash/Bank ──
    try {
      const vendorNames = [...new Set(voucher.allocations.map(a => (a.apInvoice as any)?.vendorName).filter(Boolean))];
      const vendorLabel = vendorNames.length > 0 ? vendorNames.join(', ') : voucher.vendorName;

      await glService.postAutoJournal({
        companyId,
        entryDate: paidAt,
        entryType: 'ap_payment',
        description: `AP Payment ${voucher.voucherNumber} — ${vendorLabel}`,
        referenceType: 'payment_voucher',
        referenceId: voucher.id,
        lines: [
          {
            accountCode: '2100', // Accounts Payable
            debit: Number(voucher.totalAmount),
            credit: 0,
            description: `AP cleared — ${voucher.voucherNumber}`,
          },
          {
            accountCode: '1000', // Cash / Bank
            debit: 0,
            credit: Number(voucher.totalAmount),
            description: `Payment — ${voucher.voucherNumber} (Ref: ${dto.paymentReference})`,
          },
        ],
      });
    } catch (err: any) {
      logger.warn(`GL auto-post for PV ${voucher.voucherNumber} failed: ${err.message}`);
    }

    logger.info(`Payment voucher ${voucher.voucherNumber} marked as paid (ref: ${dto.paymentReference})`);
    return updated;
  }
}

export const paymentVouchersService = new PaymentVouchersService();
