import { prisma } from '../../common/database';

export class TenantCreditsService {
  async findByTenant(companyId: string, tenantId: string) {
    const credits = await prisma.tenantCredit.findMany({
      where: { companyId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Compute balance as amount - usedAmount
    return credits.map((c) => ({
      ...c,
      balance: Number(c.amount) - Number(c.usedAmount),
    }));
  }
}

export const tenantCreditsService = new TenantCreditsService();
