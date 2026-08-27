import type { RentalAgreement } from '../../../../store/api/leasesApi';

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

export const PREDEFINED_TYPE_LABELS: Record<string, string> = {
  prerenewal: 'Prerenewal',
  precontractend: 'Precontractend',
};

export interface FormState {
  propertyId: string; propertyCode: string;
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
}
