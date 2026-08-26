import { useEffect, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetChargeTypesQuery } from '../../../../../../store/api/billingApi';
import { Plus, X } from 'lucide-react';
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

  // Charge types from setup
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const chargeTypes = (chargeTypesData?.data || []).filter(ct => ct.isActive);

  const [newChargeTypeId, setNewChargeTypeId] = useState('');
  const [newAmount, setNewAmount]             = useState('');

  const addCharge = () => {
    if (!newChargeTypeId || !newAmount) return;
    set('leaseCharges', [...form.leaseCharges, { chargeTypeId: newChargeTypeId, amount: newAmount }]);
    setNewChargeTypeId('');
    setNewAmount('');
  };

  const removeCharge = (idx: number) =>
    set('leaseCharges', form.leaseCharges.filter((_, i) => i !== idx));

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

      {/* ── Charges ── */}
      <div className="section-divider">Charges <span className="optional">(optional)</span></div>

      {form.leaseCharges.length > 0 && (
        <table className="charges-table">
          <thead>
            <tr>
              <th>Charge Type</th>
              <th>Category</th>
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.leaseCharges.map((line, idx) => {
              const ct = chargeTypes.find(c => c.id === line.chargeTypeId);
              return (
                <tr key={idx}>
                  <td>{ct ? `${ct.code} — ${ct.name}` : '—'}</td>
                  <td><span className={`charge-type-badge ${ct?.category || ''}`}>{ct?.category || '—'}</span></td>
                  <td className="text-right">{form.currency} {Number(line.amount).toLocaleString()}</td>
                  <td>
                    <button type="button" className="charge-remove-btn" onClick={() => removeCharge(idx)}>
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="charge-add-row">
        <div className="form-field">
          <label>Charge Type</label>
          <select value={newChargeTypeId} onChange={(e) => setNewChargeTypeId(e.target.value)}>
            <option value="">— Select charge type —</option>
            {['rent','utility','service','parking','penalty','deposit','misc'].map(cat => {
              const group = chargeTypes.filter(ct => ct.category === cat);
              if (!group.length) return null;
              return (
                <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                  {group.map(ct => (
                    <option key={ct.id} value={ct.id}>{ct.code} — {ct.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="form-field charge-amount-field">
          <label>Amount</label>
          <div className="charge-amount-row">
            <input
              type="number" min={0} placeholder="0"
              value={newAmount} onChange={(e) => setNewAmount(e.target.value)}
            />
            <button type="button" className="charge-add-btn" onClick={addCharge} disabled={!newChargeTypeId || !newAmount}>
              <Plus size={14} /> Add
            </button>
          </div>
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
