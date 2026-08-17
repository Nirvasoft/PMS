import { prisma } from '../../common/database';
import { logger } from '../../common/logger';
import { AppError } from '../../common/errors';

const SYSTEM_CHARGE_TYPES = [
  { code: 'RENT',                  name: 'Rent',                    category: 'rent',    glAccountCode: '4100', isTaxable: true },
  { code: 'SERVICE_CHARGE',        name: 'Service Charge',          category: 'service', glAccountCode: '4200', isTaxable: true },
  { code: 'ELECTRICITY',           name: 'Electricity',             category: 'utility', glAccountCode: '4300', isTaxable: true },
  { code: 'WATER',                 name: 'Water',                   category: 'utility', glAccountCode: '4300', isTaxable: true },
  { code: 'GAS',                   name: 'Gas',                     category: 'utility', glAccountCode: '4300', isTaxable: true },
  { code: 'CHILLED_WATER',         name: 'Chilled Water',           category: 'utility', glAccountCode: '4300', isTaxable: true },
  { code: 'PARKING_MONTHLY',       name: 'Parking (Monthly)',       category: 'parking', glAccountCode: '4400', isTaxable: true },
  { code: 'PARKING_HOURLY',        name: 'Parking (Hourly)',        category: 'parking', glAccountCode: '4400', isTaxable: true },
  { code: 'LATE_PAYMENT_PENALTY',  name: 'Late Payment Penalty',    category: 'penalty', glAccountCode: '4500', isTaxable: false },
  { code: 'SECURITY_DEPOSIT',      name: 'Security Deposit',        category: 'deposit', glAccountCode: '2400', isTaxable: false },
  { code: 'ADMIN_FEE',             name: 'Administration Fee',      category: 'misc',    glAccountCode: '4600', isTaxable: true },
  { code: 'LEGAL_FEE',             name: 'Legal Fee',               category: 'misc',    glAccountCode: '4600', isTaxable: true },
  { code: 'REPAIR_CHARGE',         name: 'Repair Charge',           category: 'misc',    glAccountCode: '4600', isTaxable: true },
  { code: 'MISC',                  name: 'Miscellaneous',           category: 'misc',    glAccountCode: '4900', isTaxable: false },
];

export class ChargeTypesService {
  async seedDefaults() {
    let created = 0;
    for (const ct of SYSTEM_CHARGE_TYPES) {
      const exists = await prisma.chargeType.findFirst({
        where: { code: ct.code, companyId: null },
      });
      if (!exists) {
        await prisma.chargeType.create({
          data: { ...ct, isSystem: true, companyId: null },
        });
        created++;
      }
    }
    if (created > 0) {
      logger.info(`Seeded ${created} system charge types`);
    }
  }

  async findAll(companyId: string) {
    return prisma.chargeType.findMany({
      where: {
        OR: [
          { companyId: null },  // system-wide
          { companyId },        // company-specific
        ],
        isActive: true,
      },
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    return prisma.chargeType.create({
      data: {
        companyId,
        code: dto.code as string,
        name: dto.name as string,
        category: dto.category as string,
        glAccountCode: (dto.glAccountCode as string) || null,
        isTaxable: (dto.isTaxable as boolean) || false,
        taxRate: (dto.taxRate as number) || 0,
        isSystem: false,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    // Scoped to companyId, so a system charge type (companyId: null, shared
    // across every company) never matches here and can't be edited this way.
    const chargeType = await prisma.chargeType.findFirst({ where: { id, companyId } });
    if (!chargeType) throw AppError.notFound('Charge type');

    const updateData: Record<string, unknown> = {};
    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.glAccountCode !== undefined) updateData.glAccountCode = dto.glAccountCode || null;
    if (dto.isTaxable !== undefined) updateData.isTaxable = dto.isTaxable;
    if (dto.taxRate !== undefined) updateData.taxRate = dto.isTaxable === false ? 0 : dto.taxRate;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.chargeType.update({ where: { id }, data: updateData });
  }
}

export const chargeTypesService = new ChargeTypesService();
