import { useEffect } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import type { FormState } from '../../types';

export function FinancialsStep({ form, set }: { form: FormState; set: Function }) {

  // Fetch unit detail to get the rate
  const { data: unitData } = useGetUnitQuery(
    form.propertyId && form.unitId
      ? { propertyId: form.propertyId, unitId: form.unitId }
      : skipToken,
  );

  // Auto-fill Base Rent from unit rate when unit is selected and rent is empty
  useEffect(() => {
    if (unitData?.data?.rate != null && !form.rentAmount) {
      set('rentAmount', String(unitData.data.rate));
    }
  }, [unitData]);

  const unitRate = unitData?.data?.rate ?? null;
  const prefilledFromUnit = unitRate != null && form.rentAmount === String(unitRate);

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
          <input
            type="number"
            min={0}
            placeholder="e.g. 3500"
            value={form.rentAmount}
            onChange={(e) => set('rentAmount', e.target.value)}
          />
          {prefilledFromUnit && (
            <span className="field-hint">Pre-filled from unit rate</span>
          )}
        </div>
        <div className="form-field">
          <label>Currency</label>
          <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {['USD','SGD','EUR','GBP','AED','THB','MMK'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Security Deposit</label>
          <input type="number" min={0} placeholder="e.g. 7000" value={form.securityDeposit} onChange={(e) => set('securityDeposit', e.target.value)} />
        </div>
      </div>

      {/* ── Rent Escalation ── */}
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
