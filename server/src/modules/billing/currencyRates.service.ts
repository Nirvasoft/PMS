import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

/** ISO currency reference — used to auto-fill description & symbol on seed */
const ISO_META: Record<string, { description: string; symbol: string }> = {
  AED: { description: 'UAE Dirham',          symbol: 'د.إ'  },
  AUD: { description: 'Australian Dollar',   symbol: 'A$'   },
  BDT: { description: 'Bangladeshi Taka',    symbol: '৳'    },
  BHD: { description: 'Bahraini Dinar',      symbol: '.د.ب' },
  BRL: { description: 'Brazilian Real',      symbol: 'R$'   },
  CAD: { description: 'Canadian Dollar',     symbol: 'CA$'  },
  CHF: { description: 'Swiss Franc',         symbol: 'Fr'   },
  CNY: { description: 'Chinese Yuan',        symbol: '¥'    },
  DKK: { description: 'Danish Krone',        symbol: 'kr'   },
  EUR: { description: 'Euro',                symbol: '€'    },
  GBP: { description: 'British Pound',       symbol: '£'    },
  HKD: { description: 'Hong Kong Dollar',    symbol: 'HK$'  },
  IDR: { description: 'Indonesian Rupiah',   symbol: 'Rp'   },
  INR: { description: 'Indian Rupee',        symbol: '₹'    },
  JPY: { description: 'Japanese Yen',        symbol: '¥'    },
  KHR: { description: 'Cambodian Riel',      symbol: '៛'    },
  KRW: { description: 'South Korean Won',    symbol: '₩'    },
  KWD: { description: 'Kuwaiti Dinar',       symbol: 'د.ك'  },
  LAK: { description: 'Lao Kip',             symbol: '₭'    },
  LKR: { description: 'Sri Lankan Rupee',    symbol: 'Rs'   },
  MMK: { description: 'Myanmar Kyat',        symbol: 'K'    },
  MYR: { description: 'Malaysian Ringgit',   symbol: 'RM'   },
  NOK: { description: 'Norwegian Krone',     symbol: 'kr'   },
  NPR: { description: 'Nepalese Rupee',      symbol: 'Rs'   },
  NZD: { description: 'New Zealand Dollar',  symbol: 'NZ$'  },
  OMR: { description: 'Omani Rial',          symbol: 'ر.ع.' },
  PHP: { description: 'Philippine Peso',     symbol: '₱'    },
  PKR: { description: 'Pakistani Rupee',     symbol: 'Rs'   },
  QAR: { description: 'Qatari Riyal',        symbol: 'ر.ق'  },
  SAR: { description: 'Saudi Riyal',         symbol: 'ر.س'  },
  SEK: { description: 'Swedish Krona',       symbol: 'kr'   },
  SGD: { description: 'Singapore Dollar',    symbol: 'S$'   },
  THB: { description: 'Thai Baht',           symbol: '฿'    },
  TRY: { description: 'Turkish Lira',        symbol: '₺'    },
  TWD: { description: 'Taiwan Dollar',       symbol: 'NT$'  },
  USD: { description: 'US Dollar',           symbol: '$'    },
  VND: { description: 'Vietnamese Dong',     symbol: '₫'    },
  XAF: { description: 'CFA Franc BEAC',      symbol: 'Fr'   },
  ZAR: { description: 'South African Rand',  symbol: 'R'    },
};

export class CurrencyRatesService {
  // The base currency isn't chosen per rate row — it's whichever currency was most
  // recently flagged isBaseCurrency for this property. Falls back to MMK before any
  // base is declared.
  private async getBaseCurrency(propertyId: string): Promise<string> {
    const base = await prisma.currencyRate.findFirst({
      where: { propertyId, isBaseCurrency: true },
      orderBy: { effectiveDate: 'desc' },
    });
    return base?.currency || 'MMK';
  }

  // Shared by create()/update() — a currency/base/effectiveDate combo must be unique
  // within a property, excluding the row being edited.
  private async assertRateAvailable(propertyId: string, baseCurrency: string, currency: string, effectiveDate: Date, excludeId?: string) {
    const duplicate = await prisma.currencyRate.findFirst({
      where: { propertyId, baseCurrency, currency, effectiveDate, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (duplicate) throw new AppError(409, 'CURRENCY_RATE_TAKEN', `A rate for ${currency}/${baseCurrency} on this date is already set up`);
  }

  async findAll(companyId: string, query: { propertyId?: string } = {}) {
    return prisma.currencyRate.findMany({
      where: { companyId, propertyId: query.propertyId || undefined, isActive: true },
      orderBy: [{ currency: 'asc' }, { effectiveDate: 'desc' }],
    });
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    const propertyId = dto.propertyId as string;
    if (!propertyId) throw new AppError(400, 'PROPERTY_REQUIRED', 'Property is required');

    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
    if (!property) throw AppError.notFound('Property');

    const currency = (dto.currency as string || '').trim().toUpperCase();
    const isBaseCurrency = Boolean(dto.isBaseCurrency);
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate as string) : new Date();

    if (!currency) throw new AppError(400, 'CURRENCY_REQUIRED', 'Code is required');

    // One property, one base currency — and it must be the property's own configured currency.
    if (isBaseCurrency && currency !== property.currency) {
      throw new AppError(400, 'BASE_CURRENCY_MUST_MATCH_PROPERTY', `Base Currency must be the property's own currency (${property.currency})`);
    }

    if (isBaseCurrency) {
      const existingBase = await prisma.currencyRate.findFirst({ where: { propertyId, isBaseCurrency: true, isActive: true } });
      if (existingBase) {
        throw new AppError(409, 'BASE_CURRENCY_ALREADY_SET', `${existingBase.currency} is already set as the Base Currency for this property. Uncheck it there first before setting a new one.`);
      }
    }

    const baseCurrency = isBaseCurrency ? currency : await this.getBaseCurrency(propertyId);
    const rate = dto.rate !== undefined ? Number(dto.rate) : 1;

    if (!rate || rate <= 0) throw new AppError(400, 'RATE_REQUIRED', 'Rate must be a positive number');
    if (!isBaseCurrency && currency === baseCurrency) {
      throw new AppError(400, 'CURRENCY_SAME_AS_BASE', 'Currency must be different from the base currency (check "Base Currency" instead)');
    }

    await this.assertRateAvailable(propertyId, baseCurrency, currency, effectiveDate);

    return prisma.currencyRate.create({
      data: {
        companyId,
        propertyId,
        baseCurrency,
        currency,
        description: (dto.description as string) || null,
        symbol: (dto.symbol as string) || null,
        isBaseCurrency,
        operator: (dto.operator as string) === 'divide' ? 'divide' : 'multiply',
        rate,
        effectiveDate,
        remarks: (dto.remarks as string) || null,
      },
    });
  }

  async update(id: string, companyId: string, dto: Record<string, unknown>) {
    const currencyRate = await prisma.currencyRate.findFirst({ where: { id, companyId } });
    if (!currencyRate) throw AppError.notFound('Currency rate');

    const { propertyId: rawPropertyId } = currencyRate;
    const propertyId = rawPropertyId as string; // safe: propertyId is set for all created rates
    const currency = dto.currency !== undefined ? (dto.currency as string).trim().toUpperCase() : currencyRate.currency;
    const isBaseCurrency = dto.isBaseCurrency !== undefined ? Boolean(dto.isBaseCurrency) : currencyRate.isBaseCurrency;
    const effectiveDate = dto.effectiveDate !== undefined ? new Date(dto.effectiveDate as string) : currencyRate.effectiveDate;

    if (isBaseCurrency && !currencyRate.isBaseCurrency) {
      const existingBase = await prisma.currencyRate.findFirst({
        where: { propertyId, isBaseCurrency: true, isActive: true, id: { not: id } },
      });
      if (existingBase) {
        throw new AppError(409, 'BASE_CURRENCY_ALREADY_SET', `${existingBase.currency} is already set as the Base Currency for this property. Uncheck it there first before setting a new one.`);
      }
    }

    const baseCurrencyChanged = dto.currency !== undefined || dto.isBaseCurrency !== undefined;
    const baseCurrency: string = isBaseCurrency ? currency : (baseCurrencyChanged ? await this.getBaseCurrency(propertyId) : (currencyRate.baseCurrency ?? await this.getBaseCurrency(propertyId)));
    const rate = dto.rate !== undefined ? Number(dto.rate) : Number(currencyRate.rate);

    if (!rate || rate <= 0) throw new AppError(400, 'RATE_REQUIRED', 'Rate must be a positive number');
    if (!isBaseCurrency && currency === baseCurrency) {
      throw new AppError(400, 'CURRENCY_SAME_AS_BASE', 'Currency must be different from the base currency (check "Base Currency" instead)');
    }

    if (dto.currency !== undefined || dto.isBaseCurrency !== undefined || dto.effectiveDate !== undefined) {
      await this.assertRateAvailable(propertyId, baseCurrency, currency, effectiveDate, id);
    }

    const updateData: Record<string, unknown> = { currency, baseCurrency, isBaseCurrency, rate };
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.symbol !== undefined) updateData.symbol = dto.symbol || null;
    updateData.operator = dto.operator !== undefined ? (dto.operator === 'divide' ? 'divide' : 'multiply') : currencyRate.operator;
    if (dto.effectiveDate !== undefined) updateData.effectiveDate = effectiveDate;
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return prisma.currencyRate.update({ where: { id }, data: updateData });
  }

  async delete(id: string, companyId: string) {
    const currencyRate = await prisma.currencyRate.findFirst({ where: { id, companyId } });
    if (!currencyRate) throw AppError.notFound('Currency rate');

    // Block deleting the base currency while other rows still convert against it.
    if (currencyRate.isBaseCurrency) {
      const dependentRates = await prisma.currencyRate.count({
        where: { propertyId: currencyRate.propertyId, isBaseCurrency: false, isActive: true, id: { not: id } },
      });
      if (dependentRates > 0) {
        throw new AppError(
          409,
          'CURRENCY_IN_USE',
          `Cannot delete ${currencyRate.currency} — ${dependentRates} other currency rate${dependentRates > 1 ? 's' : ''} in Currency Setup still convert against it as the base currency.`,
        );
      }
    }

    // Block deleting a currency that's already in use by actual business records.
    const { currency } = currencyRate;
    const usageCounts = await Promise.all([
      prisma.property.count({ where: { companyId, currency } }),
      prisma.lease.count({ where: { companyId, currency } }),
      prisma.billingSchedule.count({ where: { companyId, currency } }),
      prisma.invoice.count({ where: { companyId, currency } }),
      prisma.receipt.count({ where: { companyId, currency } }),
      prisma.refundRequest.count({ where: { companyId, currency } }),
      prisma.tenantCredit.count({ where: { companyId, currency } }),
      prisma.bankAccount.count({ where: { companyId, currency } }),
      prisma.apInvoice.count({ where: { companyId, currency } }),
      prisma.paymentVoucher.count({ where: { companyId, currency } }),
      prisma.expense.count({ where: { companyId, currency } }),
    ]);
    const totalUsage = usageCounts.reduce((sum, count) => sum + count, 0);
    if (totalUsage > 0) {
      throw new AppError(
        409,
        'CURRENCY_IN_USE',
        `Cannot delete ${currency} — it is used by ${totalUsage} existing record${totalUsage > 1 ? 's' : ''} (leases, invoices, or other transactions).`,
      );
    }

    await prisma.currencyRate.delete({ where: { id } });
  }

  /**
   * Called automatically when a property is created or its currency changes.
   *
   * - If no Base Currency record exists yet for the property → creates one
   *   (rate = 1, isBaseCurrency = true, operator = multiply).
   * - If a Base Currency record already exists with a DIFFERENT currency code
   *   (only possible when the property currency was just changed and there are
   *   no active leases) AND no other rates depend on it → renames it in-place.
   * - If the existing Base Currency already matches → no-op.
   *
   * Failures are swallowed with a warning so that property creation is never
   * blocked by a currency-seed error.
   */
  async seedBaseCurrency(
    companyId: string,
    propertyId: string,
    currency: string,
    meta: { description?: string; symbol?: string } = {},
  ): Promise<void> {
    try {
      const code = currency.trim().toUpperCase();
      if (!code) return;

      const existingBase = await prisma.currencyRate.findFirst({
        where: { propertyId, isBaseCurrency: true, isActive: true },
      });

      if (!existingBase) {
        // No base currency yet — seed it.
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Check for an exact duplicate (idempotent if called twice).
        const duplicate = await prisma.currencyRate.findFirst({
          where: { propertyId, baseCurrency: code, currency: code, isActive: true },
        });
        if (duplicate) return; // Already seeded.

        await prisma.currencyRate.create({
          data: {
            companyId,
            propertyId,
            baseCurrency: code,
            currency: code,
            description: meta.description || ISO_META[code]?.description || null,
            symbol:      meta.symbol      || ISO_META[code]?.symbol      || null,
            isBaseCurrency: true,
            operator: 'divide',
            rate: 1,
            effectiveDate: today,
            remarks: 'Auto-seeded from property currency',
          },
        });

        logger.info(`[CurrencyRates] Seeded base currency ${code} for property ${propertyId}`);
        return;
      }

      if (existingBase.currency === code) return; // Already correct — nothing to do.

      // Base currency exists but with a different code (property currency changed).
      // Only rename if no other rates still reference the old base.
      const dependentRates = await prisma.currencyRate.count({
        where: { propertyId, isBaseCurrency: false, isActive: true, id: { not: existingBase.id } },
      });

      if (dependentRates > 0) {
        // Other rates exist that convert against the old base — cannot rename silently;
        // log a warning and leave Currency Setup for the admin to fix manually.
        logger.warn(
          `[CurrencyRates] Property ${propertyId} currency changed to ${code} but the existing ` +
          `base rate (${existingBase.currency}) has ${dependentRates} dependent rate(s). ` +
          `Manual update in Currency Setup required.`,
        );
        return;
      }

      // Safe to rename in-place.
      await prisma.currencyRate.update({
        where: { id: existingBase.id },
        data: {
          currency: code,
          baseCurrency: code,
          description: meta.description ?? ISO_META[code]?.description ?? existingBase.description ?? null,
          symbol:      meta.symbol      ?? ISO_META[code]?.symbol      ?? existingBase.symbol      ?? null,
          remarks: `Auto-updated from property currency (was ${existingBase.currency})`,
        },
      });

      logger.info(
        `[CurrencyRates] Updated base currency from ${existingBase.currency} → ${code} for property ${propertyId}`,
      );
    } catch (err) {
      logger.warn(`[CurrencyRates] seedBaseCurrency failed for property ${propertyId}:`, err);
    }
  }
}

export const currencyRatesService = new CurrencyRatesService();
