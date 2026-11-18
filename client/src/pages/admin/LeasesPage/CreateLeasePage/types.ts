import type { RentalAgreement } from '../../../../store/api/leasesApi';

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

export const PREDEFINED_TYPE_LABELS: Record<string, string> = {
  prerenewal: 'Prerenewal',
  precontractend: 'Precontractend',
};

/**
 * Calculates the number of lease term months between start and end dates.
 * In property management, lease end dates are inclusive (e.g. 2026-10-01 to
 * 2026-12-31 includes all of December, making it 3 full months).
 */
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

export function addDaysIso(dateInput: Date | string, days: number): string {
  const parts = parseDateParts(dateInput);
  if (!parts) return '';
  return new Date(Date.UTC(parts.y, parts.m, parts.d + days)).toISOString().slice(0, 10);
}

/**
 * Computes inclusive Lease End Date = Start Date + Billing Cycle Months - 1 Day.
 * E.g. 2026-01-01 + Monthly (1m) => 2026-01-31; + Quarterly (3m) => 2026-03-31.
 */
export function calcEndDateFromStartAndCycle(
  startDateInput: Date | string,
  billingCycle?: string,
): string {
  const parts = parseDateParts(startDateInput);
  if (!parts) return '';

  const cycleMonths = getBillingCycleMonths(billingCycle);
  const totalMonths = parts.m + cycleMonths;
  const targetYear = parts.y + Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(parts.d, maxDayInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay - 1)).toISOString().slice(0, 10);
}

export interface PartialBreakdown {
  termMonths: number;
  cycleMonths: number;
  totalCycles: number;
  totalRent: number;
  partialAmount: number;
  remainingRent: number;
  remainingCycles: number;
  scheduleAmount: number;
}

export function calcPartialBreakdown(
  startDate: string,
  endDate: string,
  billingCycle: string,
  rentAmount: string | number,
  partialPayment: string | number,
): PartialBreakdown {
  const termMonths = calcLeaseTermMonths(startDate, endDate) || 12;
  const cycleMonths = getBillingCycleMonths(billingCycle);
  const totalCycles = Math.max(1, Math.ceil(termMonths / cycleMonths));
  const baseRent = Number(rentAmount || 0);
  const totalRent = Math.round(baseRent * termMonths * 100) / 100;
  const partialAmount = Number(partialPayment || 0);
  const remainingRent = Math.max(0, Math.round((totalRent - partialAmount) * 100) / 100);
  const remainingCycles = Math.max(0, totalCycles - 1);
  const scheduleAmount = remainingCycles > 0
    ? Math.round((remainingRent / remainingCycles) * 100) / 100
    : 0;

  return {
    termMonths,
    cycleMonths,
    totalCycles,
    totalRent,
    partialAmount,
    remainingRent,
    remainingCycles,
    scheduleAmount,
  };
}

export interface FormState {
  propertyId: string; propertyCode: string;
  floorNumber: string;
  unitId: string;     unitCode: string;
  tenantId: string;   tenantCode: string;
  templateId: string;
  startDate: string; endDate: string; handoverDate: string;
  predefinedType: string;
  billingCycle: string; billingDay: number; paymentDueDays: number;
  rentAmount: string; currency: string; securityDeposit: string;
  escalationType: string; escalationValue: string; escalationFrequency: string;
  escalationMonth: string; escalationDay: string;
  leaseCharges: { chargeTypeId: string; amount: string; calculationType?: 'fixed' | 'per_sqft'; rate?: string | null }[];
  clauses: { title: string; content: string }[];
  specialConditions: string; notes: string;
  rentalAgreement: RentalAgreement;
  paymentType: string;        // 'fully' | 'partially'
  partialPaymentPercent: string; // partial payment amount (used when paymentType === 'partially')
}
