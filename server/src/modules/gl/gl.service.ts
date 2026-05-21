import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

// ── Default COA seed data ─────────────────────
const DEFAULT_COA = [
  // Assets (1000–1999)
  { code: '1000', name: 'Assets', type: 'asset', subtype: null, normal: 'debit', control: false },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'current_asset', normal: 'debit', control: true },
  { code: '1200', name: 'Cash & Bank', type: 'asset', subtype: 'current_asset', normal: 'debit', control: false },
  { code: '1210', name: 'Operating Bank Account', type: 'asset', subtype: 'current_asset', normal: 'debit', control: false, parent: '1200' },
  { code: '1300', name: 'Prepaid Expenses', type: 'asset', subtype: 'current_asset', normal: 'debit', control: false },
  { code: '1500', name: 'Fixed Assets', type: 'asset', subtype: 'fixed_asset', normal: 'debit', control: false },
  { code: '1510', name: 'Building & Improvements', type: 'asset', subtype: 'fixed_asset', normal: 'debit', control: false, parent: '1500' },
  { code: '1520', name: 'Furniture & Equipment', type: 'asset', subtype: 'fixed_asset', normal: 'debit', control: false, parent: '1500' },
  { code: '1590', name: 'Accumulated Depreciation', type: 'asset', subtype: 'fixed_asset', normal: 'credit', control: false, parent: '1500' },
  // Liabilities (2000–2999)
  { code: '2000', name: 'Liabilities', type: 'liability', subtype: null, normal: 'credit', control: false },
  { code: '2100', name: 'Accounts Payable', type: 'liability', subtype: 'current_liability', normal: 'credit', control: true },
  { code: '2200', name: 'Tax Payable', type: 'liability', subtype: 'current_liability', normal: 'credit', control: false },
  { code: '2300', name: 'Accrued Expenses', type: 'liability', subtype: 'current_liability', normal: 'credit', control: false },
  { code: '2400', name: 'Security Deposits Held', type: 'liability', subtype: 'current_liability', normal: 'credit', control: false },
  // Equity (3000–3999)
  { code: '3000', name: 'Equity', type: 'equity', subtype: null, normal: 'credit', control: false },
  { code: '3100', name: 'Paid-in Capital', type: 'equity', subtype: 'capital', normal: 'credit', control: false },
  { code: '3200', name: 'Retained Earnings', type: 'equity', subtype: 'retained_earnings', normal: 'credit', control: false },
  // Income (4000–4999)
  { code: '4000', name: 'Revenue', type: 'income', subtype: null, normal: 'credit', control: false },
  { code: '4100', name: 'Rental Income', type: 'income', subtype: 'revenue', normal: 'credit', control: false, parent: '4000' },
  { code: '4200', name: 'Service Charge Income', type: 'income', subtype: 'revenue', normal: 'credit', control: false, parent: '4000' },
  { code: '4300', name: 'Parking Income', type: 'income', subtype: 'revenue', normal: 'credit', control: false, parent: '4000' },
  { code: '4400', name: 'Penalty & Late Fee Income', type: 'income', subtype: 'revenue', normal: 'credit', control: false, parent: '4000' },
  { code: '4900', name: 'Other Income', type: 'income', subtype: 'other_income', normal: 'credit', control: false, parent: '4000' },
  // Expenses (5000–5999)
  { code: '5000', name: 'Operating Expenses', type: 'expense', subtype: null, normal: 'debit', control: false },
  { code: '5100', name: 'Maintenance & Repairs', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5200', name: 'Utilities', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5300', name: 'Insurance', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5400', name: 'Property Tax', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5500', name: 'Management Fees', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5600', name: 'Depreciation Expense', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5700', name: 'Salaries & Wages', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
  { code: '5900', name: 'Other Expenses', type: 'expense', subtype: 'operating', normal: 'debit', control: false, parent: '5000' },
];

class GlService {
  // ── Chart of Accounts ───────────────────────

  async getAccounts(companyId: string, filters: { accountType?: string; tree?: boolean }) {
    const where: any = { companyId, isActive: true };
    if (filters.accountType) where.accountType = filters.accountType;

    const accounts = await prisma.glAccount.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      include: { children: { where: { isActive: true }, orderBy: { code: 'asc' } } },
    });

    if (filters.tree) {
      // Return only root-level accounts (parentId null) with children nested
      return accounts.filter(a => !a.parentId);
    }
    return accounts;
  }

  async createAccount(companyId: string, data: any) {
    return prisma.glAccount.create({
      data: {
        companyId,
        parentId: data.parentId || null,
        code: data.code,
        name: data.name,
        accountType: data.accountType,
        accountSubtype: data.accountSubtype || null,
        normalBalance: data.normalBalance,
        isControl: data.isControl || false,
        description: data.description || null,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async updateAccount(id: string, companyId: string, data: any) {
    return prisma.glAccount.update({
      where: { id },
      data: {
        name: data.name,
        accountSubtype: data.accountSubtype,
        description: data.description,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
  }

  async seedDefaultCOA(companyId: string) {
    const existing = await prisma.glAccount.count({ where: { companyId } });
    if (existing > 0) {
      logger.info(`COA already seeded for company ${companyId}`);
      return { seeded: false, count: existing };
    }

    // First pass: create accounts without parents
    const codeToId: Record<string, string> = {};
    for (const a of DEFAULT_COA.filter(a => !(a as any).parent)) {
      const created = await prisma.glAccount.create({
        data: {
          companyId,
          code: a.code,
          name: a.name,
          accountType: a.type,
          accountSubtype: a.subtype,
          normalBalance: a.normal,
          isControl: a.control,
        },
      });
      codeToId[a.code] = created.id;
    }

    // Second pass: create child accounts
    for (const a of DEFAULT_COA.filter(a => (a as any).parent)) {
      const parentCode = (a as any).parent;
      const created = await prisma.glAccount.create({
        data: {
          companyId,
          parentId: codeToId[parentCode] || null,
          code: a.code,
          name: a.name,
          accountType: a.type,
          accountSubtype: a.subtype,
          normalBalance: a.normal,
          isControl: a.control,
        },
      });
      codeToId[a.code] = created.id;
    }

    logger.info(`Seeded ${DEFAULT_COA.length} GL accounts for company ${companyId}`);
    return { seeded: true, count: DEFAULT_COA.length };
  }

  // ── Fiscal Periods ──────────────────────────

  async getFiscalPeriods(companyId: string) {
    return prisma.fiscalPeriod.findMany({
      where: { companyId },
      orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'asc' }],
    });
  }

  async createFiscalPeriod(companyId: string, data: any) {
    return prisma.fiscalPeriod.create({
      data: {
        companyId,
        fiscalYear: data.fiscalYear,
        periodNumber: data.periodNumber,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
  }

  async generateFiscalYear(companyId: string, year: number) {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0);
      const name = start.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      months.push({
        companyId,
        fiscalYear: year,
        periodNumber: m + 1,
        name,
        startDate: start,
        endDate: end,
      });
    }
    const result = await prisma.fiscalPeriod.createMany({ data: months, skipDuplicates: true });
    return { created: result.count };
  }

  async closeFiscalPeriod(id: string, userId: string) {
    // Check no draft journals remain
    const period = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id } });
    const draftCount = await prisma.journalEntry.count({
      where: { fiscalPeriodId: id, status: 'draft' },
    });
    if (draftCount > 0) {
      throw new Error(`Cannot close period: ${draftCount} draft journal entries remain`);
    }
    return prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date(), closedBy: userId },
    });
  }

  async reopenFiscalPeriod(id: string) {
    return prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'open', closedAt: null, closedBy: null },
    });
  }

  // ── Journal Entries ─────────────────────────

  async getJournalEntries(companyId: string, params: any) {
    const where: any = { companyId };
    if (params.entryType) where.entryType = params.entryType;
    if (params.status) where.status = params.status;
    if (params.fiscalPeriodId) where.fiscalPeriodId = params.fiscalPeriodId;
    if (params.from || params.to) {
      where.entryDate = {};
      if (params.from) where.entryDate.gte = new Date(params.from);
      if (params.to) where.entryDate.lte = new Date(params.to);
    }

    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 20, 100);
    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { sortOrder: 'asc' } }, fiscalPeriod: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getJournalEntry(id: string, companyId: string) {
    return prisma.journalEntry.findFirstOrThrow({
      where: { id, companyId },
      include: {
        lines: { include: { account: { select: { code: true, name: true, accountType: true } } }, orderBy: { sortOrder: 'asc' } },
        fiscalPeriod: true,
      },
    });
  }

  async createJournalEntry(companyId: string, userId: string, data: any) {
    const entryDate = new Date(data.entryDate);

    // Find fiscal period
    const period = await prisma.fiscalPeriod.findFirst({
      where: {
        companyId,
        startDate: { lte: entryDate },
        endDate: { gte: entryDate },
        status: 'open',
      },
    });
    if (!period) throw new Error('No open fiscal period found for the entry date');

    // Resolve account codes to IDs
    const lines: any[] = [];
    let totalDebit = 0, totalCredit = 0;

    for (const line of data.lines) {
      const account = await prisma.glAccount.findFirst({
        where: { companyId, code: line.accountCode, isActive: true },
      });
      if (!account) throw new Error(`Account code ${line.accountCode} not found`);
      if (account.isControl && data.entryType !== 'manual') {
        // Allow control accounts for auto-posted entries
      } else if (account.isControl) {
        throw new Error(`Account ${line.accountCode} is a control account and cannot be used in manual entries`);
      }

      totalDebit += Number(line.debit) || 0;
      totalCredit += Number(line.credit) || 0;

      lines.push({
        accountId: account.id,
        description: line.description || '',
        debit: line.debit || 0,
        credit: line.credit || 0,
        propertyId: line.propertyId || null,
        departmentId: line.departmentId || null,
        sortOrder: lines.length,
      });
    }

    // Generate journal number
    const count = await prisma.journalEntry.count({ where: { companyId } });
    const journalNumber = `JE-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    return prisma.journalEntry.create({
      data: {
        companyId,
        journalNumber,
        entryDate,
        fiscalPeriodId: period.id,
        entryType: data.entryType || 'manual',
        description: data.description,
        referenceType: data.referenceType || null,
        referenceId: data.referenceId || null,
        totalDebit,
        totalCredit,
        createdBy: userId,
        lines: { create: lines },
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
  }

  async postJournalEntry(id: string, companyId: string, userId: string) {
    const je = await prisma.journalEntry.findFirstOrThrow({
      where: { id, companyId },
      include: { lines: true, fiscalPeriod: true },
    });

    if (je.status !== 'draft') throw new Error('Only draft entries can be posted');
    if (je.fiscalPeriod.status !== 'open') throw new Error('Fiscal period is not open');

    const totalDebit = je.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = je.lines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Journal is not balanced: Debit ${totalDebit} ≠ Credit ${totalCredit}`);
    }

    return prisma.journalEntry.update({
      where: { id },
      data: { status: 'posted', postedBy: userId, postedAt: new Date(), totalDebit, totalCredit },
    });
  }

  async reverseJournalEntry(id: string, companyId: string, userId: string) {
    const original = await prisma.journalEntry.findFirstOrThrow({
      where: { id, companyId, status: 'posted' },
      include: { lines: true },
    });

    // Create reversal entry directly (using accountId, not accountCode)
    const entryDate = new Date();
    const period = await prisma.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: entryDate }, endDate: { gte: entryDate }, status: 'open' },
    });
    if (!period) throw new Error('No open fiscal period for reversal date');

    const count = await prisma.journalEntry.count({ where: { companyId } });
    const journalNumber = `JE-${entryDate.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const reversalEntry = await prisma.journalEntry.create({
      data: {
        companyId,
        journalNumber,
        entryDate,
        fiscalPeriodId: period.id,
        entryType: 'adjustment',
        description: `Reversal of ${original.journalNumber}`,
        status: 'posted',
        isReversal: true,
        reversalOfId: original.id,
        totalDebit: Number(original.totalCredit),
        totalCredit: Number(original.totalDebit),
        postedBy: userId,
        postedAt: new Date(),
        createdBy: userId,
        lines: {
          create: original.lines.map((l, i) => ({
            accountId: l.accountId,
            description: `Reversal: ${l.description || ''}`,
            debit: Number(l.credit),
            credit: Number(l.debit),
            propertyId: l.propertyId,
            departmentId: l.departmentId,
            sortOrder: i,
          })),
        },
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });

    // Mark original as reversed
    await prisma.journalEntry.update({
      where: { id },
      data: { status: 'reversed', reversedById: reversalEntry.id },
    });

    return reversalEntry;
  }

  // ── Reports ─────────────────────────────────

  async getTrialBalance(companyId: string, params: { fromDate?: string; toDate?: string; propertyId?: string }) {
    const accounts = await prisma.glAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const where: any = {
      journalEntry: { companyId, status: 'posted' },
    };
    if (params.fromDate || params.toDate) {
      where.journalEntry.entryDate = {};
      if (params.fromDate) where.journalEntry.entryDate.gte = new Date(params.fromDate);
      if (params.toDate) where.journalEntry.entryDate.lte = new Date(params.toDate);
    }
    if (params.propertyId) where.propertyId = params.propertyId;

    const lines = await prisma.journalEntryLine.findMany({
      where,
      select: { accountId: true, debit: true, credit: true },
    });

    // Aggregate by account
    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const l of lines) {
      if (!balances[l.accountId]) balances[l.accountId] = { debit: 0, credit: 0 };
      balances[l.accountId].debit += Number(l.debit);
      balances[l.accountId].credit += Number(l.credit);
    }

    let totalDebit = 0, totalCredit = 0;
    const rows = accounts.map(a => {
      const b = balances[a.id] || { debit: 0, credit: 0 };
      const netBalance = a.normalBalance === 'debit'
        ? b.debit - b.credit
        : b.credit - b.debit;
      totalDebit += b.debit;
      totalCredit += b.credit;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        accountSubtype: a.accountSubtype,
        normalBalance: a.normalBalance,
        totalDebit: b.debit,
        totalCredit: b.credit,
        netBalance,
      };
    }).filter(r => r.totalDebit !== 0 || r.totalCredit !== 0);

    return {
      rows,
      summary: { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 },
      generatedAt: new Date().toISOString(),
    };
  }

  async getProfitAndLoss(companyId: string, params: { fromDate: string; toDate: string; propertyId?: string }) {
    const tb = await this.getTrialBalance(companyId, params);
    const income = tb.rows.filter(r => r.accountType === 'income');
    const expense = tb.rows.filter(r => r.accountType === 'expense');
    const totalIncome = income.reduce((s, r) => s + r.netBalance, 0);
    const totalExpense = expense.reduce((s, r) => s + r.netBalance, 0);
    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      period: params,
      generatedAt: new Date().toISOString(),
    };
  }

  async getBalanceSheet(companyId: string, params: { asOfDate: string; propertyId?: string }) {
    const tb = await this.getTrialBalance(companyId, { toDate: params.asOfDate, propertyId: params.propertyId });
    const assets = tb.rows.filter(r => r.accountType === 'asset');
    const liabilities = tb.rows.filter(r => r.accountType === 'liability');
    const equity = tb.rows.filter(r => r.accountType === 'equity');

    // Add retained earnings from P&L
    const incomeExpenseRows = tb.rows.filter(r => r.accountType === 'income' || r.accountType === 'expense');
    const retainedEarnings = incomeExpenseRows.reduce((s, r) => {
      return s + (r.accountType === 'income' ? r.netBalance : -r.netBalance);
    }, 0);

    const totalAssets = assets.reduce((s, r) => s + r.netBalance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.netBalance, 0);
    const totalEquity = equity.reduce((s, r) => s + r.netBalance, 0) + retainedEarnings;

    return {
      assets,
      liabilities,
      equity,
      retainedEarnings,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      asOfDate: params.asOfDate,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const glService = new GlService();
