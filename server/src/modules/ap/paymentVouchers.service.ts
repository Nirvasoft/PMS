import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { glService } from '../gl/gl.service';

export class PaymentVouchersService {
  private schemaReady = false;

  private async ensurePaymentVouchersPropertyColumn() {
    if (this.schemaReady) return;
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE payment_vouchers ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS payment_vouchers_property_id_idx ON payment_vouchers(property_id);`,
      );
      // Backfill legacy payment vouchers from their allocated AP invoice property_id
      await prisma.$executeRawUnsafe(`
        UPDATE payment_vouchers pv
        SET property_id = sub.property_id
        FROM (
          SELECT DISTINCT ON (pa.voucher_id) pa.voucher_id, ai.property_id
          FROM pv_allocations pa
          JOIN ap_invoices ai ON ai.id = pa.ap_invoice_id
          WHERE ai.property_id IS NOT NULL
        ) sub
        WHERE pv.id = sub.voucher_id AND pv.property_id IS NULL;
      `);
      this.schemaReady = true;
    } catch (err: any) {
      logger.warn(`ensurePaymentVouchersPropertyColumn warning: ${err.message}`);
    }
  }

  private async resolveEffectivePropertyId(companyId: string, propertyId?: string): Promise<string | undefined> {
    if (propertyId) return propertyId;
    const firstProp = await prisma.property.findFirst({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return firstProp?.id;
  }

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
    await this.ensurePaymentVouchersPropertyColumn();

    const allocations = ((dto.allocations as Array<{ apInvoiceId: string; amount: number }>) || []);
    const isCash = Boolean(dto.isCash);
    const vendorName = isCash ? '' : ((dto.vendorName as string) || '').trim();
    let resolvedPropertyId = (dto.propertyId as string) || undefined;

    // Validate all AP invoices are approved
    for (const alloc of allocations) {
      const apInvoice = await prisma.apInvoice.findFirst({
        where: { id: alloc.apInvoiceId, companyId },
      });
      if (!apInvoice) throw AppError.notFound(`AP Invoice ${alloc.apInvoiceId}`);
      if (!['approved', 'scheduled'].includes(apInvoice.status)) {
        throw AppError.validation(`AP Invoice ${apInvoice.apInvoiceNumber} is not approved`);
      }
      if (!resolvedPropertyId && apInvoice.propertyId) {
        resolvedPropertyId = apInvoice.propertyId;
      }
      const outstanding = Number(apInvoice.totalAmount) - Number(apInvoice.paidAmount);
      if (alloc.amount > outstanding + 0.01) {
        throw AppError.validation(
          `Allocation ${alloc.amount} exceeds outstanding ${outstanding} for ${apInvoice.apInvoiceNumber}`,
        );
      }
    }

    if (!resolvedPropertyId) {
      resolvedPropertyId = await this.resolveEffectivePropertyId(companyId);
    }

    const allocatedTotal = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const explicitAmount = typeof dto.amount === 'number' && !isNaN(dto.amount) ? Math.round(dto.amount * 100) / 100 : 0;
    const totalAmount = allocations.length > 0 ? (explicitAmount > 0 ? explicitAmount : allocatedTotal) : explicitAmount;
    const voucherNumber = await this.generateVoucherNumber(companyId);

    const voucher = await prisma.paymentVoucher.create({
      data: {
        companyId,
        propertyId: resolvedPropertyId || null,
        voucherNumber,
        voucherDate: new Date(dto.voucherDate as string),
        paymentMethod: dto.paymentMethod as string,
        bankAccountId: (dto.bankAccountId as string) || null,
        vendorName,
        vendorBankName: (dto.vendorBankName as string) || null,
        vendorBankAcc: (dto.vendorBankAcc as string) || null,
        totalAmount,
        currency: dto.currency as string,
        notes: (dto.notes as string) || null,
        status: 'pending',
        createdBy: userId,
        ...(allocations.length > 0 && {
          allocations: {
            create: allocations.map(a => ({
              apInvoiceId: a.apInvoiceId,
              amount: a.amount,
            })),
          },
        }),
      },
      include: {
        property: { select: { id: true, name: true } },
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
    status?: string; vendorName?: string; propertyId?: string; page?: number; limit?: number;
  }) {
    await this.ensurePaymentVouchersPropertyColumn();

    const { status, vendorName, propertyId, page = 1, limit = 20 } = filters;
    const effectivePropertyId = await this.resolveEffectivePropertyId(companyId, propertyId);

    const where: any = { companyId };
    if (effectivePropertyId) where.propertyId = effectivePropertyId;
    if (status) where.status = status;
    if (vendorName) where.vendorName = { contains: vendorName, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.paymentVoucher.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
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
    await this.ensurePaymentVouchersPropertyColumn();

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
    if (Number(voucher.totalAmount) > 0) {
      try {
        const vendorNames = [...new Set(voucher.allocations.map(a => (a.apInvoice as any)?.vendorName).filter(Boolean))];
        const vendorLabel = voucher.vendorName || (vendorNames.length > 0 ? vendorNames.join(', ') : 'Cash Payment');
        const voucherPropertyId = voucher.propertyId || (voucher.allocations[0]?.apInvoice as any)?.propertyId || undefined;
        const pmConfig = await glService.resolvePaymentMethodConfig(companyId, voucher.paymentMethod, voucherPropertyId);
        const creditAccountCode = pmConfig?.glAccountCode || '1000';

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
              accountCode: creditAccountCode, // Cash / Bank (or configured PaymentMethod GL Account)
              debit: 0,
              credit: Number(voucher.totalAmount),
              description: `Payment — ${voucher.voucherNumber} (Ref: ${dto.paymentReference})`,
              departmentCenterId: pmConfig?.departmentCenterId || undefined,
              costCenterId: pmConfig?.costCenterId || undefined,
            },
          ],
        });
      } catch (err: any) {
        logger.warn(`GL auto-post for PV ${voucher.voucherNumber} failed: ${err.message}`);
      }
    }

    logger.info(`Payment voucher ${voucher.voucherNumber} marked as paid (ref: ${dto.paymentReference})`);
    return updated;
  }
}

export const paymentVouchersService = new PaymentVouchersService();
