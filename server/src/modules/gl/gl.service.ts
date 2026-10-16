import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

class GlService {
  // ── Department Centers ──────────────────────

  async getDepartmentCenters(companyId: string, filters?: { isActive?: boolean; search?: string }) {
    const where: any = { companyId };
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return prisma.departmentCenter.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        _count: { select: { costCenters: true, glAccounts: true } },
      },
    });
  }

  async createDepartmentCenter(companyId: string, data: any) {
    return prisma.departmentCenter.create({
      data: {
        companyId,
        code: data.code.trim(),
        name: data.name.trim(),
        description: data.description || null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
      include: {
        _count: { select: { costCenters: true, glAccounts: true } },
      },
    });
  }

  async updateDepartmentCenter(id: string, companyId: string, data: any) {
    const existing = await prisma.departmentCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Department Center not found');
    return prisma.departmentCenter.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code.trim() } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
      include: {
        _count: { select: { costCenters: true, glAccounts: true } },
      },
    });
  }

  async deleteDepartmentCenter(id: string, companyId: string) {
    const existing = await prisma.departmentCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Department Center not found');
    await prisma.departmentCenter.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Cost Centers ────────────────────────────

  async getCostCenters(companyId: string, filters?: { isActive?: boolean; departmentCenterId?: string; search?: string }) {
    const where: any = { companyId };
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.departmentCenterId) where.departmentCenterId = filters.departmentCenterId;
    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return prisma.costCenter.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        _count: { select: { glAccounts: true } },
      },
    });
  }

  async createCostCenter(companyId: string, data: any) {
    return prisma.costCenter.create({
      data: {
        companyId,
        code: data.code.trim(),
        name: data.name.trim(),
        departmentCenterId: data.departmentCenterId || null,
        description: data.description || null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        _count: { select: { glAccounts: true } },
      },
    });
  }

  async updateCostCenter(id: string, companyId: string, data: any) {
    const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Cost Center not found');
    return prisma.costCenter.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code.trim() } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.departmentCenterId !== undefined ? { departmentCenterId: data.departmentCenterId || null } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        _count: { select: { glAccounts: true } },
      },
    });
  }

  async deleteCostCenter(id: string, companyId: string) {
    const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Cost Center not found');
    await prisma.costCenter.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Chart of Accounts ───────────────────────

  async getAccounts(companyId: string, filters: { accountType?: string; tree?: boolean }) {
    const where: any = { companyId, isActive: true };
    if (filters.accountType) where.accountType = filters.accountType;

    const accounts = await prisma.glAccount.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        children: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          include: {
            departmentCenter: { select: { id: true, code: true, name: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
        },
      },
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
        departmentCenterId: data.departmentCenterId || null,
        costCenterId: data.costCenterId || null,
        code: data.code,
        name: data.name,
        accountType: data.accountType,
        accountSubtype: data.accountSubtype || null,
        normalBalance: data.normalBalance,
        isControl: data.isControl || false,
        description: data.description || null,
        sortOrder: data.sortOrder || 0,
      },
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async updateAccount(id: string, _companyId: string, data: any) {
    return prisma.glAccount.update({
      where: { id },
      data: {
        name: data.name,
        ...(data.departmentCenterId !== undefined ? { departmentCenterId: data.departmentCenterId || null } : {}),
        ...(data.costCenterId !== undefined ? { costCenterId: data.costCenterId || null } : {}),
        accountSubtype: data.accountSubtype,
        description: data.description,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    });
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
    const period = await prisma.fiscalPeriod.findUniqueOrThrow({ where: { id } });
    if (period.status === 'closed') throw new Error('Period is already closed');

    // 1. Check no draft journals remain
    const draftCount = await prisma.journalEntry.count({
      where: { fiscalPeriodId: id, status: 'draft' },
    });
    if (draftCount > 0) {
      throw new Error(`Cannot close period: ${draftCount} draft journal entries remain`);
    }

    // 2. Create auto-closing entries (Income/Expense → Retained Earnings)
    //    Debit all income accounts, credit all expense accounts, net to Retained Earnings
    const periodLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: { fiscalPeriodId: id, status: 'posted', companyId: period.companyId },
      },
      include: { account: { select: { id: true, code: true, name: true, accountType: true, normalBalance: true } } },
    });

    // Aggregate net balance per account for income/expense only
    const accountBalances: Record<string, { accountId: string; code: string; name: string; type: string; net: number }> = {};
    for (const line of periodLines) {
      const a = line.account;
      if (a.accountType !== 'income' && a.accountType !== 'expense') continue;
      if (!accountBalances[a.id]) {
        accountBalances[a.id] = { accountId: a.id, code: a.code, name: a.name, type: a.accountType, net: 0 };
      }
      accountBalances[a.id].net += Number(line.credit) - Number(line.debit);
    }

    const entries = Object.values(accountBalances).filter(b => Math.abs(b.net) > 0.01);
    const netIncome = entries.reduce((s, b) => s + b.net, 0);

    if (Math.abs(netIncome) > 0.01 && entries.length > 0) {
      // Post closing journal: zero out income/expense → retained earnings
      const closingLines: Array<{ accountCode: string; debit: number; credit: number; description?: string }> = [];

      for (const b of entries) {
        if (b.type === 'income') {
          // Income accounts have credit normal balance → debit to close
          closingLines.push({ accountCode: b.code, debit: Math.abs(b.net), credit: 0, description: `Close ${b.name}` });
        } else {
          // Expense accounts have debit normal balance → credit to close
          closingLines.push({ accountCode: b.code, debit: 0, credit: Math.abs(b.net), description: `Close ${b.name}` });
        }
      }

      // Net to Retained Earnings (3200)
      if (netIncome > 0) {
        closingLines.push({ accountCode: '3200', debit: 0, credit: netIncome, description: `Net income → Retained Earnings` });
      } else {
        closingLines.push({ accountCode: '3200', debit: Math.abs(netIncome), credit: 0, description: `Net loss → Retained Earnings` });
      }

      await this.postAutoJournal({
        companyId: period.companyId,
        entryDate: period.endDate,
        entryType: 'adjustment',
        description: `Period closing — ${period.name}`,
        referenceType: 'fiscal_period_close',
        referenceId: period.id,
        lines: closingLines,
      });

      logger.info(`Fiscal period ${period.name}: closing entries posted, net income = ${netIncome}`);
    }

    // 3. Close the period
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
    if (params.propertyId) where.lines = { some: { propertyId: params.propertyId } };
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
        include: { lines: { include: { account: { select: { code: true, name: true, accountType: true } } }, orderBy: { sortOrder: 'asc' } }, fiscalPeriod: { select: { name: true } } },
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
        propertyId: line.propertyId || data.propertyId || null,
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

  // ── Auto-Posting (for cross-module integration) ──

  /**
   * Creates and immediately posts a journal entry from another module.
   * Lines use accountCode (not accountId) — resolved internally.
   * Control-account restrictions are bypassed for auto-postings.
   * Silently returns null if no open fiscal period exists (graceful degradation).
   */
  async postAutoJournal(params: {
    companyId: string;
    entryDate: string | Date;
    entryType: string;  // 'ar_invoice' | 'ar_receipt' | 'depreciation' | etc.
    description: string;
    referenceType?: string;
    referenceId?: string;
    propertyId?: string;
    lines: Array<{ accountCode: string; debit: number; credit: number; description?: string }>;
  }) {
    try {
      const entryDate = new Date(params.entryDate);

      // Find open fiscal period
      const period = await prisma.fiscalPeriod.findFirst({
        where: {
          companyId: params.companyId,
          startDate: { lte: entryDate },
          endDate: { gte: entryDate },
          status: 'open',
        },
      });
      if (!period) {
        logger.warn(`GL auto-post skipped: no open fiscal period for ${entryDate.toISOString().split('T')[0]} (${params.entryType})`);
        return null;
      }

      // Resolve account codes to IDs
      const resolvedLines: any[] = [];
      let totalDebit = 0, totalCredit = 0;

      for (const line of params.lines) {
        const account = await prisma.glAccount.findFirst({
          where: { companyId: params.companyId, code: line.accountCode, isActive: true },
        });
        if (!account) {
          logger.warn(`GL auto-post: account code ${line.accountCode} not found, skipping journal`);
          return null;
        }
        totalDebit += line.debit;
        totalCredit += line.credit;
        resolvedLines.push({
          accountId: account.id,
          description: line.description || '',
          debit: line.debit,
          credit: line.credit,
          propertyId: params.propertyId || null,
          sortOrder: resolvedLines.length,
        });
      }

      // Validate balanced
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        logger.error(`GL auto-post: unbalanced journal (${totalDebit} vs ${totalCredit}) for ${params.description}`);
        return null;
      }

      // Generate journal number
      const count = await prisma.journalEntry.count({ where: { companyId: params.companyId } });
      const journalNumber = `JE-${entryDate.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const journal = await prisma.journalEntry.create({
        data: {
          companyId: params.companyId,
          journalNumber,
          entryDate,
          fiscalPeriodId: period.id,
          entryType: params.entryType,
          description: params.description,
          status: 'posted',
          referenceType: params.referenceType || null,
          referenceId: params.referenceId || null,
          totalDebit,
          totalCredit,
          postedAt: new Date(),
          createdBy: '00000000-0000-0000-0000-000000000000',
          lines: { create: resolvedLines },
        },
      });

      logger.info(`GL auto-posted: ${journalNumber} (${params.entryType}) — ${params.description}`);
      return journal;
    } catch (err: any) {
      logger.error(`GL auto-post failed for ${params.entryType}: ${err.message}`);
      return null;
    }
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

  async getProfitAndLoss(companyId: string, params: {
    fromDate: string; toDate: string; propertyId?: string;
    compareFromDate?: string; compareToDate?: string;
  }) {
    const tb = await this.getTrialBalance(companyId, params);
    const income = tb.rows.filter(r => r.accountType === 'income');
    const expense = tb.rows.filter(r => r.accountType === 'expense');
    const totalIncome = income.reduce((s, r) => s + r.netBalance, 0);
    const totalExpense = expense.reduce((s, r) => s + r.netBalance, 0);

    let comparison: any = null;
    if (params.compareFromDate && params.compareToDate) {
      const prevTb = await this.getTrialBalance(companyId, {
        fromDate: params.compareFromDate,
        toDate: params.compareToDate,
        propertyId: params.propertyId,
      });

      const prevBalances: Record<string, number> = {};
      for (const r of prevTb.rows) prevBalances[r.code] = r.netBalance;

      const prevIncome = prevTb.rows.filter(r => r.accountType === 'income');
      const prevExpense = prevTb.rows.filter(r => r.accountType === 'expense');
      const prevTotalIncome = prevIncome.reduce((s, r) => s + r.netBalance, 0);
      const prevTotalExpense = prevExpense.reduce((s, r) => s + r.netBalance, 0);

      const withVariance = (rows: typeof income) => rows.map(r => ({
        ...r,
        previousBalance: prevBalances[r.code] || 0,
        variance: r.netBalance - (prevBalances[r.code] || 0),
        variancePct: (prevBalances[r.code] || 0) !== 0
          ? ((r.netBalance - (prevBalances[r.code] || 0)) / Math.abs(prevBalances[r.code] || 1)) * 100
          : 0,
      }));

      comparison = {
        period: { fromDate: params.compareFromDate, toDate: params.compareToDate },
        income: withVariance(income),
        expense: withVariance(expense),
        prevTotalIncome,
        prevTotalExpense,
        prevNetProfit: prevTotalIncome - prevTotalExpense,
      };
    }

    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      period: { fromDate: params.fromDate, toDate: params.toDate },
      comparison,
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

  async getCashFlow(companyId: string, params: { fromDate: string; toDate: string; propertyId?: string }) {
    // Cash flow using indirect method
    // 1. Net income from P&L
    const pnl = await this.getProfitAndLoss(companyId, params);

    // 2. Get all posted journal entries in the period
    const where: any = {
      companyId,
      status: 'posted',
      entryDate: { gte: new Date(params.fromDate), lte: new Date(params.toDate) },
    };

    const journals = await prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: { account: { select: { code: true, name: true, accountType: true, accountSubtype: true } } },
        },
      },
    });

    // Categorize cash movements by entry type
    const cashAccountCodes = ['1200', '1210'];  // Cash & Bank accounts

    // Operating activities: AR receipts, AR invoices (non-cash AR changes)
    let operatingCashIn = 0;
    let operatingCashOut = 0;
    const operatingItems: Array<{ description: string; amount: number }> = [];

    // Investing activities: fixed asset purchases, disposals
    let investingCashIn = 0;
    let investingCashOut = 0;
    const investingItems: Array<{ description: string; amount: number }> = [];

    // Financing: equity contributions, loan proceeds
    let financingCashIn = 0;
    let financingCashOut = 0;
    const financingItems: Array<{ description: string; amount: number }> = [];

    for (const je of journals) {
      // Find cash lines in this journal (debit to cash = inflow, credit to cash = outflow)
      const cashLines = je.lines.filter(l => cashAccountCodes.includes(l.account.code));
      if (cashLines.length === 0) continue;

      const cashInflow = cashLines.reduce((s, l) => s + Number(l.debit), 0);
      const cashOutflow = cashLines.reduce((s, l) => s + Number(l.credit), 0);
      const netCash = cashInflow - cashOutflow;

      const item = { description: je.description, amount: netCash };

      switch (je.entryType) {
        case 'ar_receipt':
        case 'ar_invoice':
        case 'ap_payment':
        case 'ap_invoice':
        case 'manual':
        case 'adjustment':
          if (netCash > 0) operatingCashIn += netCash;
          else operatingCashOut += Math.abs(netCash);
          operatingItems.push(item);
          break;
        case 'depreciation':
          // Depreciation is non-cash, skip
          break;
        case 'bank_recon':
          if (netCash > 0) operatingCashIn += netCash;
          else operatingCashOut += Math.abs(netCash);
          operatingItems.push(item);
          break;
        default:
          // Check if related to fixed assets (investing) or equity (financing)
          const hasFixedAssetLines = je.lines.some(
            l => l.account.accountSubtype === 'fixed_asset' || l.account.accountSubtype === 'Non-Current Assets'
          );
          const hasEquityLines = je.lines.some(l => l.account.accountType === 'equity');

          if (hasFixedAssetLines) {
            if (netCash > 0) investingCashIn += netCash;
            else investingCashOut += Math.abs(netCash);
            investingItems.push(item);
          } else if (hasEquityLines) {
            if (netCash > 0) financingCashIn += netCash;
            else financingCashOut += Math.abs(netCash);
            financingItems.push(item);
          } else {
            if (netCash > 0) operatingCashIn += netCash;
            else operatingCashOut += Math.abs(netCash);
            operatingItems.push(item);
          }
      }
    }

    const netOperating = operatingCashIn - operatingCashOut;
    const netInvesting = investingCashIn - investingCashOut;
    const netFinancing = financingCashIn - financingCashOut;
    const netCashChange = netOperating + netInvesting + netFinancing;

    return {
      period: params,
      netIncome: pnl.netProfit,
      operating: {
        items: operatingItems,
        cashIn: operatingCashIn,
        cashOut: operatingCashOut,
        net: netOperating,
      },
      investing: {
        items: investingItems,
        cashIn: investingCashIn,
        cashOut: investingCashOut,
        net: netInvesting,
      },
      financing: {
        items: financingItems,
        cashIn: financingCashIn,
        cashOut: financingCashOut,
        net: netFinancing,
      },
      netCashChange,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const glService = new GlService();
