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
    const cashLines = ((dto.lines as Array<{
      chargeTypeId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
      glAccountCode?: string;
    }>) || []);
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

    // Calculate Cash line totals if Cash mode with lines
    let cashSubtotal = 0;
    let cashTotalTax = 0;
    const computedCashLines = cashLines.map((line) => {
      const amount = Math.round(line.quantity * line.unitPrice * 100) / 100;
      const lineTax = Math.round(amount * (line.taxRate || 0) * 100) / 100;
      const lineTotal = Math.round((amount + lineTax) * 100) / 100;
      cashSubtotal += amount;
      cashTotalTax += lineTax;
      return { ...line, amount, lineTax, lineTotal };
    });
    const cashGrandTotal = Math.round((cashSubtotal + cashTotalTax) * 100) / 100;

    const allocatedTotal = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const explicitAmount = typeof dto.amount === 'number' && !isNaN(dto.amount) ? Math.round(dto.amount * 100) / 100 : 0;
    const totalAmount = isCash && computedCashLines.length > 0
      ? cashGrandTotal
      : (allocations.length > 0 ? (explicitAmount > 0 ? explicitAmount : allocatedTotal) : explicitAmount);
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

    // ── Cash Voucher GL Auto-Post: Dr Charges' GL Accounts (or 5000) / Cr Accounts Payable (2100) ──
    if (isCash && computedCashLines.length > 0 && totalAmount > 0) {
      try {
        const chargeTypeIds = Array.from(
          new Set(computedCashLines.map((l) => l.chargeTypeId).filter((id): id is string => Boolean(id)))
        );
        const chargeTypeMap = new Map<string, {
          glAccountCode: string | null;
          departmentCenterId: string | null;
          costCenterId: string | null;
        }>();
        if (chargeTypeIds.length > 0) {
          const cts = await prisma.chargeType.findMany({
            where: { id: { in: chargeTypeIds } },
            select: { id: true, glAccountCode: true, departmentCenterId: true, costCenterId: true },
          });
          for (const ct of cts) chargeTypeMap.set(ct.id, ct);
        }

        const glLines: Array<{
          accountCode: string;
          debit: number;
          credit: number;
          description?: string;
          departmentCenterId?: string | null;
          costCenterId?: string | null;
        }> = [];

        for (const line of computedCashLines) {
          const ct = line.chargeTypeId ? chargeTypeMap.get(line.chargeTypeId) : undefined;
          const expenseCode = ct?.glAccountCode?.trim() || line.glAccountCode?.trim() || '5000';
          glLines.push({
            accountCode: expenseCode,
            debit: line.amount,
            credit: 0,
            description: `${line.description} — ${voucher.voucherNumber}`,
            departmentCenterId: ct?.departmentCenterId || null,
            costCenterId: ct?.costCenterId || null,
          });
        }

        if (cashTotalTax > 0) {
          glLines.push({
            accountCode: '2200', // Tax Payable — Input Tax
            debit: cashTotalTax,
            credit: 0,
            description: `Input Tax — ${voucher.voucherNumber}`,
          });
        }

        // Cash voucher is paid directly: credit the Payment Method's GL account (Cash/Bank)
        // instead of Accounts Payable.
        const pmConfig = await glService.resolvePaymentMethodConfig(
          companyId,
          voucher.paymentMethod,
          resolvedPropertyId,
        );
        const creditAccountCode = pmConfig?.glAccountCode || '1000';

        glLines.push({
          accountCode: creditAccountCode,
          debit: 0,
          credit: totalAmount,
          description: `Cash Payment — ${voucher.voucherNumber}`,
          departmentCenterId: pmConfig?.departmentCenterId || undefined,
          costCenterId: pmConfig?.costCenterId || undefined,
        });

        const journal = await glService.postAutoJournal({
          companyId,
          entryDate: voucher.voucherDate,
          entryType: 'ap_payment',
          description: `Cash Payment Voucher ${voucher.voucherNumber}`,
          referenceType: 'payment_voucher',
          referenceId: voucher.id,
          propertyId: resolvedPropertyId || undefined,
          lines: glLines,
        });

        // Mark as posted so "Mark as Paid" does not post a second (AP) journal for cash vouchers.
        if (journal) {
          await prisma.paymentVoucher.update({
            where: { id: voucher.id },
            data: { glPosted: true, glJournalId: (journal as any).id },
          });
        }
      } catch (err: any) {
        logger.warn(`GL auto-post for Cash Voucher ${voucher.voucherNumber} failed: ${err.message}`);
      }
    }

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

    // No GL journal is posted when marking a voucher as paid:
    //  - Cash vouchers already posted their journal at creation (Dr Charges / Cr Payment Method account).
    //  - Non-cash vouchers (allocated to AP invoices) do not generate a journal entry.

    logger.info(`Payment voucher ${voucher.voucherNumber} marked as paid (ref: ${dto.paymentReference})`);
    return updated;
  }
}

export const paymentVouchersService = new PaymentVouchersService();
