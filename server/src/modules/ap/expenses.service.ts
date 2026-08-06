import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { glService } from '../gl/gl.service';

export class ExpensesService {
  // ── Create ───────────────────────────────────
  async create(companyId: string, dto: Record<string, unknown>, userId: string) {
    const expense = await prisma.expense.create({
      data: {
        companyId,
        propertyId: (dto.propertyId as string) || null,
        departmentId: (dto.departmentId as string) || null,
        expenseDate: new Date(dto.expenseDate as string),
        category: dto.category as string,
        description: dto.description as string,
        amount: dto.amount as number,
        currency: dto.currency as string,
        receiptUrl: (dto.receiptUrl as string) || null,
        glAccountCode: (dto.glAccountCode as string) || null,
        submittedBy: userId,
        status: 'pending',
      },
      include: {
        property: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        submitter: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    logger.info(`Created expense ${expense.id} for ${dto.amount} ${dto.currency} (${dto.category})`);
    return expense;
  }

  // ── Find All ─────────────────────────────────
  async findAll(companyId: string, filters: {
    status?: string; category?: string; departmentId?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const { status, category, departmentId, from, to, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (departmentId) where.departmentId = departmentId;
    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate.gte = new Date(from);
      if (to) where.expenseDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          submitter: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
          approver: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Approve ──────────────────────────────────
  async approve(id: string, companyId: string, userId: string) {
    const expense = await prisma.expense.findFirst({ where: { id, companyId } });
    if (!expense) throw AppError.notFound('Expense');
    if (expense.status !== 'pending') throw AppError.validation('Only pending expenses can be approved');

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
      include: {
        submitter: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    // ── GL Auto-Post: Dr Expense / Cr AP (or Cash) ──
    try {
      const expenseCode = expense.glAccountCode || '5000'; // Default operating expense
      await glService.postAutoJournal({
        companyId,
        entryDate: expense.expenseDate,
        entryType: 'expense',
        description: `Expense — ${expense.category}: ${expense.description}`,
        referenceType: 'expense',
        referenceId: expense.id,
        propertyId: expense.propertyId || undefined,
        lines: [
          {
            accountCode: expenseCode,
            debit: Number(expense.amount),
            credit: 0,
            description: `${expense.category} — ${expense.description}`,
          },
          {
            accountCode: '2100', // Accounts Payable (reimbursable)
            debit: 0,
            credit: Number(expense.amount),
            description: `Expense payable — ${expense.category}`,
          },
        ],
      });
    } catch (err: any) {
      logger.warn(`GL auto-post for expense ${id} failed: ${err.message}`);
    }

    logger.info(`Approved expense ${id} for ${expense.amount} ${expense.currency}`);
    return updated;
  }

  // ── Expense Report ───────────────────────────
  async getExpenseReport(companyId: string, filters: {
    departmentId?: string; from?: string; to?: string; groupBy?: string;
  }) {
    const where: any = { companyId, status: 'approved' };
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.from || filters.to) {
      where.expenseDate = {};
      if (filters.from) where.expenseDate.gte = new Date(filters.from);
      if (filters.to) where.expenseDate.lte = new Date(filters.to);
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'asc' },
    });

    // Group by category or department
    const groupField = filters.groupBy === 'department' ? 'departmentName' : 'category';
    const grouped: Record<string, { total: number; count: number }> = {};

    for (const exp of expenses) {
      const key = groupField === 'category' ? exp.category : (exp.department?.name || 'Unassigned');
      if (!grouped[key]) grouped[key] = { total: 0, count: 0 };
      grouped[key].total += Number(exp.amount);
      grouped[key].count += 1;
    }

    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);

    return {
      totalAmount,
      totalCount: expenses.length,
      breakdown: Object.entries(grouped).map(([key, val]) => ({
        label: key,
        total: Math.round(val.total * 100) / 100,
        count: val.count,
        percentage: totalAmount > 0 ? Math.round((val.total / totalAmount) * 1000) / 10 : 0,
      })).sort((a, b) => b.total - a.total),
    };
  }
}

export const expensesService = new ExpensesService();
