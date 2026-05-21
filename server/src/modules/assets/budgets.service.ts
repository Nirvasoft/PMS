import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

class BudgetsService {
  async findAll(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.fiscalYear) where.fiscalYear = parseInt(params.fiscalYear);
    if (params.propertyId) where.propertyId = params.propertyId;
    if (params.status) where.status = params.status;

    return prisma.budget.findMany({
      where,
      include: { glAccount: { select: { code: true, name: true, accountType: true } } },
      orderBy: [{ fiscalYear: 'desc' }, { glAccount: { code: 'asc' } }],
    });
  }

  async create(companyId: string, userId: string, data: any) {
    // Auto-calculate annualAmount from monthlyAmounts if provided
    let annualAmount = data.annualAmount;
    if (data.monthlyAmounts && !annualAmount) {
      annualAmount = Object.values(data.monthlyAmounts as Record<string, number>)
        .reduce((s: number, v: any) => s + Number(v), 0);
    }

    return prisma.budget.create({
      data: {
        companyId,
        propertyId: data.propertyId || null,
        departmentId: data.departmentId || null,
        fiscalYear: data.fiscalYear,
        glAccountId: data.glAccountId,
        name: data.name || null,
        annualAmount,
        monthlyAmounts: data.monthlyAmounts || null,
        status: 'draft',
        createdBy: userId,
      },
      include: { glAccount: { select: { code: true, name: true } } },
    });
  }

  async update(id: string, companyId: string, data: any) {
    const budget = await prisma.budget.findFirstOrThrow({ where: { id, companyId } });
    if (budget.status === 'locked') throw new Error('Cannot update a locked budget');

    let annualAmount = data.annualAmount;
    if (data.monthlyAmounts && !annualAmount) {
      annualAmount = Object.values(data.monthlyAmounts as Record<string, number>)
        .reduce((s: number, v: any) => s + Number(v), 0);
    }

    return prisma.budget.update({
      where: { id },
      data: {
        name: data.name,
        annualAmount: annualAmount ?? budget.annualAmount,
        monthlyAmounts: data.monthlyAmounts ?? budget.monthlyAmounts,
        status: data.status,
        approvedBy: data.status === 'approved' ? data.approvedBy : budget.approvedBy,
      },
      include: { glAccount: { select: { code: true, name: true } } },
    });
  }

  async delete(id: string, companyId: string) {
    const budget = await prisma.budget.findFirstOrThrow({ where: { id, companyId } });
    if (budget.status === 'locked') throw new Error('Cannot delete a locked budget');
    return prisma.budget.delete({ where: { id } });
  }

  async approve(id: string, companyId: string, userId: string) {
    return prisma.budget.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId },
    });
  }

  async getVariance(companyId: string, params: { fiscalYear: number; month?: number; propertyId?: string }) {
    // Get budgets for the fiscal year
    const budgets = await prisma.budget.findMany({
      where: {
        companyId,
        fiscalYear: params.fiscalYear,
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
      },
      include: { glAccount: { select: { code: true, name: true, accountType: true } } },
    });

    // Get actual spend from posted journal entries for same period
    const yearStart = new Date(params.fiscalYear, 0, 1);
    const yearEnd = params.month
      ? new Date(params.fiscalYear, params.month, 0)
      : new Date(params.fiscalYear, 11, 31);

    const actuals = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId,
          status: 'posted',
          entryDate: { gte: yearStart, lte: yearEnd },
        },
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
      },
      select: { accountId: true, debit: true, credit: true },
    });

    // Aggregate actuals by account
    const actualsByAccount: Record<string, number> = {};
    for (const line of actuals) {
      if (!actualsByAccount[line.accountId]) actualsByAccount[line.accountId] = 0;
      actualsByAccount[line.accountId] += Number(line.debit) - Number(line.credit);
    }

    // Build variance rows
    const rows = budgets.map(b => {
      const budgetAmount = params.month
        ? Number((b.monthlyAmounts as any)?.[String(params.month)] || 0)
        : Number(b.annualAmount);
      const actualAmount = Math.abs(actualsByAccount[b.glAccountId] || 0);
      const variance = budgetAmount - actualAmount;
      const variancePct = budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0;

      return {
        budgetId: b.id,
        glAccountId: b.glAccountId,
        glAccountCode: b.glAccount.code,
        accountName: b.glAccount.name,
        accountType: b.glAccount.accountType,
        budgetAmount,
        actualAmount,
        variance,
        variancePct: Math.round(variancePct * 100) / 100,
        status: variance >= 0 ? 'under_budget' : 'over_budget',
      };
    });

    const totalBudget = rows.reduce((s, r) => s + r.budgetAmount, 0);
    const totalActual = rows.reduce((s, r) => s + r.actualAmount, 0);

    return {
      rows,
      summary: {
        totalBudget,
        totalActual,
        totalVariance: totalBudget - totalActual,
        totalVariancePct: totalBudget > 0 ? Math.round(((totalBudget - totalActual) / totalBudget) * 10000) / 100 : 0,
      },
      filters: params,
    };
  }
}

export const budgetsService = new BudgetsService();
