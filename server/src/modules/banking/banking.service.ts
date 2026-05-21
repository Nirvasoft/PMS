import { prisma } from '../../common/database';
import { logger } from '../../common/logger';

class BankingService {
  // ── Bank Accounts ───────────────────────────

  async getBankAccounts(companyId: string) {
    return prisma.bankAccount.findMany({
      where: { companyId },
      orderBy: { bankName: 'asc' },
    });
  }

  async createBankAccount(companyId: string, data: any) {
    return prisma.bankAccount.create({
      data: {
        companyId,
        propertyId: data.propertyId || null,
        bankName: data.bankName,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        accountType: data.accountType || 'current',
        currency: data.currency || 'USD',
        openingBalance: data.openingBalance || 0,
        currentBalance: data.openingBalance || 0,
        swiftCode: data.swiftCode || null,
        iban: data.iban || null,
        branchName: data.branchName || null,
        branchCode: data.branchCode || null,
        glAccountId: data.glAccountId || null,
      },
    });
  }

  async updateBankAccount(id: string, companyId: string, data: any) {
    await prisma.bankAccount.findFirstOrThrow({ where: { id, companyId } });
    return prisma.bankAccount.update({
      where: { id },
      data: {
        bankName: data.bankName,
        accountName: data.accountName,
        accountType: data.accountType,
        branchName: data.branchName,
        branchCode: data.branchCode,
        swiftCode: data.swiftCode,
        iban: data.iban,
        glAccountId: data.glAccountId,
        isActive: data.isActive,
      },
    });
  }

  async getBalance(id: string, companyId: string) {
    const acct = await prisma.bankAccount.findFirstOrThrow({ where: { id, companyId } });
    const imports = await prisma.bankStatementImport.findMany({
      where: { bankAccountId: id },
      orderBy: { importDate: 'desc' },
      take: 1,
    });
    return {
      bankName: acct.bankName,
      accountName: acct.accountName,
      currentBalance: acct.currentBalance,
      currency: acct.currency,
      lastReconciled: imports[0]?.importDate || null,
    };
  }

  // ── Statement Import ────────────────────────

  async importStatement(companyId: string, userId: string, bankAccountId: string, data: {
    format: string; fromDate: string; toDate: string; filename: string; lines: any[];
  }) {
    await prisma.bankAccount.findFirstOrThrow({ where: { id: bankAccountId, companyId } });

    const totalCredits = data.lines.filter(l => l.creditAmount > 0).reduce((s, l) => s + Number(l.creditAmount), 0);
    const totalDebits = data.lines.filter(l => l.debitAmount > 0).reduce((s, l) => s + Number(l.debitAmount), 0);

    const importRecord = await prisma.bankStatementImport.create({
      data: {
        bankAccountId,
        companyId,
        format: data.format,
        fromDate: new Date(data.fromDate),
        toDate: new Date(data.toDate),
        filename: data.filename || null,
        totalCredits,
        totalDebits,
        transactionCount: data.lines.length,
        importedBy: userId,
      },
    });

    // Create statement lines
    for (const line of data.lines) {
      await prisma.bankStatementLine.create({
        data: {
          importId: importRecord.id,
          bankAccountId,
          transactionDate: new Date(line.transactionDate),
          valueDate: line.valueDate ? new Date(line.valueDate) : null,
          description: line.description || null,
          reference: line.reference || null,
          creditAmount: line.creditAmount || 0,
          debitAmount: line.debitAmount || 0,
          balance: line.balance ?? null,
        },
      });
    }

    // Auto-match
    await this.autoMatchImport(importRecord.id, companyId);

    // Update bank account current balance
    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: { increment: totalCredits - totalDebits },
      },
    });

    logger.info(`Statement imported: ${data.lines.length} lines for bank account ${bankAccountId}, balance updated (+${totalCredits} / -${totalDebits})`);
    return importRecord;
  }

  // ── Statement Lines ─────────────────────────

  async getStatementLines(companyId: string, bankAccountId: string, params: any) {
    const where: any = { bankAccountId };
    if (params.importId) where.importId = params.importId;
    if (params.matchStatus) where.matchStatus = params.matchStatus;

    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 50, 200);

    const [data, total] = await Promise.all([
      prisma.bankStatementLine.findMany({
        where,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bankStatementLine.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getImports(companyId: string, bankAccountId: string) {
    return prisma.bankStatementImport.findMany({
      where: { bankAccountId, companyId },
      orderBy: { importDate: 'desc' },
      include: { _count: { select: { lines: true } } },
    });
  }

  // ── Matching ────────────────────────────────

  async matchLine(lineId: string, userId: string, data: { entityType: string; entityId: string }) {
    return prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        matchStatus: 'manually_matched',
        matchedEntityType: data.entityType,
        matchedEntityId: data.entityId,
        matchConfidence: 100,
        matchedBy: userId,
        matchedAt: new Date(),
      },
    });
  }

  async excludeLine(lineId: string, userId: string) {
    return prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { matchStatus: 'excluded', matchedBy: userId, matchedAt: new Date() },
    });
  }

  async unmatchLine(lineId: string) {
    return prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        matchStatus: 'unmatched',
        matchedEntityType: null,
        matchedEntityId: null,
        matchConfidence: null,
        matchedBy: null,
        matchedAt: null,
      },
    });
  }

  // ── Auto-match Algorithm ────────────────────

  private async autoMatchImport(importId: string, companyId: string) {
    const lines = await prisma.bankStatementLine.findMany({ where: { importId } });

    for (const line of lines) {
      const isCredit = Number(line.creditAmount) > 0;
      const amount = isCredit ? Number(line.creditAmount) : Number(line.debitAmount);

      if (isCredit) {
        // Match against AR receipts by amount within ±3 days
        const txDate = new Date(line.transactionDate);
        const fromDate = new Date(txDate); fromDate.setDate(fromDate.getDate() - 3);
        const toDate = new Date(txDate); toDate.setDate(toDate.getDate() + 3);

        const receipts = await prisma.receipt.findMany({
          where: {
            companyId,
            amount: { equals: amount },
            receiptDate: { gte: fromDate, lte: toDate },
            status: { in: ['posted', 'approved'] },
          },
        });

        if (receipts.length === 1) {
          const refMatch = line.description?.includes(receipts[0].paymentReference || '') ||
            line.reference?.includes(receipts[0].receiptNumber || '');
          const confidence = refMatch ? 95 : 70;

          await prisma.bankStatementLine.update({
            where: { id: line.id },
            data: {
              matchStatus: 'auto_matched',
              matchedEntityType: 'receipt',
              matchedEntityId: receipts[0].id,
              matchConfidence: confidence,
              matchedAt: new Date(),
            },
          });
        }
      }
    }
  }

  // ── Reconciliation Summary ──────────────────

  async getReconciliationSummary(bankAccountId: string) {
    const [total, matched, autoMatched, excluded, unmatched] = await Promise.all([
      prisma.bankStatementLine.count({ where: { bankAccountId } }),
      prisma.bankStatementLine.count({ where: { bankAccountId, matchStatus: 'manually_matched' } }),
      prisma.bankStatementLine.count({ where: { bankAccountId, matchStatus: 'auto_matched' } }),
      prisma.bankStatementLine.count({ where: { bankAccountId, matchStatus: 'excluded' } }),
      prisma.bankStatementLine.count({ where: { bankAccountId, matchStatus: 'unmatched' } }),
    ]);

    return { total, matched, autoMatched, excluded, unmatched };
  }
}

export const bankingService = new BankingService();
