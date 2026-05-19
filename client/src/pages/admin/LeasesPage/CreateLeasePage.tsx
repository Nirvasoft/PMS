import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeaseTemplatesQuery, useGetLeaseClausesQuery,
  useGetLeasesQuery, useCreateLeaseMutation,
} from '../../../store/api/leasesApi';
import { ArrowLeft, ArrowRight, Check, Building2, User, FileText, DollarSign, List } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreateLeasePage.css';

type Step = 1 | 2 | 3 | 4 | 5;

interface FormState {
  propertyId: string; unitId: string; tenantId: string; templateId: string;
  startDate: string; endDate: string; handoverDate: string;
  billingCycle: string; billingDay: number; paymentDueDays: number;
  rentAmount: string; currency: string; securityDeposit: string;
  escalationType: string; escalationValue: string; escalationFrequency: string;
  escalationMonth: string; escalationDay: string;
  clauses: { title: string; content: string }[];
  specialConditions: string; notes: string;
}

const INITIAL: FormState = {
  propertyId: '', unitId: '', tenantId: '', templateId: '',
  startDate: '', endDate: '', handoverDate: '',
  billingCycle: 'monthly', billingDay: 1, paymentDueDays: 7,
  rentAmount: '', currency: 'USD', securityDeposit: '',
  escalationType: '', escalationValue: '', escalationFrequency: 'annual',
  escalationMonth: '', escalationDay: '',
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
    };

    try {
      const result = await createLease(payload).unwrap();
      toast.success(`Lease ${result.data.leaseNumber} created`);
      navigate(`/admin/leases/${result.data.id}`);
    } catch (e: any) {
      const msg = e?.data?.message || 'Failed to create lease';
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
        {step === 1 && <Step1 form={form} set={set} templates={templates} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} set={set} />}
        {step === 4 && <Step4 form={form} set={set} libraryClauseList={clauses} />}
        {step === 5 && <Step5 form={form} />}
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

// ── Step 1: Unit & Tenant ────────────────────
function Step1({ form, set, templates }: { form: FormState; set: Function; templates: any[] }) {
  return (
    <div className="step-content">
      <h3>Select Unit & Tenant</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Property ID *</label>
          <input placeholder="Property UUID" value={form.propertyId} onChange={(e) => set('propertyId', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Unit ID * <span className="hint">(must be available)</span></label>
          <input placeholder="Unit UUID" value={form.unitId} onChange={(e) => set('unitId', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Tenant ID * <span className="hint">(must be KYC verified)</span></label>
          <input placeholder="Tenant UUID" value={form.tenantId} onChange={(e) => set('tenantId', e.target.value)} />
        </div>
        {templates.length > 0 && (
          <div className="form-field">
            <label>Lease Template <span className="optional">(optional)</span></label>
            <select value={form.templateId} onChange={(e) => set('templateId', e.target.value)}>
              <option value="">No template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="step-info">
        <p>💡 In a future update, these fields will have searchable autocomplete pickers for units and tenants.</p>
      </div>
    </div>
  );
}

// ── Step 2: Dates ────────────────────────────
function Step2({ form, set }: { form: FormState; set: Function }) {
  return (
    <div className="step-content">
      <h3>Lease Dates & Billing</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Start Date *</label>
          <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>End Date *</label>
          <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Handover Date <span className="optional">(optional)</span></label>
          <input type="date" value={form.handoverDate} onChange={(e) => set('handoverDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Billing Cycle *</label>
          <select value={form.billingCycle} onChange={(e) => set('billingCycle', e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className="form-field">
          <label>Billing Day (1–28)</label>
          <input type="number" min={1} max={28} value={form.billingDay} onChange={(e) => set('billingDay', parseInt(e.target.value))} />
        </div>
        <div className="form-field">
          <label>Payment Due Days</label>
          <input type="number" min={1} max={30} value={form.paymentDueDays} onChange={(e) => set('paymentDueDays', parseInt(e.target.value))} />
        </div>
      </div>
      {form.startDate && form.endDate && form.endDate > form.startDate && (
        <div className="dates-summary">
          Lease term: <strong>{Math.max(1, (new Date(form.endDate).getFullYear() - new Date(form.startDate).getFullYear()) * 12 + new Date(form.endDate).getMonth() - new Date(form.startDate).getMonth())} months</strong>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Financial ────────────────────────
function Step3({ form, set }: { form: FormState; set: Function }) {
  // Preview escalation
  const previewEscalations = () => {
    if (!form.escalationType || !form.escalationValue || !form.startDate || !form.endDate) return [];
    let rent = Number(form.rentAmount);
    const previews: { date: string; rent: number }[] = [];
    const freqMonths = form.escalationFrequency === 'biennial' ? 24 : 12;
    let d = new Date(form.startDate);
    d.setMonth(d.getMonth() + freqMonths);
    if (form.escalationMonth) d.setMonth(Number(form.escalationMonth) - 1);
    const end = new Date(form.endDate);
    while (d <= end && previews.length < 5) {
      if (form.escalationType === 'fixed_percent') rent = Math.round(rent * (1 + Number(form.escalationValue) / 100) * 100) / 100;
      else if (form.escalationType === 'fixed_amount') rent = Math.round((rent + Number(form.escalationValue)) * 100) / 100;
      previews.push({ date: d.toLocaleDateString(), rent });
      d = new Date(d); d.setMonth(d.getMonth() + freqMonths);
    }
    return previews;
  };
  const esc = previewEscalations();

  return (
    <div className="step-content">
      <h3>Financial Terms</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Base Rent *</label>
          <input type="number" min={0} placeholder="e.g. 3500" value={form.rentAmount} onChange={(e) => set('rentAmount', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Currency</label>
          <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {['USD','SGD','EUR','GBP','AED','THB','MMK','USD'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Security Deposit</label>
          <input type="number" min={0} placeholder="e.g. 7000" value={form.securityDeposit} onChange={(e) => set('securityDeposit', e.target.value)} />
        </div>
      </div>

      <div className="section-divider">Rent Escalation <span className="optional">(optional)</span></div>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Escalation Type</label>
          <select value={form.escalationType} onChange={(e) => set('escalationType', e.target.value)}>
            <option value="">None</option>
            <option value="fixed_percent">Fixed % per period</option>
            <option value="fixed_amount">Fixed amount per period</option>
          </select>
        </div>
        {form.escalationType && (
          <>
            <div className="form-field">
              <label>{form.escalationType === 'fixed_percent' ? 'Rate (%)' : 'Amount'}</label>
              <input type="number" min={0} placeholder={form.escalationType === 'fixed_percent' ? 'e.g. 3' : 'e.g. 200'} value={form.escalationValue} onChange={(e) => set('escalationValue', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Frequency</label>
              <select value={form.escalationFrequency} onChange={(e) => set('escalationFrequency', e.target.value)}>
                <option value="annual">Annual</option>
                <option value="biennial">Biennial</option>
              </select>
            </div>
            <div className="form-field">
              <label>Escalation Month (1–12)</label>
              <input type="number" min={1} max={12} placeholder="e.g. 2 = February" value={form.escalationMonth} onChange={(e) => set('escalationMonth', e.target.value)} />
            </div>
          </>
        )}
      </div>

      {esc.length > 0 && (
        <div className="escalation-preview">
          <div className="ep-title">📈 Projected escalations</div>
          <table><tbody>
            {esc.map((e, i) => (
              <tr key={i}><td>{e.date}</td><td>{form.currency} {e.rent.toLocaleString()}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Clauses ──────────────────────────
function Step4({ form, set, libraryClauseList }: { form: FormState; set: Function; libraryClauseList: any[] }) {
  const [customTitle, setCustomTitle] = useState('');
  const [customContent, setCustomContent] = useState('');

  const addLibraryClause = (c: { title: string; content: string }) => {
    if (form.clauses.some((x) => x.title === c.title)) return;
    set('clauses', [...form.clauses, { title: c.title, content: c.content }]);
  };

  const addCustom = () => {
    if (!customTitle || !customContent) return;
    set('clauses', [...form.clauses, { title: customTitle, content: customContent }]);
    setCustomTitle(''); setCustomContent('');
  };

  return (
    <div className="step-content">
      <h3>Clauses & Special Conditions</h3>

      {libraryClauseList.length > 0 && (
        <div className="clause-library">
          <div className="cl-label">Clause Library</div>
          {libraryClauseList.map((c) => {
            const added = form.clauses.some((x) => x.title === c.title);
            return (
              <div key={c.id} className={`lib-clause ${added ? 'added' : ''}`}>
                <div className="lc-info">
                  <span className="lc-title">{c.title}</span>
                  {c.isStandard && <span className="std-badge">Standard</span>}
                </div>
                <button disabled={added} onClick={() => addLibraryClause(c)}>{added ? '✓ Added' : '+ Add'}</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="selected-clauses">
        <div className="cl-label">Selected Clauses ({form.clauses.length})</div>
        {form.clauses.map((c, i) => (
          <div key={i} className="sel-clause">
            <strong>{c.title}</strong>
            <p>{c.content.slice(0, 120)}{c.content.length > 120 ? '…' : ''}</p>
            <button onClick={() => set('clauses', form.clauses.filter((_, j) => j !== i))}>✕ Remove</button>
          </div>
        ))}
        {form.clauses.length === 0 && <div className="empty-sm">No clauses selected</div>}
      </div>

      <div className="custom-clause-form">
        <div className="cl-label">Add Custom Clause</div>
        <input placeholder="Clause title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
        <textarea placeholder="Clause content…" rows={3} value={customContent} onChange={(e) => setCustomContent(e.target.value)} />
        <button className="btn-primary-sm" disabled={!customTitle || !customContent} onClick={addCustom}>Add Clause</button>
      </div>

      <div className="form-field" style={{ marginTop: 16 }}>
        <label>Special Conditions</label>
        <textarea placeholder="Any special conditions not covered by clauses…" rows={3} value={form.specialConditions} onChange={(e) => set('specialConditions', e.target.value)} />
      </div>
    </div>
  );
}

// ── Step 5: Review ───────────────────────────
function Step5({ form }: { form: FormState }) {
  const TermMonths = form.startDate && form.endDate && form.endDate > form.startDate
    ? (new Date(form.endDate).getFullYear() - new Date(form.startDate).getFullYear()) * 12 + new Date(form.endDate).getMonth() - new Date(form.startDate).getMonth()
    : 0;

  return (
    <div className="step-content">
      <h3>Review & Confirm</h3>
      <div className="review-grid">
        <ReviewRow label="Property ID" value={form.propertyId} />
        <ReviewRow label="Unit ID"     value={form.unitId} />
        <ReviewRow label="Tenant ID"   value={form.tenantId} />
        <ReviewRow label="Start Date"  value={form.startDate} />
        <ReviewRow label="End Date"    value={form.endDate} />
        <ReviewRow label="Term"        value={`${TermMonths} months`} />
        <ReviewRow label="Rent"        value={`${form.currency} ${Number(form.rentAmount || 0).toLocaleString()}`} />
        <ReviewRow label="Deposit"     value={form.securityDeposit ? `${form.currency} ${Number(form.securityDeposit).toLocaleString()}` : '—'} />
        <ReviewRow label="Billing"     value={`${form.billingCycle}, day ${form.billingDay}`} />
        <ReviewRow label="Escalation"  value={form.escalationType ? `${form.escalationType} · ${form.escalationValue} · ${form.escalationFrequency}` : 'None'} />
        <ReviewRow label="Clauses"     value={`${form.clauses.length} clause(s)`} />
      </div>
      <div className="review-note">
        <p>The lease will be created in <strong>Draft</strong> status. You can then submit it for approval.</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span className="rr-label">{label}</span>
      <span className="rr-value">{value || '—'}</span>
    </div>
  );
}
