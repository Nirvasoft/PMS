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
  leaseCharges: { chargeTypeId: string; amount: string }[];
  clauses: { title: string; content: string }[];
  specialConditions: string; notes: string;
  rentalAgreement: RentalAgreement;
  paymentType: string;        // 'fully' | 'partially'
  partialPaymentPercent: string; // partial payment amount (used when paymentType === 'partially')
}
