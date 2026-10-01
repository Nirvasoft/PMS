import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class ChargeTypesService {
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
    if (dto.code        !== undefined) updateData.code        = dto.code;
    if (dto.name        !== undefined) updateData.name        = dto.name;
    if (dto.category    !== undefined) updateData.category    = dto.category;
    if (dto.glAccountCode !== undefined) updateData.glAccountCode = dto.glAccountCode || null;
    if (dto.isTaxable   !== undefined) updateData.isTaxable   = dto.isTaxable;
    if (dto.taxRate     !== undefined) {
      // Use the existing record's isTaxable when not included in the current DTO
      // to avoid incorrectly applying a rate to a non-taxable charge type.
      const effectiveIsTaxable = dto.isTaxable !== undefined ? dto.isTaxable : chargeType.isTaxable;
      updateData.taxRate = effectiveIsTaxable === false ? 0 : dto.taxRate;
    }
    if (dto.isActive    !== undefined) updateData.isActive    = dto.isActive;

    return prisma.chargeType.update({ where: { id }, data: updateData });
  }
}

export const chargeTypesService = new ChargeTypesService();
