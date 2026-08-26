export type Step = 1 | 2 | 3 | 4 | 5;

export interface FormState {
  propertyId: string; propertyCode: string;
  unitId: string;     unitCode: string;
  tenantId: string;   tenantCode: string;
  templateId: string;
  startDate: string; endDate: string; handoverDate: string;
  billingCycle: string; billingDay: number; paymentDueDays: number;
  rentAmount: string; currency: string; securityDeposit: string;
  escalationType: string; escalationValue: string; escalationFrequency: string;
  escalationMonth: string; escalationDay: string;
  leaseCharges: { chargeTypeId: string; amount: string }[];
  clauses: { title: string; content: string }[];
  specialConditions: string; notes: string;
}
