import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

export class CurrencyRatesService {
  // The base currency isn't chosen per rate row — it's whichever currency was most
  // recently flagged isBaseCurrency. Falls back to MMK before any base is declared.
  private async getBaseCurrency(companyId: string): Promise<string> {
    const base = await prisma.currencyRate.findFirst({
      where: { companyId, isBaseCurrency: true },
      orderBy: { effectiveDate: 'desc' },
    });
    return base?.currency || 'MMK';
  }

  async findAll(companyId: string) {
    return prisma.currencyRate.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ currency: 'asc' }, { effectiveDate: 'desc' }],
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    const currency = (dto.currency as string || '').trim().toUpperCase();
    const isBaseCurrency = Boolean(dto.isBaseCurrency);
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate as string) : new Date();

    if (!currency) throw new AppError(400, 'CURRENCY_REQUIRED', 'Code is required');

    if (isBaseCurrency) {
      const existingBase = await prisma.currencyRate.findFirst({ where: { companyId, isBaseCurrency: true, isActive: true } });
      if (existingBase) {
        throw new AppError(409, 'BASE_CURRENCY_ALREADY_SET', `${existingBase.currency} is already set as the Base Currency. Uncheck it there first before setting a new one.`);
      }
    }

    const baseCurrency = isBaseCurrency ? currency : await this.getBaseCurrency(companyId);
    const rate = dto.rate !== undefined ? Number(dto.rate) : 1;

    if (!rate || rate <= 0) throw new AppError(400, 'RATE_REQUIRED', 'Rate must be a positive number');
    if (!isBaseCurrency && currency === baseCurrency) {
      throw new AppError(400, 'CURRENCY_SAME_AS_BASE', 'Currency must be different from the base currency (check "Base Currency" instead)');
    }

    const duplicate = await prisma.currencyRate.findFirst({
      where: { companyId, baseCurrency, currency, effectiveDate, isActive: true },
    });
    if (duplicate) throw new AppError(409, 'CURRENCY_RATE_TAKEN', `A rate for ${currency}/${baseCurrency} on this date is already set up`);

    return prisma.currencyRate.create({
      data: {
        companyId,
        baseCurrency,
        currency,
        description: (dto.description as string) || null,
        symbol: (dto.symbol as string) || null,
        isBaseCurrency,
        operator: isBaseCurrency ? 'multiply' : ((dto.operator as string) === 'divide' ? 'divide' : 'multiply'),
        rate,
        effectiveDate,
        remarks: (dto.remarks as string) || null,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const currencyRate = await prisma.currencyRate.findFirst({ where: { id, companyId } });
    if (!currencyRate) throw AppError.notFound('Currency rate');

    const currency = dto.currency !== undefined ? (dto.currency as string).trim().toUpperCase() : currencyRate.currency;
    const isBaseCurrency = dto.isBaseCurrency !== undefined ? Boolean(dto.isBaseCurrency) : currencyRate.isBaseCurrency;
    const effectiveDate = dto.effectiveDate !== undefined ? new Date(dto.effectiveDate as string) : currencyRate.effectiveDate;

    if (isBaseCurrency && !currencyRate.isBaseCurrency) {
      const existingBase = await prisma.currencyRate.findFirst({
        where: { companyId, isBaseCurrency: true, isActive: true, id: { not: id } },
      });
      if (existingBase) {
        throw new AppError(409, 'BASE_CURRENCY_ALREADY_SET', `${existingBase.currency} is already set as the Base Currency. Uncheck it there first before setting a new one.`);
      }
    }

    const baseCurrencyChanged = dto.currency !== undefined || dto.isBaseCurrency !== undefined;
    const baseCurrency = isBaseCurrency ? currency : (baseCurrencyChanged ? await this.getBaseCurrency(companyId) : currencyRate.baseCurrency);
    const rate = dto.rate !== undefined ? Number(dto.rate) : Number(currencyRate.rate);

    if (!rate || rate <= 0) throw new AppError(400, 'RATE_REQUIRED', 'Rate must be a positive number');
    if (!isBaseCurrency && currency === baseCurrency) {
      throw new AppError(400, 'CURRENCY_SAME_AS_BASE', 'Currency must be different from the base currency (check "Base Currency" instead)');
    }

    if (dto.currency !== undefined || dto.isBaseCurrency !== undefined || dto.effectiveDate !== undefined) {
      const duplicate = await prisma.currencyRate.findFirst({
        where: { companyId, baseCurrency, currency, effectiveDate, isActive: true, id: { not: id } },
      });
      if (duplicate) throw new AppError(409, 'CURRENCY_RATE_TAKEN', `A rate for ${currency}/${baseCurrency} on this date is already set up`);
    }

    const updateData: Record<string, unknown> = { currency, baseCurrency, isBaseCurrency, rate };
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.symbol !== undefined) updateData.symbol = dto.symbol || null;
    updateData.operator = isBaseCurrency ? 'multiply' : (dto.operator !== undefined ? (dto.operator === 'divide' ? 'divide' : 'multiply') : currencyRate.operator);
    if (dto.effectiveDate !== undefined) updateData.effectiveDate = effectiveDate;
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.currencyRate.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    const currencyRate = await prisma.currencyRate.findFirst({ where: { id, companyId } });
    if (!currencyRate) throw AppError.notFound('Currency rate');

    await prisma.currencyRate.delete({ where: { id } });
  }
}

export const currencyRatesService = new CurrencyRatesService();
