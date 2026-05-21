import { prisma } from '../../common/database';

export class TaxService {
  async findAll(companyId: string) {
    return prisma.taxConfiguration.findMany({
      where: { companyId, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    return prisma.taxConfiguration.create({
      data: {
        companyId,
        taxName: dto.taxName as string,
        taxRate: dto.taxRate as number,
        appliesTo: (dto.appliesTo as string[]) || [],
        effectiveFrom: new Date(dto.effectiveFrom as string),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo as string) : null,
      },
    });
  }

  /**
   * Resolves the effective tax rate for a given charge type code and date.
   * Priority: most specific match (appliesTo includes code) > general (empty appliesTo).
   */
  async getApplicableRate(companyId: string, chargeTypeCode: string, invoiceDate: Date): Promise<number> {
    const configs = await prisma.taxConfiguration.findMany({
      where: {
        companyId,
        isActive: true,
        effectiveFrom: { lte: invoiceDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: invoiceDate } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // Find the most specific config
    const specific = configs.find(c => c.appliesTo.length > 0 && c.appliesTo.includes(chargeTypeCode));
    if (specific) return Number(specific.taxRate);

    // Fallback to general config
    const general = configs.find(c => c.appliesTo.length === 0);
    if (general) return Number(general.taxRate);

    return 0;
  }
}

export const taxService = new TaxService();
