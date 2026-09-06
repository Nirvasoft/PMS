import { useEffect, useRef } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery, useGetUnitChargesQuery } from '../../../../../../store/api/unitsApi';
import { useGetChargeTypesQuery } from '../../../../../../store/api/billingApi';
import { useGetPropertyQuery } from '../../../../../../store/api/propertiesApi';
import { CURRENCIES } from '../../../../../../constants/currencies';
import type { FormState } from '../../types';

// BillingSchedule/Lease amount columns are Decimal(15,2) — 13 integer digits max.
const MAX_MONEY_INT_DIGITS = 13;

/** Strips everything but digits/one decimal point and caps length to fit the DB column. */
function sanitizeMoneyInput(raw: string): string {
  let cleaned = raw.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = cleaned.split('.');
  const boundedInt = intPart.slice(0, MAX_MONEY_INT_DIGITS);
  return decPart !== undefined ? `${boundedInt}.${decPart.slice(0, 2)}` : boundedInt;
}

/** Adds thousand separators to a plain numeric string for display. */
function formatMoneyDisplay(value: string): string {
  if (!value) return '';
  const [intPart, decPart] = value.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

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

  // Default the currency to the selected property's own currency, but let the user
  // override it — re-sync only while they haven't picked a currency by hand for this
  // property, so switching property doesn't clobber a deliberate manual choice.
  const { data: propertyData } = useGetPropertyQuery(form.propertyId || skipToken);
  const manualCurrency = useRef(false);
  useEffect(() => { manualCurrency.current = false; }, [form.propertyId]);
  useEffect(() => {
    if (propertyData?.data?.currency && !manualCurrency.current) {
      set('currency', propertyData.data.currency);
    }
  }, [propertyData]);

  // ── Lease Charges — seeded from whatever charges are already set up on the unit ──
  const { data: unitChargesData } = useGetUnitChargesQuery(
    form.propertyId && form.unitId
      ? { propertyId: form.propertyId, unitId: form.unitId }
      : skipToken,
  );
  const unitCharges = unitChargesData?.data || [];
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const chargeTypes = chargeTypesData?.data || [];
  const chargeTypeName = (id: string) =>
    unitCharges.find((c) => c.chargeType.id === id)?.chargeType.name
    || chargeTypes.find((t) => t.id === id)?.name
    || 'Unknown charge';

  // Re-seed leaseCharges from the unit's own charges once its data has actually
  // loaded (not before — else we'd lock in an empty seed on the first render).
  const seededForUnit = useRef<string | null>(null);
  useEffect(() => {
    if (!form.unitId || !unitChargesData) { return; }
    if (seededForUnit.current === form.unitId) return;
    seededForUnit.current = form.unitId;
    set('leaseCharges', unitCharges.map((c) => ({ chargeTypeId: c.chargeType.id, amount: Number(c.amount).toFixed(2) })));
  }, [form.unitId, unitChargesData]);
  useEffect(() => {
    if (!form.unitId) seededForUnit.current = null;
  }, [form.unitId]);

  // Edits stay local to the lease draft while the wizard is in progress — the
  // unit's own charge records only get patched after the lease is created
  // (see CreateLeasePage.handleSubmit), not on every blur here.
  const editChargeAmount = (chargeTypeId: string, amount: string) => {
    set('leaseCharges', form.leaseCharges.map((c) => c.chargeTypeId === chargeTypeId ? { ...c, amount } : c));
  };
  const commitChargeAmount = (chargeTypeId: string, amount: string) => {
    const normalized = Number(amount || 0).toFixed(2);
    set('leaseCharges', form.leaseCharges.map((c) => c.chargeTypeId === chargeTypeId ? { ...c, amount: normalized } : c));
  };

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
            type="text"
            inputMode="decimal"
            placeholder="e.g. 3,500"
            value={formatMoneyDisplay(form.rentAmount)}
            onChange={(e) => set('rentAmount', sanitizeMoneyInput(e.target.value))}
          />
          {prefilledFromUnit && (
            <span className="field-hint">Pre-filled from unit rate</span>
          )}
        </div>
        <div className="form-field">
          <label>Currency</label>
          <select value={form.currency} onChange={(e) => { manualCurrency.current = true; set('currency', e.target.value); }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Security Deposit</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 7,000"
            value={formatMoneyDisplay(form.securityDeposit)}
            onChange={(e) => set('securityDeposit', sanitizeMoneyInput(e.target.value))}
          />
        </div>
      </div>

      {/* ── Lease Charges ── */}
      <div className="unit-charges-panel">
        <div className="unit-charges-panel-head">Lease Charges <span className="optional">(optional)</span></div>
        {!form.unitId ? (
          <p className="unit-charges-empty">Select a unit to see its configured charges.</p>
        ) : form.leaseCharges.length === 0 ? (
          <p className="unit-charges-empty">No charges assigned to this unit.</p>
        ) : (
          <table className="charges-table">
            <thead>
              <tr><th>Charge</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {form.leaseCharges.map((c) => (
                <tr key={c.chargeTypeId}>
                  <td>{chargeTypeName(c.chargeTypeId)}</td>
                  <td className="text-right">
                    <input
                      className="charge-amount-input"
                      type="text"
                      inputMode="decimal"
                      value={formatMoneyDisplay(c.amount)}
                      onChange={(e) => editChargeAmount(c.chargeTypeId, sanitizeMoneyInput(e.target.value))}
                      onBlur={(e) => commitChargeAmount(c.chargeTypeId, sanitizeMoneyInput(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
