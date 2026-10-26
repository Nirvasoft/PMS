/**
 * System-wide amount & currency formatting helpers.
 * Compact suffix starts ONLY from B (>= 1,000,000,000).
 * Amounts below 1,000,000,000 are shown in full comma-separated format (never K or M).
 */

const BILLION = 1_000_000_000;

function toBillionSuffix(val: number): string {
  return `${(val / BILLION).toFixed(2).replace(/\.?0+$/, '')}B`;
}

export function formatFullAmount(
  amount: string | number | null | undefined,
  options: { minDecimals?: number; maxDecimals?: number } = {},
): string {
  const num = Number(amount) || 0;
  const { minDecimals = 0, maxDecimals = 2 } = options;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

export function formatCompactAmount(
  amount: string | number | null | undefined,
  options: { minDecimals?: number; maxDecimals?: number } = {},
): string {
  const num = Number(amount) || 0;
  if (Math.abs(num) >= BILLION) {
    return toBillionSuffix(num);
  }
  return formatFullAmount(num, options);
}

export function formatCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
  display: 'symbol' | 'code' = 'symbol',
): string {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const curr = currency || 'USD';

  if (abs >= BILLION) {
    const compactVal = toBillionSuffix(abs);
    const sign = num < 0 ? '-' : '';
    if (display === 'code') {
      return `${sign}${curr} ${compactVal}`;
    }
    try {
      const symbol =
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: curr,
          currencyDisplay: 'narrowSymbol',
        })
          .formatToParts(0)
          .find((p) => p.type === 'currency')?.value || curr;
      const sep = /^[A-Za-z]+$/.test(symbol) ? ' ' : '';
      return `${sign}${symbol}${sep}${compactVal}`;
    } catch {
      return `${sign}${curr} ${compactVal}`;
    }
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      currencyDisplay: display === 'code' ? 'code' : 'symbol',
      maximumFractionDigits: curr === 'MMK' ? 0 : 2,
    }).format(num);
  } catch {
    return `${curr} ${formatFullAmount(num)}`;
  }
}

export function formatFullCurrency(
  amount: string | number | null | undefined,
  currency = 'USD',
  display: 'symbol' | 'code' = 'symbol',
): string {
  const num = Number(amount) || 0;
  const curr = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      currencyDisplay: display === 'code' ? 'code' : 'symbol',
      maximumFractionDigits: curr === 'MMK' ? 0 : 2,
    }).format(num);
  } catch {
    return `${curr} ${formatFullAmount(num)}`;
  }
}
