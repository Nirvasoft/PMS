export function calcLeaseTermMonths(start: Date | string, end: Date | string): number {
  if (!start || !end) return 0;

  const parseParts = (val: Date | string) => {
    if (typeof val === 'string') {
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
      }
    }
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  };

  const s = parseParts(start);
  const e = parseParts(end);
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
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = val instanceof Date ? val : new Date(val);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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
