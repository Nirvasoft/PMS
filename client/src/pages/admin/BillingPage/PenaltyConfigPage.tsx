import { useState, useMemo } from 'react';
import { useGetPenaltyConfigsQuery, useCreatePenaltyConfigMutation, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { Shield, Plus, AlertTriangle, Percent, DollarSign, Clock, X } from 'lucide-react';
import { useAlertDialog } from '../../../components/DialogProvider';
import './BillingPage.css';

const PENALTY_TYPES: Record<string, string> = {
  percentage: 'Flat Percentage',
  fixed_amount: 'Fixed Amount',
  percentage_per_day: '% Per Day',
  tiered: 'Tiered',
};

export default function PenaltyConfigPage() {
  const { data: configsData, isFetching } = useGetPenaltyConfigsQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const [createConfig, { isLoading: creating }] = useCreatePenaltyConfigMutation();
  const alertDialog = useAlertDialog();

  const configs = configsData?.data || [];
  const properties = propertiesData?.data || [];
  const chargeTypes = chargeTypesData?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    propertyId: '', chargeTypeId: '', gracePeriodDays: 7,
    penaltyType: 'percentage' as string, penaltyValue: 5,
    maxPenaltyPct: 25, compound: false,
  });

  // Preview calculation
  const preview = useMemo(() => {
    const base = 10000;
    const days = [7, 14, 30, 60];
    return days.map(d => {
      let amount = 0;
      switch (form.penaltyType) {
        case 'fixed_amount': amount = form.penaltyValue; break;
        case 'percentage': amount = base * (form.penaltyValue / 100); break;
        case 'percentage_per_day':
          amount = form.compound
            ? base * (Math.pow(1 + form.penaltyValue / 100, d) - 1)
            : base * (form.penaltyValue / 100) * d;
          break;
        default: amount = 0;
      }
      if (form.maxPenaltyPct > 0) {
        const cap = base * (form.maxPenaltyPct / 100);
        amount = Math.min(amount, cap);
      }
      return { days: d, amount: Math.round(amount * 100) / 100 };
    });
  }, [form.penaltyType, form.penaltyValue, form.maxPenaltyPct, form.compound]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createConfig({
        ...(form.propertyId ? { propertyId: form.propertyId } : {}),
        ...(form.chargeTypeId ? { chargeTypeId: form.chargeTypeId } : {}),
        gracePeriodDays: form.gracePeriodDays,
        penaltyType: form.penaltyType,
        penaltyValue: form.penaltyValue,
        maxPenaltyPct: form.maxPenaltyPct || undefined,
        compound: form.compound,
      }).unwrap();
      setShowForm(false);
      setForm({ propertyId: '', chargeTypeId: '', gracePeriodDays: 7, penaltyType: 'percentage', penaltyValue: 5, maxPenaltyPct: 25, compound: false });
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to create penalty config');
    }
  };

  const getPropertyName = (id: string | null) => {
    if (!id) return 'All Properties';
    const p = properties.find((prop: any) => prop.id === id);
    return p ? (p as any).name : id;
  };

  const getChargeTypeName = (id: string | null) => {
    if (!id) return 'All Charge Types';
    const ct = chargeTypes.find(c => c.id === id);
    return ct ? ct.name : id;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <Shield size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Penalty Configuration</h1>
            <p>Configure late payment penalties for overdue invoices</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Config
          </button>
        </div>
      </div>

      {/* Configs Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Charge Type</th>
              <th>Grace Period</th>
              <th>Penalty Type</th>
              <th className="text-right">Value</th>
              <th className="text-right">Max Cap</th>
              <th className="text-center">Compound</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && configs.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">Loading…</td></tr>
            ) : configs.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">
                <AlertTriangle size={20} style={{ marginBottom: 8, opacity: 0.5 }} /><br />
                No penalty configs yet. Create one to apply late payment penalties.
              </td></tr>
            ) : configs.map((cfg: any) => (
              <tr key={cfg.id}>
                <td><span className="cell-primary">{getPropertyName(cfg.propertyId)}</span></td>
                <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{getChargeTypeName(cfg.chargeTypeId)}</span></td>
                <td>
                  <span className="charge-type-badge misc">
                    <Clock size={10} /> {cfg.gracePeriodDays} days
                  </span>
                </td>
                <td><span style={{ fontSize: 13 }}>{PENALTY_TYPES[cfg.penaltyType] || cfg.penaltyType}</span></td>
                <td className="text-right">
                  <span className="cell-amount overdue">
                    {cfg.penaltyType === 'fixed_amount'
                      ? formatCurrency(Number(cfg.penaltyValue))
                      : `${Number(cfg.penaltyValue)}%`}
                  </span>
                </td>
                <td className="text-right">
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {cfg.maxPenaltyPct ? `${Number(cfg.maxPenaltyPct)}%` : '—'}
                  </span>
                </td>
                <td className="text-center">
                  {cfg.compound
                    ? <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700 }}>Yes</span>
                    : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>No</span>}
                </td>
                <td>
                  {cfg.isActive !== false
                    ? <span className="sched-status sched-status--active">Active</span>
                    : <span className="sched-status sched-status--cancelled">Inactive</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Shield size={18} /> New Penalty Configuration</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Property (optional)</label>
                    <select value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })}>
                      <option value="">All Properties (company-wide)</option>
                      {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Charge Type (optional)</label>
                    <select value={form.chargeTypeId} onChange={e => setForm({ ...form, chargeTypeId: e.target.value })}>
                      <option value="">All Charge Types</option>
                      {chargeTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Grace Period (Days) <span className="req">*</span></label>
                    <input type="number" required min={0} max={90} value={form.gracePeriodDays}
                      onChange={e => setForm({ ...form, gracePeriodDays: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Penalty Type <span className="req">*</span></label>
                    <select required value={form.penaltyType} onChange={e => setForm({ ...form, penaltyType: e.target.value })}>
                      {Object.entries(PENALTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>
                      {form.penaltyType === 'fixed_amount' ? 'Penalty Amount' : 'Penalty Rate (%)'} <span className="req">*</span>
                    </label>
                    <input type="number" required min={0} step={0.01} value={form.penaltyValue}
                      onChange={e => setForm({ ...form, penaltyValue: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Max Penalty Cap (% of invoice)</label>
                    <input type="number" min={0} max={100} step={1} value={form.maxPenaltyPct}
                      onChange={e => setForm({ ...form, maxPenaltyPct: Number(e.target.value) })} />
                  </div>
                </div>

                {form.penaltyType === 'percentage_per_day' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.compound} onChange={e => setForm({ ...form, compound: e.target.checked })} />
                    Compound interest (daily compounding)
                  </label>
                )}

                {/* Preview */}
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Penalty Preview (on $10,000 invoice)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {preview.map(p => (
                      <div key={p.days} style={{
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{p.days} days overdue</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>{formatCurrency(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Saving…' : 'Create Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
