import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeaseTemplatesQuery, useGetLeaseClausesQuery,
  useCreateLeaseMutation,
} from '../../../store/api/leasesApi';
import { ArrowLeft, ArrowRight, Check, Building2, FileText, DollarSign, List } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreateLeasePage.css';

import type { Step, FormState } from './CreateLeasePage/types';
import { UnitTenantStep } from './CreateLeasePage/components/steps/UnitTenantStep';
import { DatesBillingStep } from './CreateLeasePage/components/steps/DatesBillingStep';
import { FinancialsStep } from './CreateLeasePage/components/steps/FinancialsStep';
import { ClausesStep } from './CreateLeasePage/components/steps/ClausesStep';
import { ReviewSubmitStep } from './CreateLeasePage/components/steps/ReviewSubmitStep';

const INITIAL: FormState = {
  propertyId: '', propertyCode: '', unitId: '', unitCode: '', tenantId: '', tenantCode: '', templateId: '',
  startDate: '', endDate: '', handoverDate: '',
  billingCycle: 'monthly', billingDay: 1, paymentDueDays: 7,
  rentAmount: '', currency: 'USD', securityDeposit: '',
  escalationType: '', escalationValue: '', escalationFrequency: 'annual',
  escalationMonth: '', escalationDay: '',
  leaseCharges: [],
  clauses: [], specialConditions: '', notes: '',
};

const STEPS = [
  { n: 1, label: 'Unit & Tenant',   icon: <Building2 size={15} /> },
  { n: 2, label: 'Lease Dates',     icon: <FileText size={15} /> },
  { n: 3, label: 'Financial Terms', icon: <DollarSign size={15} /> },
  { n: 4, label: 'Clauses',         icon: <List size={15} /> },
  { n: 5, label: 'Review',          icon: <Check size={15} /> },
];

export default function CreateLeasePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [createLease, { isLoading }] = useCreateLeaseMutation();
  const { data: templatesData } = useGetLeaseTemplatesQuery();
  const { data: clausesData } = useGetLeaseClausesQuery();

  const set = (k: keyof FormState, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const templates = templatesData?.data || [];
  const clauses   = clausesData?.data  || [];

  const canProceed = (): boolean => {
    if (step === 1) return !!(form.propertyId && form.unitId && form.tenantId);
    if (step === 2) return !!(form.startDate && form.endDate && form.startDate < form.endDate);
    if (step === 3) return !!(form.rentAmount && Number(form.rentAmount) > 0);
    return true;
  };

  const handleSubmit = async () => {
    const payload: Record<string, unknown> = {
      propertyId: form.propertyId, unitId: form.unitId, tenantId: form.tenantId,
      templateId: form.templateId || undefined,
      startDate: form.startDate, endDate: form.endDate,
      handoverDate: form.handoverDate || undefined,
      billingCycle: form.billingCycle, billingDay: form.billingDay, paymentDueDays: form.paymentDueDays,
      rentAmount: Number(form.rentAmount), currency: form.currency,
      securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : 0,
      escalationType:   form.escalationType   || undefined,
      escalationValue:  form.escalationValue  ? Number(form.escalationValue) : undefined,
      escalationFrequency: form.escalationFrequency,
      escalationMonth:  form.escalationMonth  ? Number(form.escalationMonth) : undefined,
      escalationDay:    form.escalationDay    ? Number(form.escalationDay)   : undefined,
      clauses: form.clauses, specialConditions: form.specialConditions || undefined, notes: form.notes || undefined,
      leaseCharges: form.leaseCharges.length
        ? form.leaseCharges.map(c => ({ chargeTypeId: c.chargeTypeId, amount: Number(c.amount) }))
        : undefined,
    };

    try {
      const result = await createLease(payload).unwrap();
      toast.success(`Lease ${result.data.leaseNumber} created`);
      navigate(`/admin/leases/${result.data.id}`);
    } catch (e: any) {
      const msg = e?.data?.errors?.[0]?.message || e?.data?.message || 'Failed to create lease';
      toast.error(msg);
    }
  };

  return (
    <div className="create-lease-page">
      <div className="cl-header">
        <button className="back-btn" onClick={() => navigate('/admin/leases')}><ArrowLeft size={16} /> Leases</button>
        <h1>New Lease</h1>
      </div>

      {/* Steps */}
      <div className="cl-steps">
        {STEPS.map((s) => (
          <div key={s.n} className={`cl-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
            <div className="step-dot">{step > s.n ? <Check size={13} /> : s.icon}</div>
            <span className="step-label">{s.label}</span>
            {s.n < 5 && <div className="step-line" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="cl-body">
        {step === 1 && <UnitTenantStep form={form} set={set} templates={templates} />}
        {step === 2 && <DatesBillingStep form={form} set={set} />}
        {step === 3 && <FinancialsStep form={form} set={set} />}
        {step === 4 && <ClausesStep form={form} set={set} libraryClauseList={clauses} />}
        {step === 5 && <ReviewSubmitStep form={form} />}
      </div>

      {/* Footer */}
      <div className="cl-footer">
        {step > 1 && <button className="btn-ghost" onClick={() => setStep((s) => (s - 1) as Step)}><ArrowLeft size={14} /> Back</button>}
        <div className="footer-right">
          {step < 5 ? (
            <button className="btn-primary" disabled={!canProceed()} onClick={() => setStep((s) => (s + 1) as Step)}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Creating…' : 'Create Lease'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
