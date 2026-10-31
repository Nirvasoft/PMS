import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { AppError } from '../../common/errors';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

const DEFAULT_PAYMENT_METHODS = [
  { code: 'BANK_TRANSFER', name: 'Bank Transfer', isSystem: true, isActive: true },
  { code: 'CHEQUE', name: 'Cheque', isSystem: true, isActive: true },
  { code: 'CASH', name: 'Cash', isSystem: true, isActive: true },
  { code: 'ONLINE', name: 'Online', isSystem: true, isActive: true },
  { code: 'GIRO', name: 'GIRO', isSystem: true, isActive: true },
  { code: 'CREDIT_CARD', name: 'Credit Card', isSystem: true, isActive: true },
];

const seededPaymentMethodScopes = new Set<string>();

async function ensurePaymentMethodsTable(companyId: string, propertyId?: string | null) {
  await ensurePropertySetupScope();

  const effectivePropertyId = propertyId?.trim() || (await resolveEffectivePropertyId(companyId));
  const scopeKey = companyId;

  if (companyId && !seededPaymentMethodScopes.has(scopeKey)) {
    try {
      // Seed default payment methods only once for the company's initial property
      // Seed default payment methods only once for the company's initial property

      const count = await prisma.paymentMethod.count({ where: { companyId } });
      if (count === 0) {
        await prisma.paymentMethod.createMany({
          data: DEFAULT_PAYMENT_METHODS.map((pm) => ({
            companyId,
            propertyId: effectivePropertyId,
            code: pm.code,
            name: pm.name,
            isSystem: pm.isSystem,
            isActive: pm.isActive,
          })),
          skipDuplicates: true,
        });
      }
      seededPaymentMethodScopes.add(scopeKey);
    } catch (err) {
      logger.warn('Could not seed default payment methods automatically', err);
    }
  }
}

const paymentMethodInclude = {
  departmentCenter: { select: { id: true, code: true, name: true } },
  costCenter: { select: { id: true, code: true, name: true } },
};

class GlService {
  // ── Department Centers ──────────────────────

  async getDepartmentCenters(
    companyId: string,
    filters?: { propertyId?: string; isActive?: boolean; search?: string },
  ) {
    await ensurePropertySetupScope();
    const effectivePropertyId = filters?.propertyId?.trim() || (await resolveEffectivePropertyId(companyId)); const where: any = { companyId, ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}) };
    if (filters?.propertyId) where.propertyId = filters.propertyId;
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
    await ensurePropertySetupScope();
    const code = data.code.trim();
    const propertyId = await resolveEffectivePropertyId(companyId, data.propertyId);

    const duplicate = await prisma.departmentCenter.findFirst({
      where: {
        companyId,
        propertyId,
        code: { equals: code, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw AppError.conflict(`Department code "${code}" already exists for this property`);
    }

    return prisma.departmentCenter.create({
      data: {
        companyId,
        propertyId,
        code,
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
    await ensurePropertySetupScope();
    const existing = await prisma.departmentCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Department not found');

    const targetPropertyId =
      data.propertyId !== undefined ? (data.propertyId || null) : existing.propertyId;

    if (data.code !== undefined) {
      const nextCode = data.code.trim();
      const duplicate = await prisma.departmentCenter.findFirst({
        where: {
          companyId,
          propertyId: targetPropertyId,
          id: { not: id },
          code: { equals: nextCode, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw AppError.conflict(`Department code "${nextCode}" already exists for this property`);
      }
    }

    return prisma.departmentCenter.update({
      where: { id },
      data: {
        ...(data.propertyId !== undefined ? { propertyId: targetPropertyId } : {}),
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
    await ensurePropertySetupScope();
    const existing = await prisma.departmentCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Department not found');
    await prisma.departmentCenter.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Cost Centers ────────────────────────────

  async getCostCenters(
    companyId: string,
    filters?: { propertyId?: string; isActive?: boolean; departmentCenterId?: string; search?: string },
  ) {
    await ensurePropertySetupScope();
    const effectivePropertyId = filters?.propertyId?.trim() || (await resolveEffectivePropertyId(companyId)); const where: any = { companyId, ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}) };
    if (filters?.propertyId) where.propertyId = filters.propertyId;
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
    await ensurePropertySetupScope();
    const code = data.code.trim();
    const propertyId = await resolveEffectivePropertyId(companyId, data.propertyId);

    const duplicate = await prisma.costCenter.findFirst({
      where: {
        companyId,
        propertyId,
        code: { equals: code, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw AppError.conflict(`Cost Center code "${code}" already exists for this property`);
    }

    return prisma.costCenter.create({
      data: {
        companyId,
        propertyId,
        code,
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
    await ensurePropertySetupScope();
    const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Cost Center not found');

    const targetPropertyId =
      data.propertyId !== undefined ? (data.propertyId || null) : existing.propertyId;

    if (data.code !== undefined) {
      const nextCode = data.code.trim();
      const duplicate = await prisma.costCenter.findFirst({
        where: {
          companyId,
          propertyId: targetPropertyId,
          id: { not: id },
          code: { equals: nextCode, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw AppError.conflict(`Cost Center code "${nextCode}" already exists for this property`);
      }
    }

    return prisma.costCenter.update({
      where: { id },
      data: {
        ...(data.propertyId !== undefined ? { propertyId: targetPropertyId } : {}),
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
    await ensurePropertySetupScope();
    const existing = await prisma.costCenter.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Cost Center not found');
    await prisma.costCenter.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Payment Methods ─────────────────────────

  async getPaymentMethods(
    companyId: string,
    filters?: { propertyId?: string; isActive?: boolean; search?: string },
  ) {
    await ensurePaymentMethodsTable(companyId, filters?.propertyId);

    const effectivePropertyId = filters?.propertyId?.trim() || (await resolveEffectivePropertyId(companyId)); const where: any = { companyId, ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}) };
    if (filters?.propertyId) where.propertyId = filters.propertyId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
        { glAccountCode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return prisma.paymentMethod.findMany({
      where,
      include: paymentMethodInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async resolvePaymentMethodConfig(
    companyId: string,
    codeOrName?: string | null,
    propertyId?: string | null,
  ) {
    if (!codeOrName) return null;
    await ensurePaymentMethodsTable(companyId, propertyId);
    const normalized = codeOrName.trim();

    if (propertyId) {
      const byProperty = await prisma.paymentMethod.findFirst({
        where: {
          companyId,
          propertyId,
          OR: [
            { code: { equals: normalized, mode: 'insensitive' } },
            { name: { equals: normalized, mode: 'insensitive' } },
          ],
        },
        include: paymentMethodInclude,
      });
      if (byProperty) return byProperty; return prisma.paymentMethod.findFirst({ where: { companyId, propertyId: null, OR: [{ code: { equals: normalized, mode: 'insensitive' } }, { name: { equals: normalized, mode: 'insensitive' } }] }, include: paymentMethodInclude });
    }

    return prisma.paymentMethod.findFirst({
      where: {
        companyId,
        OR: [
          { code: { equals: normalized, mode: 'insensitive' } },
          { name: { equals: normalized, mode: 'insensitive' } },
        ],
      },
      include: paymentMethodInclude,
    });
  }

  async createPaymentMethod(companyId: string, data: any) {
    const propertyId = await resolveEffectivePropertyId(companyId, data.propertyId);
    await ensurePaymentMethodsTable(companyId, propertyId);

    const code = data.code.trim().toUpperCase();
    const existing = await prisma.paymentMethod.findFirst({
      where: {
        companyId,
        propertyId,
        code: { equals: code, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw AppError.conflict(`Payment method code "${code}" already exists`);
    }

    return prisma.paymentMethod.create({
      data: {
        companyId,
        propertyId,
        code,
        name: data.name.trim(),
        glAccountCode: data.glAccountCode?.trim() || null,
        departmentCenterId: data.departmentCenterId || null,
        costCenterId: data.costCenterId || null,
        isActive: data.isActive ?? true,
        isSystem: false,
      },
      include: paymentMethodInclude,
    });
  }

  async updatePaymentMethod(id: string, companyId: string, data: any) {
    await ensurePropertySetupScope();

    const existing = await prisma.paymentMethod.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Payment method');

    const targetPropertyId =
      data.propertyId !== undefined ? (data.propertyId || null) : existing.propertyId;

    if (data.code !== undefined) {
      const nextCode = data.code.trim().toUpperCase();
      const duplicate = await prisma.paymentMethod.findFirst({
        where: {
          companyId,
          propertyId: targetPropertyId,
          id: { not: id },
          code: { equals: nextCode, mode: 'insensitive' },
        },
      });
      if (duplicate) {
        throw AppError.conflict(`Payment method code "${nextCode}" already exists`);
      }
    }

    return prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(data.propertyId !== undefined ? { propertyId: targetPropertyId } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.glAccountCode !== undefined ? { glAccountCode: data.glAccountCode?.trim() || null } : {}),
        ...(data.departmentCenterId !== undefined ? { departmentCenterId: data.departmentCenterId || null } : {}),
        ...(data.costCenterId !== undefined ? { costCenterId: data.costCenterId || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: paymentMethodInclude,
    });
  }

  async deletePaymentMethod(id: string, companyId: string) {
    await ensurePropertySetupScope();

    const existing = await prisma.paymentMethod.findFirst({ where: { id, companyId } });
    if (!existing) throw AppError.notFound('Payment method');
    await prisma.paymentMethod.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Chart of Accounts ───────────────────────

  async getAccounts(
    companyId: string,
    filters: { propertyId?: string; accountType?: string; tree?: boolean },
  ) {
    await ensurePropertySetupScope();
    const where: any = { companyId, isActive: true };
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.accountType) where.accountType = filters.accountType;

    const childrenWhere: any = { isActive: true };
    if (filters.propertyId) childrenWhere.propertyId = filters.propertyId;

    const accounts = await prisma.glAccount.findMany({
      where,
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        children: {
          where: childrenWhere,
          orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
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
    await ensurePropertySetupScope();

    const code = data.code.trim();
    const propertyId = await resolveEffectivePropertyId(companyId, data.propertyId);
    const departmentCenterId = data.departmentCenterId || null;
    const costCenterId = data.costCenterId || null;

    const existing = await prisma.glAccount.findFirst({
      where: {
        companyId,
        propertyId,
        code: { equals: code, mode: 'insensitive' },
        departmentCenterId,
        costCenterId,
      },
    });
    if (existing) {
      throw AppError.conflict(
        'A record with this Account Code, Department, and Cost Center already exists',
      );
    }

    return prisma.glAccount.create({
      data: {
        companyId,
        propertyId,
        parentId: data.parentId || null,
        departmentCenterId,
        costCenterId,
        code,
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

  async updateAccount(id: string, companyId: string, data: any) {
    await ensurePropertySetupScope();

    const current = await prisma.glAccount.findFirst({ where: { id, companyId } });
    if (!current) throw AppError.notFound('Account');

    const targetPropertyId =
      data.propertyId !== undefined ? (data.propertyId || null) : current.propertyId;
    const nextDepartmentCenterId =
      data.departmentCenterId !== undefined ? (data.departmentCenterId || null) : current.departmentCenterId;
    const nextCostCenterId =
      data.costCenterId !== undefined ? (data.costCenterId || null) : current.costCenterId;

    const duplicate = await prisma.glAccount.findFirst({
      where: {
        companyId,
        propertyId: targetPropertyId,
        id: { not: id },
        code: { equals: current.code, mode: 'insensitive' },
        departmentCenterId: nextDepartmentCenterId,
        costCenterId: nextCostCenterId,
      },
    });
    if (duplicate) {
      throw AppError.conflict(
        'A record with this Account Code, Department, and Cost Center already exists',
      );
    }

    return prisma.glAccount.update({
      where: { id },
      data: {
        ...(data.propertyId !== undefined ? { propertyId: targetPropertyId } : {}),
        name: data.name,
        ...(data.departmentCenterId !== undefined ? { departmentCenterId: nextDepartmentCenterId } : {}),
        ...(data.costCenterId !== undefined ? { costCenterId: nextCostCenterId } : {}),
        ...(data.accountType !== undefined ? { accountType: data.accountType } : {}),
        accountSubtype: data.accountSubtype,
        ...(data.normalBalance !== undefined ? { normalBalance: data.normalBalance } : {}),
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
        journalEntry: { fiscalPeriodId: id, status: { in: ['posted', 'reversed'] }, companyId: period.companyId },
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
    const andConditions: any[] = [];
    if (params.entryType) where.entryType = params.entryType;
    if (params.status) where.status = params.status;
    if (params.fiscalPeriodId) where.fiscalPeriodId = params.fiscalPeriodId;
    if (params.propertyId) {
      andConditions.push({ lines: { some: { propertyId: params.propertyId } } });
    }
    if (params.from || params.to) {
      where.entryDate = {};
      if (params.from) where.entryDate.gte = new Date(params.from);
      if (params.to) where.entryDate.lte = new Date(params.to);
    }
    const q = typeof params.search === 'string' ? params.search.trim() : '';
    if (q) {
      andConditions.push({
        OR: [
          { journalNumber: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { entryType: { contains: q, mode: 'insensitive' } },
          {
            lines: {
              some: {
                OR: [
                  { description: { contains: q, mode: 'insensitive' } },
                  {
                    departmentCenter: {
                      OR: [
                        { code: { contains: q, mode: 'insensitive' } },
                        { name: { contains: q, mode: 'insensitive' } },
                      ],
                    },
                  },
                  {
                    costCenter: {
                      OR: [
                        { code: { contains: q, mode: 'insensitive' } },
                        { name: { contains: q, mode: 'insensitive' } },
                      ],
                    },
                  },
                  {
                    account: {
                      OR: [
                        { code: { contains: q, mode: 'insensitive' } },
                        { name: { contains: q, mode: 'insensitive' } },
                        {
                          departmentCenter: {
                            OR: [
                              { code: { contains: q, mode: 'insensitive' } },
                              { name: { contains: q, mode: 'insensitive' } },
                            ],
                          },
                        },
                        {
                          costCenter: {
                            OR: [
                              { code: { contains: q, mode: 'insensitive' } },
                              { name: { contains: q, mode: 'insensitive' } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 20, 100);
    const journalLineInclude = {
      departmentCenter: { select: { id: true, code: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      account: {
        select: {
          id: true,
          code: true,
          name: true,
          accountType: true,
          departmentCenterId: true,
          costCenterId: true,
          departmentCenter: { select: { id: true, code: true, name: true } },
          costCenter: { select: { id: true, code: true, name: true } },
        },
      },
    };
    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: { include: journalLineInclude, orderBy: { sortOrder: 'asc' } },
          fiscalPeriod: { select: { name: true } },
        },
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
        lines: {
          include: {
            departmentCenter: { select: { id: true, code: true, name: true } },
            costCenter: { select: { id: true, code: true, name: true } },
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                accountType: true,
                departmentCenterId: true,
                costCenterId: true,
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        fiscalPeriod: true,
      },
    });
  }

  /**
   * Resolves a GL Account matching the requested accountId / accountCode and
   * Department / Cost Center. For AR Invoice Debit lines (`isArDebit = true`),
   * prioritizes an AR Account linked to the Invoice's Department and Cost Center.
   */
  async resolveGlAccount(params: {
    companyId: string;
    propertyId?: string | null;
    accountId?: string | null;
    accountCode: string;
    departmentCenterId?: string | null;
    costCenterId?: string | null;
    isArDebit?: boolean;
  }) {
    await ensurePropertySetupScope();
    const { companyId, propertyId, accountId, accountCode, departmentCenterId, costCenterId, isArDebit } = params;
    const normalizedCode = (accountCode || '').trim();

    if (accountId) {
      const byId = await prisma.glAccount.findFirst({
        where: { id: accountId, companyId, isActive: true },
      });
      if (byId) return byId;
    }

    const allAccounts = await prisma.glAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
    });

    const isCodeMatch = (a: any) =>
      (a.code || '').trim().toLowerCase() === normalizedCode.toLowerCase();

    const isArCandidate = (a: any) => {
      if (a.accountType !== 'asset') return false;
      if (isCodeMatch(a)) return true;
      const code = (a.code || '').trim();
      const name = (a.name || '').toLowerCase();
      const subtype = (a.accountSubtype || '').toLowerCase();
      if (name.includes('receivable') || /\ba\/?r\b/i.test(a.name || '')) return true;
      if (subtype.includes('receivable')) return true;
      if (a.isControl) return true;
      if (code.startsWith('11')) return true;
      return false;
    };

    const deptId = departmentCenterId || null;
    const ccId = costCenterId || null;

    const findFromPool = (activeAccounts: typeof allAccounts) => {
      if (isArDebit) {
        // 1. Exact Department + Cost Center match on AR account
        if (deptId && ccId) {
          const exactCodeAndDeptCc = activeAccounts.find(
            (a) => isCodeMatch(a) && a.departmentCenterId === deptId && a.costCenterId === ccId,
          );
          if (exactCodeAndDeptCc) return exactCodeAndDeptCc;

          const arByDeptCc = activeAccounts.find(
            (a) => isArCandidate(a) && a.departmentCenterId === deptId && a.costCenterId === ccId,
          );
          if (arByDeptCc) return arByDeptCc;
        }

        // 2. Department match
        if (deptId) {
          const codeDeptNullCc = activeAccounts.find(
            (a) => isCodeMatch(a) && a.departmentCenterId === deptId && !a.costCenterId,
          );
          if (codeDeptNullCc) return codeDeptNullCc;

          const arDeptNullCc = activeAccounts.find(
            (a) => isArCandidate(a) && a.departmentCenterId === deptId && !a.costCenterId,
          );
          if (arDeptNullCc) return arDeptNullCc;

          const codeDeptAny = activeAccounts.find(
            (a) => isCodeMatch(a) && a.departmentCenterId === deptId,
          );
          if (codeDeptAny) return codeDeptAny;

          const arDeptAny = activeAccounts.find(
            (a) => isArCandidate(a) && a.departmentCenterId === deptId,
          );
          if (arDeptAny) return arDeptAny;
        }

        // 3. Cost Center match (when department wasn't specified)
        if (ccId && !deptId) {
          const codeCcNullDept = activeAccounts.find(
            (a) => isCodeMatch(a) && a.costCenterId === ccId && !a.departmentCenterId,
          );
          if (codeCcNullDept) return codeCcNullDept;

          const arCcNullDept = activeAccounts.find(
            (a) => isArCandidate(a) && a.costCenterId === ccId && !a.departmentCenterId,
          );
          if (arCcNullDept) return arCcNullDept;

          const codeCcAny = activeAccounts.find(
            (a) => isCodeMatch(a) && a.costCenterId === ccId,
          );
          if (codeCcAny) return codeCcAny;

          const arCcAny = activeAccounts.find(
            (a) => isArCandidate(a) && a.costCenterId === ccId,
          );
          if (arCcAny) return arCcAny;
        }

        // 4. Fallback: unlinked AR account with matching code, then any matching code, then any AR candidate
        return (
          activeAccounts.find((a) => isCodeMatch(a) && !a.departmentCenterId && !a.costCenterId) ||
          activeAccounts.find((a) => isCodeMatch(a)) ||
          activeAccounts.find((a) => isArCandidate(a) && !a.departmentCenterId && !a.costCenterId) ||
          activeAccounts.find((a) => isArCandidate(a)) ||
          null
        );
      }

      // Standard account resolution: match code + dept/cc first
      if (deptId && ccId) {
        const exact = activeAccounts.find(
          (a) => isCodeMatch(a) && a.departmentCenterId === deptId && a.costCenterId === ccId,
        );
        if (exact) return exact;
      }
      if (deptId) {
        const byDeptNullCc = activeAccounts.find(
          (a) => isCodeMatch(a) && a.departmentCenterId === deptId && !a.costCenterId,
        );
        if (byDeptNullCc) return byDeptNullCc;

        const byDeptAny = activeAccounts.find(
          (a) => isCodeMatch(a) && a.departmentCenterId === deptId,
        );
        if (byDeptAny) return byDeptAny;
      }
      if (ccId && !deptId) {
        const byCcNullDept = activeAccounts.find(
          (a) => isCodeMatch(a) && a.costCenterId === ccId && !a.departmentCenterId,
        );
        if (byCcNullDept) return byCcNullDept;

        const byCcAny = activeAccounts.find(
          (a) => isCodeMatch(a) && a.costCenterId === ccId,
        );
        if (byCcAny) return byCcAny;
      }

      return (
        activeAccounts.find((a) => isCodeMatch(a) && !a.departmentCenterId && !a.costCenterId) ||
        activeAccounts.find((a) => isCodeMatch(a)) ||
        null
      );
    };

    if (propertyId) {
      const propertyPool = allAccounts.filter((a) => a.propertyId === propertyId);
      const fromProperty = findFromPool(propertyPool);
      if (fromProperty) return fromProperty;
    }

    return findFromPool(allAccounts);
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
      const account = await this.resolveGlAccount({
        companyId,
        propertyId: line.propertyId || data.propertyId || null,
        accountId: line.accountId,
        accountCode: line.accountCode,
        departmentCenterId: line.departmentCenterId,
        costCenterId: line.costCenterId,
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
        departmentCenterId: account.departmentCenterId ?? line.departmentCenterId ?? null,
        costCenterId: account.costCenterId ?? line.costCenterId ?? null,
        description: line.description || '',
        debit: line.debit || 0,
        credit: line.credit || 0,
        propertyId: line.propertyId || data.propertyId || null,
        departmentId: line.departmentId || null,
        sortOrder: lines.length,
      });
    }

    // Generate journal number
    const journalNumber = await this.generateJournalNumber(companyId, new Date().getFullYear());

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
      include: {
        lines: {
          include: {
            departmentCenter: { select: { id: true, code: true, name: true } },
            costCenter: { select: { id: true, code: true, name: true } },
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                accountType: true,
                departmentCenterId: true,
                costCenterId: true,
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
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
      include: { lines: { include: { account: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (original.isReversal) {
      throw new Error('Cannot reverse a reversal journal entry');
    }

    // Create reversal entry directly (using accountId, not accountCode)
    const todayDate = new Date(new Date().toISOString().split('T')[0]);
    let entryDate = todayDate;
    let period = await prisma.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: todayDate }, endDate: { gte: todayDate }, status: 'open' },
    });
    if (!period) {
      period = await prisma.fiscalPeriod.findFirst({
        where: { companyId, startDate: { lte: original.entryDate }, endDate: { gte: original.entryDate }, status: 'open' },
      });
      if (period) entryDate = original.entryDate;
    }
    if (!period) {
      period = await prisma.fiscalPeriod.findFirst({
        where: { id: original.fiscalPeriodId, companyId, status: 'open' },
      });
      if (period) entryDate = original.entryDate;
    }
    if (!period) throw new Error('No open fiscal period for reversal date');

    const journalNumber = await this.generateJournalNumber(companyId, entryDate.getFullYear());

    const reversalEntry = await prisma.journalEntry.create({
      data: {
        companyId,
        journalNumber,
        entryDate,
        fiscalPeriodId: period.id,
        entryType: 'adjustment',
        description: `Reversal of ${original.journalNumber} — ${original.description}`,
        status: 'posted',
        referenceType: original.referenceType,
        referenceId: original.referenceId,
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
            departmentCenterId: l.departmentCenterId ?? l.account?.departmentCenterId ?? null,
            costCenterId: l.costCenterId ?? l.account?.costCenterId ?? null,
            description: `Reversal: ${l.description || ''}`,
            debit: Number(l.credit),
            credit: Number(l.debit),
            propertyId: l.propertyId,
            departmentId: l.departmentId,
            sortOrder: i,
          })),
        },
      },
      include: {
        lines: {
          include: {
            departmentCenter: { select: { id: true, code: true, name: true } },
            costCenter: { select: { id: true, code: true, name: true } },
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                accountType: true,
                departmentCenterId: true,
                costCenterId: true,
                departmentCenter: { select: { id: true, code: true, name: true } },
                costCenter: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });

    // Mark original as reversed
    await prisma.journalEntry.update({
      where: { id },
      data: { status: 'reversed', reversedById: reversalEntry.id },
    });

    return reversalEntry;
  }

  private async generateJournalNumber(companyId: string, year: number): Promise<string> {
    const prefix = `JE-${year}-`;
    const [count, latestByNum, latestByCreated] = await Promise.all([
      prisma.journalEntry.count({ where: { companyId } }),
      prisma.journalEntry.findFirst({
        where: { companyId, journalNumber: { startsWith: prefix } },
        orderBy: { journalNumber: 'desc' },
        select: { journalNumber: true },
      }),
      prisma.journalEntry.findFirst({
        where: { companyId, journalNumber: { startsWith: prefix } },
        orderBy: { createdAt: 'desc' },
        select: { journalNumber: true },
      }),
    ]);

    let nextNum = count + 1;
    for (const row of [latestByNum, latestByCreated]) {
      if (row?.journalNumber) {
        const m = row.journalNumber.match(/^JE-\d{4}-(\d+)$/);
        if (m) {
          const seq = parseInt(m[1], 10);
          if (seq >= nextNum) {
            nextNum = seq + 1;
          }
        }
      }
    }

    while (true) {
      const candidate = `${prefix}${String(nextNum).padStart(5, '0')}`;
      const exists = await prisma.journalEntry.findFirst({
        where: { companyId, journalNumber: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      nextNum++;
    }
  }

  // ── Auto-Posting (for cross-module integration) ──

  /**
   * Creates and immediately posts a journal entry from another module.
   * Lines use accountCode (or accountId) and optional departmentCenterId/costCenterId — resolved internally.
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
    departmentCenterId?: string | null;
    costCenterId?: string | null;
    lines: Array<{
      accountId?: string | null;
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
      departmentCenterId?: string | null;
      costCenterId?: string | null;
    }>;
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
        const lineDeptId = line.departmentCenterId ?? params.departmentCenterId ?? null;
        const lineCcId = line.costCenterId ?? params.costCenterId ?? null;
        const isArDebit = params.entryType === 'ar_invoice' && line.debit > 0;

        let account = await this.resolveGlAccount({
          companyId: params.companyId,
          propertyId: params.propertyId || null,
          accountId: line.accountId,
          accountCode: line.accountCode,
          departmentCenterId: lineDeptId,
          costCenterId: lineCcId,
          isArDebit,
        });
        if (!account && params.entryType === 'ar_invoice' && line.credit > 0 && line.accountCode !== '4100') {
          logger.warn(`GL auto-post: account code ${line.accountCode} not found, falling back to 4100`);
          account = await this.resolveGlAccount({
            companyId: params.companyId,
            propertyId: params.propertyId || null,
            accountCode: '4100',
            departmentCenterId: lineDeptId,
            costCenterId: lineCcId,
          });
        }
        if (!account) {
          logger.warn(`GL auto-post: account code ${line.accountCode} not found, skipping journal`);
          return null;
        }
        totalDebit += line.debit;
        totalCredit += line.credit;
        resolvedLines.push({
          accountId: account.id,
          departmentCenterId: account.departmentCenterId ?? lineDeptId ?? null,
          costCenterId: account.costCenterId ?? lineCcId ?? null,
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
      const journalNumber = await this.generateJournalNumber(params.companyId, entryDate.getFullYear());

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
    await ensurePropertySetupScope();
    const accounts = await prisma.glAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const where: any = {
      journalEntry: { companyId, status: { in: ['posted', 'reversed'] } },
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

  async getDetailedTrialBalance(
    companyId: string,
    params: {
      mode?: 'period' | 'date';
      fiscalYear?: number;
      periodFrom?: string;
      periodTo?: string;
      fromDate?: string;
      toDate?: string;
      category?: string;
      includeZero?: boolean;
      allAccounts?: boolean;
      accountFrom?: string;
      accountTo?: string;
      costCenterId?: string;
      departmentCenterId?: string;
      propertyId?: string;
    },
  ) {
    await ensurePropertySetupScope();

    const mode = params.mode === 'date' ? 'date' : 'period';
    const now = new Date();
    const year = params.fiscalYear || now.getFullYear();

    let effectiveFromDate: Date;
    let effectiveToDate: Date;
    let isOpeningOnly = false;
    let periodLabel = '';

    if (mode === 'period') {
      const pFrom = (params.periodFrom || 'OPENING').toUpperCase();
      const pTo = (params.periodTo || 'OPENING').toUpperCase();

      const fiscalPeriods = await prisma.fiscalPeriod.findMany({
        where: { companyId, fiscalYear: year },
        orderBy: { periodNumber: 'asc' },
      });

      const resolvePeriodBounds = (pVal: string) => {
        if (pVal === 'OPENING') {
          const firstStart = fiscalPeriods[0]?.startDate
            ? new Date(fiscalPeriods[0].startDate)
            : new Date(Date.UTC(year, 0, 1, 0, 0, 0));
          return { start: firstStart, end: firstStart, label: 'Opening' };
        }
        const pNum = Math.max(1, Math.min(12, parseInt(pVal, 10) || 1));
        const found = fiscalPeriods.find(fp => fp.periodNumber === pNum);
        if (found) {
          return {
            start: new Date(found.startDate),
            end: new Date(found.endDate),
            label: found.name,
          };
        }
        const start = new Date(Date.UTC(year, pNum - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(year, pNum, 0, 23, 59, 59, 999));
        const label = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        return { start, end, label };
      };

      const fromBounds = resolvePeriodBounds(pFrom);
      const toBounds = resolvePeriodBounds(pTo);

      if (pFrom === 'OPENING' && pTo === 'OPENING') {
        isOpeningOnly = true;
        effectiveFromDate = fromBounds.start;
        effectiveToDate = fromBounds.start;
        periodLabel = 'Opening - Opening';
      } else {
        effectiveFromDate = fromBounds.start <= toBounds.start ? fromBounds.start : toBounds.start;
        effectiveToDate = toBounds.end >= fromBounds.end ? toBounds.end : fromBounds.end;
        effectiveToDate.setUTCHours(23, 59, 59, 999);
        periodLabel = `${fromBounds.label} - ${toBounds.label}`;
      }
    } else {
      const rawFrom = params.fromDate || `${year}-01-01`;
      const rawTo = params.toDate || now.toISOString().split('T')[0];
      effectiveFromDate = new Date(`${rawFrom}T00:00:00.000Z`);
      effectiveToDate = new Date(`${rawTo}T23:59:59.999Z`);
      periodLabel = `${rawFrom} - ${rawTo}`;
    }

    const allAccounts = await prisma.glAccount.findMany({
      where: {
        companyId,
        isActive: true,
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
      },
      include: {
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
    });

    const categoryFilter = (params.category || '').trim().toLowerCase();
    const useAllAccounts = params.allAccounts !== false;
    const accFrom = (params.accountFrom || '').trim();
    const accTo = (params.accountTo || '').trim();

    const filteredAccounts = allAccounts.filter(a => {
      if (categoryFilter && categoryFilter !== 'all') {
        const typeMatch = (a.accountType || '').toLowerCase() === categoryFilter;
        const subMatch = (a.accountSubtype || '').toLowerCase() === categoryFilter;
        const nameMatch = (a.name || '').toLowerCase() === categoryFilter;
        if (!typeMatch && !subMatch && !nameMatch) return false;
      }
      if (!useAllAccounts) {
        if (accFrom && a.code.localeCompare(accFrom, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
          return false;
        }
        if (accTo && a.code.localeCompare(accTo, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
          return false;
        }
      }
      return true;
    });

    const accountIds = filteredAccounts.map(a => a.id);

    const lineWhereBase: any = {
      accountId: { in: accountIds.length > 0 ? accountIds : ['00000000-0000-0000-0000-000000000000'] },
      journalEntry: {
        companyId,
        status: { in: ['posted', 'reversed'] },
        entryDate: { lte: effectiveToDate },
      },
    };

    if (params.propertyId) {
      lineWhereBase.propertyId = params.propertyId;
    }
    if (params.departmentCenterId) {
      lineWhereBase.OR = [
        { departmentCenterId: params.departmentCenterId },
        { departmentCenterId: null, account: { departmentCenterId: params.departmentCenterId } },
      ];
    }
    if (params.costCenterId) {
      const ccCond = [
        { costCenterId: params.costCenterId },
        { costCenterId: null, account: { costCenterId: params.costCenterId } },
      ];
      if (lineWhereBase.OR) {
        lineWhereBase.AND = [{ OR: lineWhereBase.OR }, { OR: ccCond }];
        delete lineWhereBase.OR;
      } else {
        lineWhereBase.OR = ccCond;
      }
    }

    const allLines = await prisma.journalEntryLine.findMany({
      where: lineWhereBase,
      include: {
        journalEntry: {
          select: {
            id: true,
            journalNumber: true,
            entryDate: true,
            entryType: true,
            description: true,
            referenceType: true,
            referenceId: true,
          },
        },
        departmentCenter: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { journalEntry: { entryDate: 'asc' } },
        { journalEntry: { journalNumber: 'asc' } },
        { sortOrder: 'asc' },
      ],
    });

    const linesByAccount: Record<string, typeof allLines> = {};
    for (const line of allLines) {
      if (!linesByAccount[line.accountId]) linesByAccount[line.accountId] = [];
      linesByAccount[line.accountId].push(line);
    }

    let grandOpeningDebit = 0;
    let grandOpeningCredit = 0;
    let grandPeriodDebit = 0;
    let grandPeriodCredit = 0;
    let grandClosingBalance = 0;

    const accountsResult = [];

    for (const acc of filteredAccounts) {
      if (params.departmentCenterId && (!linesByAccount[acc.id] || linesByAccount[acc.id].length === 0)) {
        if (acc.departmentCenterId !== params.departmentCenterId) continue;
      }
      if (params.costCenterId && (!linesByAccount[acc.id] || linesByAccount[acc.id].length === 0)) {
        if (acc.costCenterId !== params.costCenterId) continue;
      }

      const accLines = linesByAccount[acc.id] || [];
      const isDebitNormal = acc.normalBalance === 'debit';

      let openingDebit = 0;
      let openingCredit = 0;
      let periodDebit = 0;
      let periodCredit = 0;

      const periodLines: typeof accLines = [];

      for (const l of accLines) {
        const eDate = new Date(l.journalEntry.entryDate);
        const d = Number(l.debit || 0);
        const c = Number(l.credit || 0);

        if (isOpeningOnly || eDate < effectiveFromDate) {
          openingDebit += d;
          openingCredit += c;
        } else {
          periodDebit += d;
          periodCredit += c;
          periodLines.push(l);
        }
      }

      const openingBalance = isDebitNormal
        ? openingDebit - openingCredit
        : openingCredit - openingDebit;

      let runningBalance = openingBalance;
      const transactions = periodLines.map(l => {
        const d = Number(l.debit || 0);
        const c = Number(l.credit || 0);
        runningBalance += isDebitNormal ? d - c : c - d;
        const dept = l.departmentCenter || acc.departmentCenter || null;
        const cc = l.costCenter || acc.costCenter || null;

        return {
          id: l.id,
          journalId: l.journalEntry.id,
          entryDate: l.journalEntry.entryDate.toISOString(),
          journalNumber: l.journalEntry.journalNumber,
          entryType: l.journalEntry.entryType,
          description: l.description || l.journalEntry.description || '',
          department: dept ? { code: dept.code, name: dept.name } : null,
          costCenter: cc ? { code: cc.code, name: cc.name } : null,
          debit: d,
          credit: c,
          runningBalance,
        };
      });

      const closingBalance = runningBalance;
      const hasActivity =
        Math.abs(openingBalance) >= 0.005 ||
        Math.abs(periodDebit) >= 0.005 ||
        Math.abs(periodCredit) >= 0.005 ||
        transactions.length > 0;

      if (!params.includeZero && !hasActivity) {
        continue;
      }

      grandOpeningDebit += openingDebit;
      grandOpeningCredit += openingCredit;
      grandPeriodDebit += periodDebit;
      grandPeriodCredit += periodCredit;
      grandClosingBalance += isDebitNormal ? closingBalance : -closingBalance;

      accountsResult.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.accountType,
        accountSubtype: acc.accountSubtype,
        normalBalance: acc.normalBalance,
        department: acc.departmentCenter ? { code: acc.departmentCenter.code, name: acc.departmentCenter.name } : null,
        costCenter: acc.costCenter ? { code: acc.costCenter.code, name: acc.costCenter.name } : null,
        openingDebit,
        openingCredit,
        openingBalance,
        periodDebit,
        periodCredit,
        closingBalance,
        transactions,
      });
    }

    const totalDebit = grandOpeningDebit + grandPeriodDebit;
    const totalCredit = grandOpeningCredit + grandPeriodCredit;

    return {
      accounts: accountsResult,
      periodLabel,
      effectiveFromDate: effectiveFromDate.toISOString().split('T')[0],
      effectiveToDate: effectiveToDate.toISOString().split('T')[0],
      summary: {
        openingDebit: grandOpeningDebit,
        openingCredit: grandOpeningCredit,
        periodDebit: grandPeriodDebit,
        periodCredit: grandPeriodCredit,
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
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
      for (const r of prevTb.rows) {
        prevBalances[r.accountId] = r.netBalance;
        prevBalances[r.code] = (prevBalances[r.code] || 0) + r.netBalance;
      }

      const prevIncome = prevTb.rows.filter(r => r.accountType === 'income');
      const prevExpense = prevTb.rows.filter(r => r.accountType === 'expense');
      const prevTotalIncome = prevIncome.reduce((s, r) => s + r.netBalance, 0);
      const prevTotalExpense = prevExpense.reduce((s, r) => s + r.netBalance, 0);

      const withVariance = (rows: typeof income) => rows.map(r => {
        const prevBal = prevBalances[r.accountId] ?? prevBalances[r.code] ?? 0;
        return {
          ...r,
          previousBalance: prevBal,
          variance: r.netBalance - prevBal,
          variancePct: prevBal !== 0
            ? ((r.netBalance - prevBal) / Math.abs(prevBal)) * 100
            : 0,
        };
      });

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
      status: { in: ['posted', 'reversed'] },
      entryDate: { gte: new Date(params.fromDate), lte: new Date(params.toDate) },
    };
    if (params.propertyId) {
      where.lines = { some: { propertyId: params.propertyId } };
    }

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
      const cashLines = je.lines.filter(
        l => cashAccountCodes.includes(l.account.code) && (!params.propertyId || l.propertyId === params.propertyId)
      );
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
