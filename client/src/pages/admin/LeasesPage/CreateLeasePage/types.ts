export type Step = 1 | 2 | 3 | 4 | 5;

export interface FormState {
  propertyId: string; unitId: string; tenantId: string; templateId: string;
  startDate: string; endDate: string; handoverDate: string;
  billingCycle: string; billingDay: number; paymentDueDays: number;
  rentAmount: string; currency: string; securityDeposit: string;
  escalationType: string; escalationValue: string; escalationFrequency: string;
  escalationMonth: string; escalationDay: string;
  clauses: { title: string; content: string }[];
  specialConditions: string; notes: string;
}
