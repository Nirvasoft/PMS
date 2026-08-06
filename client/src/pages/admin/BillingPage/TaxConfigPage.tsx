import { useState } from 'react';
import { useGetTaxConfigsQuery, useCreateTaxConfigMutation, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { Calculator, Plus, X, Percent, Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';
import './BillingPage.css';

export default function TaxConfigPage() {
  const { data: taxData, isFetching } = useGetTaxConfigsQuery();
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const [createTax, { isLoading: creating }] = useCreateTaxConfigMutation();

  const taxes = taxData?.data || [];
  const chargeTypes = chargeTypesData?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    taxName: '', taxRate: 0.09, appliesTo: [] as string[],
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
  });

  const toggleCharge = (code: string) => {
    setForm(prev => ({
      ...prev,
      appliesTo: prev.appliesTo.includes(code)
        ? prev.appliesTo.filter(c => c !== code)
        : [...prev.appliesTo, code],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTax({
        taxName: form.taxName,
        taxRate: form.taxRate,
        appliesTo: form.appliesTo.length > 0 ? form.appliesTo : undefined,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
      }).unwrap();
      setShowForm(false);
      setForm({ taxName: '', taxRate: 0.09, appliesTo: [], effectiveFrom: new Date().toISOString().split('T')[0], effectiveTo: '' });
    } catch (err: any) {
      alert(err?.data?.message || 'Failed to create tax config');
    }
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
            <Calculator size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Tax Configuration</h1>
            <p>Manage GST, VAT, and other tax rates applied to charges</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Tax Config
          </button>
        </div>
      </div>

      {/* Tax Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Tax Name</th>
              <th className="text-right">Rate</th>
              <th>Applies To</th>
              <th>Effective From</th>
              <th>Effective To</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && taxes.length === 0 ? (
              <tr><td colSpan={6} className="billing-empty">Loading…</td></tr>
            ) : taxes.length === 0 ? (
              <tr><td colSpan={6} className="billing-empty">
                <Calculator size={20} style={{ marginBottom: 8, opacity: 0.5 }} /><br />
                No tax configurations yet. Create one to apply taxes to invoices.
              </td></tr>
            ) : taxes.map((tax: any) => (
              <tr key={tax.id}>
                <td>
                  <div className="cell-primary">{tax.taxName}</div>
                </td>
                <td className="text-right">
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>
                    {(Number(tax.taxRate) * 100).toFixed(1)}%
                  </span>
                </td>
                <td>
                  {(!tax.appliesTo || tax.appliesTo.length === 0) ? (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>All taxable charges</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {tax.appliesTo.map((code: string) => (
                        <span key={code} className="charge-type-badge misc" style={{ fontSize: 9 }}>{code}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {format(new Date(tax.effectiveFrom), 'MMM d, yyyy')}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {tax.effectiveTo ? format(new Date(tax.effectiveTo), 'MMM d, yyyy') : '—'}
                  </span>
                </td>
                <td>
                  {tax.isActive !== false
                    ? <span className="sched-status sched-status--active">Active</span>
                    : <span className="sched-status sched-status--cancelled">Expired</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Calculator size={18} /> New Tax Configuration</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Tax Name <span className="req">*</span></label>
                    <input required placeholder="e.g. GST, VAT, SST" value={form.taxName}
                      onChange={e => setForm({ ...form, taxName: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Tax Rate (decimal) <span className="req">*</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" required min={0} max={1} step={0.001}
                        value={form.taxRate}
                        onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })}
                        style={{ flex: 1 }} />
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#fbbf24', whiteSpace: 'nowrap' }}>
                        = {(form.taxRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="inv-field">
                    <label>Effective From <span className="req">*</span></label>
                    <input type="date" required value={form.effectiveFrom}
                      onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Effective To (optional)</label>
                    <input type="date" value={form.effectiveTo}
                      onChange={e => setForm({ ...form, effectiveTo: e.target.value })} />
                  </div>
                </div>

                {/* Charge type selection */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Applies To Charge Types (leave unchecked = all taxable charges)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {chargeTypes.filter(ct => ct.isActive).map(ct => (
                      <label key={ct.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                        background: form.appliesTo.includes(ct.code) ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.appliesTo.includes(ct.code) ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)',
                        transition: 'all 0.15s',
                      }}>
                        <input type="checkbox" checked={form.appliesTo.includes(ct.code)}
                          onChange={() => toggleCharge(ct.code)}
                          style={{ accentColor: 'var(--primary)' }} />
                        <Tag size={12} style={{ color: 'var(--text-tertiary)' }} />
                        {ct.name}
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({ct.code})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Saving…' : 'Create Tax Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
