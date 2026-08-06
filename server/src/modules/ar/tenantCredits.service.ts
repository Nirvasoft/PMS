import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class TenantCreditsService {
  // ── List by tenant (existing) ─────────────
  async findByTenant(companyId: string, tenantId: string) {
    const credits = await prisma.tenantCredit.findMany({
      where: { companyId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return credits.map((c) => ({
      ...c,
      balance: Number(c.amount) - Number(c.usedAmount),
    }));
  }

  // ── Company-wide list (new) ───────────────
  async findAll(companyId: string, filters: {
    tenantId?: string; sourceType?: string; page?: number; limit?: number;
  }) {
    const { tenantId, sourceType, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (tenantId) where.tenantId = tenantId;
    if (sourceType) where.sourceType = sourceType;

    const [data, total] = await Promise.all([
      prisma.tenantCredit.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true, firstName: true, lastName: true,
              companyName: true, tenantType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenantCredit.count({ where }),
    ]);

    return {
      data: data.map(c => ({
        ...c,
        balance: Number(c.amount) - Number(c.usedAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Create manual credit/adjustment ───────
  async create(companyId: string, input: {
    tenantId: string; amount: number; currency: string;
    sourceType: string; description?: string;
  }) {
    const credit = await prisma.tenantCredit.create({
      data: {
        companyId,
        tenantId: input.tenantId,
        amount: input.amount,
        currency: input.currency,
        sourceType: input.sourceType,
        description: input.description || null,
        usedAmount: 0,
      },
      include: {
        tenant: {
          select: {
            id: true, firstName: true, lastName: true,
            companyName: true, tenantType: true,
          },
        },
      },
    });

    return { ...credit, balance: Number(credit.amount) - Number(credit.usedAmount) };
  }

  // ── Apply credit to invoice ───────────────
  async applyToInvoice(companyId: string, creditId: string, invoiceId: string, amount: number) {
    return prisma.$transaction(async (tx) => {
      const credit = await tx.tenantCredit.findFirst({
        where: { id: creditId, companyId },
      });
      if (!credit) throw AppError.notFound('Credit');

      const available = Number(credit.amount) - Number(credit.usedAmount);
      if (amount > available) throw AppError.validation(`Insufficient credit balance. Available: ${available.toFixed(2)}`);

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, companyId, tenantId: credit.tenantId },
      });
      if (!invoice) throw AppError.notFound('Invoice');

      const outstanding = Number(invoice.totalAmount) - Number(invoice.paidAmount);
      if (outstanding <= 0) throw AppError.validation('Invoice is already fully paid');

      const applyAmount = Math.min(amount, outstanding);

      // Update credit used amount
      await tx.tenantCredit.update({
        where: { id: creditId },
        data: { usedAmount: { increment: applyAmount } },
      });

      // Update invoice paid amount
      const newPaid = Number(invoice.paidAmount) + applyAmount;
      const newStatus = newPaid >= Number(invoice.totalAmount) ? 'paid' : 'partially_paid';
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, status: newStatus },
      });

      return { creditId, invoiceId, appliedAmount: applyAmount, newStatus };
    });
  }

  // ── Summary stats ─────────────────────────
  async getSummary(companyId: string) {
    const credits = await prisma.tenantCredit.findMany({
      where: { companyId },
    });

    const totalIssued = credits.reduce((s, c) => s + Number(c.amount), 0);
    const totalUsed = credits.reduce((s, c) => s + Number(c.usedAmount), 0);
    const totalAvailable = totalIssued - totalUsed;
    const activeCredits = credits.filter(c => Number(c.amount) - Number(c.usedAmount) > 0).length;

    return { totalIssued, totalUsed, totalAvailable, totalCredits: credits.length, activeCredits };
  }
}

export const tenantCreditsService = new TenantCreditsService();
