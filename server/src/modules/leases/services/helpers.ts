function parseDateParts(val?: Date | string): { y: number; m: number; d: number } | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

export function calcLeaseTermMonths(start: Date | string, end: Date | string): number {
  const s = parseDateParts(start);
  const e = parseDateParts(end);
  if (!s || !e) return 0;

  const startUtc = Date.UTC(s.y, s.m, s.d);
  const endUtc = Date.UTC(e.y, e.m, e.d);
  if (endUtc < startUtc) return 0;

  // Add 1 day because lease end dates are inclusive
  const nextDay = new Date(Date.UTC(e.y, e.m, e.d + 1));
  let months = (nextDay.getUTCFullYear() - s.y) * 12 + (nextDay.getUTCMonth() - s.m);
  if (nextDay.getUTCDate() < s.d) {
    months -= 1;
  }
  return Math.max(1, months);
}

export function getBillingCycleMonths(cycle?: string): number {
  switch (cycle) {
    case 'monthly':       return 1;
    case 'quarterly':     return 3;
    case 'semi_annual':   return 6;
    case 'tri_quarterly': return 9;
    case 'annual':        return 12;
    default:              return 1;
  }
}

export function addDaysUtc(dateInput: Date | string, days: number): Date {
  const parts = parseDateParts(dateInput);
  if (!parts) return new Date(NaN);
  return new Date(Date.UTC(parts.y, parts.m, parts.d + days));
}

export function calcEndDateFromStartAndCycleUtc(startDateInput: Date | string, billingCycle?: string): Date {
  const parts = parseDateParts(startDateInput);
  if (!parts) return new Date(NaN);
  const cycleMonths = getBillingCycleMonths(billingCycle);
  const totalMonths = parts.m + cycleMonths;
  const targetYear = parts.y + Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(parts.d, maxDayInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay - 1));
}

export function nextLeaseNumber(): string {
  const year = new Date().getFullYear();
  const rand  = Math.floor(Math.random() * 90000) + 10000;
  return `LSE-${year}-${rand}`;
}

export function daysUntilExpiry(endDate: Date | string): number {
  const ms = new Date(endDate).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export interface EarlyTerminationPolicy {
  enabled: boolean;
  mode: 'formula' | 'fixed' | 'percent';
  maxMonths: number;        // formula: cap = rent × maxMonths
  remainingPercent: number; // formula: rent × remainingMonths × (pct/100); percent: pct% of rent
  fixedAmount: number;      // fixed mode
}

export const DEFAULT_EARLY_TERMINATION_POLICY: EarlyTerminationPolicy = {
  enabled: true, mode: 'formula', maxMonths: 3, remainingPercent: 50, fixedAmount: 0,
};

/** Read the property's early-termination policy from `settings.earlyTerminationPolicy`, falling back to defaults. */
export function resolveTerminationPolicy(settings: unknown): EarlyTerminationPolicy {
  const raw = (settings && typeof settings === 'object' ? (settings as any).earlyTerminationPolicy : null) || {};
  const num = (v: unknown, d: number) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  const d = DEFAULT_EARLY_TERMINATION_POLICY;
  return {
    enabled: raw.enabled === undefined ? d.enabled : !!raw.enabled,
    mode: ['formula', 'fixed', 'percent'].includes(raw.mode) ? raw.mode : d.mode,
    maxMonths: num(raw.maxMonths, d.maxMonths),
    remainingPercent: num(raw.remainingPercent, d.remainingPercent),
    fixedAmount: num(raw.fixedAmount, d.fixedAmount),
  };
}

export function calcEarlyTermPenalty(
  rentAmount: number,
  remainingMonths: number,
  policy: EarlyTerminationPolicy = DEFAULT_EARLY_TERMINATION_POLICY,
): number {
  if (!policy.enabled) return 0;
  let amount: number;
  if (policy.mode === 'fixed') amount = policy.fixedAmount;
  else if (policy.mode === 'percent') amount = rentAmount * (policy.remainingPercent / 100);
  else amount = Math.min(rentAmount * policy.maxMonths, rentAmount * remainingMonths * (policy.remainingPercent / 100));
  return Math.round(amount * 100) / 100;
}

function toUtcDay(val: Date | string): number {
  const parts = parseDateParts(val);
  return parts ? Date.UTC(parts.y, parts.m, parts.d) : NaN;
}

/** Compute penalty + human-readable breakdown for terminating a lease on `termDate`. */
export function computeTerminationPenalty(
  rentAmount: number, termDate: Date | string, endDate: Date | string, policy: EarlyTerminationPolicy,
) {
  const isEarly = toUtcDay(termDate) < toUtcDay(endDate);
  const remainingMonths = isEarly ? Math.max(0, calcLeaseTermMonths(termDate, endDate)) : 0;
  let penalty = 0;
  let breakdown = '';
  if (isEarly) {
    if (!policy.enabled) breakdown = 'Early termination penalty is disabled';
    else {
      penalty = calcEarlyTermPenalty(rentAmount, remainingMonths, policy);
      breakdown = policy.mode === 'fixed' ? `Fixed amount (${policy.fixedAmount})`
        : policy.mode === 'percent' ? `${policy.remainingPercent}% of monthly rent`
        : `Min(${policy.maxMonths} months rent, ${remainingMonths} remaining months × ${policy.remainingPercent}%)`;
    }
  }
  return { isEarly, remainingMonths, penalty, breakdown };
}
