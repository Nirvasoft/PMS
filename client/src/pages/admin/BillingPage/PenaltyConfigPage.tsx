import { useState, useMemo } from 'react';
import { useGetPenaltyConfigsQuery, useCreatePenaltyConfigMutation, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { Shield, Plus, AlertTriangle, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';
import './BillingPage.css';

const PENALTY_TYPES: Record<string, string> = {
  percentage: 'Flat Percentage',
  fixed_amount: 'Fixed Amount',
  percentage_per_day: '% Per Day',
  tiered: 'Tiered',
};

export default function PenaltyConfigPage() {
  const selectedPropertyId = useSelectedPropertyId();
  const { data: configsData, isFetching } = useGetPenaltyConfigsQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createConfig, { isLoading: creating }] = useCreatePenaltyConfigMutation();
  const alertDialog = useAlertDialog();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showForm, setShowForm] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    propertyId: '', chargeTypeId: '', gracePeriodDays: '7',
    penaltyType: 'percentage' as string, penaltyValue: '5',
    maxPenaltyPct: '25', compound: false,
  });

  const effectivePropertyId = form.propertyId || selectedPropertyId || undefined;
  const { data: chargeTypesData } = useGetChargeTypesQuery(
    effectivePropertyId ? { propertyId: effectivePropertyId } : undefined,
  );

  const configs = configsData?.data || [];
  const properties = propertiesData?.data || [];
  const chargeTypes = chargeTypesData?.data || [];

  const graceNum = Number(form.gracePeriodDays);
  const penaltyNum = Number(form.penaltyValue);
  const maxCapNum = Number(form.maxPenaltyPct);

  // Preview calculation
  const preview = useMemo(() => {
    const base = 10000;
    const days = [7, 14, 30, 60];
    const val = isNaN(penaltyNum) ? 0 : penaltyNum;
    const capPct = isNaN(maxCapNum) ? 0 : maxCapNum;
    return days.map(d => {
      let amount: number;
      switch (form.penaltyType) {
        case 'fixed_amount': amount = val; break;
        case 'percentage': amount = base * (val / 100); break;
        case 'percentage_per_day':
          amount = form.compound
            ? base * (Math.pow(1 + val / 100, d) - 1)
            : base * (val / 100) * d;
          break;
        default: amount = 0;
      }
      if (capPct > 0) {
        const cap = base * (capPct / 100);
        amount = Math.min(amount, cap);
      }
      return { days: d, amount: Math.round(amount * 100) / 100 };
    });
  }, [form.penaltyType, penaltyNum, maxCapNum, form.compound]);

  const openCreate = () => {
    setHasAttemptedSubmit(false);
    setForm({ propertyId: '', chargeTypeId: '', gracePeriodDays: '7', penaltyType: 'percentage', penaltyValue: '5', maxPenaltyPct: '25', compound: false });
    setShowForm(true);
  };

  const isGraceInvalid = form.gracePeriodDays.trim() === '' || isNaN(graceNum) || graceNum < 0 || graceNum > 90;
  const isPenaltyInvalid = form.penaltyValue.trim() === '' || isNaN(penaltyNum) || penaltyNum <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (isGraceInvalid || isPenaltyInvalid) return;
    try {
      await createConfig({
        ...(form.propertyId ? { propertyId: form.propertyId } : {}),
        ...(form.chargeTypeId ? { chargeTypeId: form.chargeTypeId } : {}),
        gracePeriodDays: graceNum,
        penaltyType: form.penaltyType,
        penaltyValue: penaltyNum,
        maxPenaltyPct: maxCapNum || undefined,
        compound: form.compound,
      }).unwrap();
      setShowForm(false);
      setHasAttemptedSubmit(false);
      setForm({ propertyId: '', chargeTypeId: '', gracePeriodDays: '7', penaltyType: 'percentage', penaltyValue: '5', maxPenaltyPct: '25', compound: false });
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

  const totalItems = configs.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedConfigs = configs.slice(startIndex, startIndex + pageSize);

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Shield size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Penalty Configuration</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {`${configs.length} total configs`}
            </p>
          </div>
          <PermissionGuard permission="billing-settings.write">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Config
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Configs Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
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
            ) : paginatedConfigs.map((cfg: any) => (
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
        </TableScrollWrapper>

        {totalItems >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="pc-page-size">Rows per page:</label>
                <select
                  id="pc-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="page-btns">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {page} of {Math.max(totalPages, 1)}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Shield size={18} /> New Penalty Configuration</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
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
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={form.gracePeriodDays}
                      onChange={e => setForm({ ...form, gracePeriodDays: e.target.value })}
                      className={hasAttemptedSubmit && isGraceInvalid ? 'inv-input-error' : ''}
                    />
                    {hasAttemptedSubmit && isGraceInvalid && (
                      <span className="inv-error-text">Grace period (0–90 days) is required</span>
                    )}
                  </div>
                  <div className="inv-field">
                    <label>Penalty Type <span className="req">*</span></label>
                    <select value={form.penaltyType} onChange={e => setForm({ ...form, penaltyType: e.target.value })}>
                      {Object.entries(PENALTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>
                      {form.penaltyType === 'fixed_amount' ? 'Penalty Amount' : 'Penalty Rate (%)'} <span className="req">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.penaltyValue}
                      onChange={e => setForm({ ...form, penaltyValue: e.target.value })}
                      className={hasAttemptedSubmit && isPenaltyInvalid ? 'inv-input-error' : ''}
                    />
                    {hasAttemptedSubmit && isPenaltyInvalid && (
                      <span className="inv-error-text">
                        {form.penaltyType === 'fixed_amount' ? 'Penalty amount is required' : 'Penalty rate is required'}
                      </span>
                    )}
                  </div>
                  <div className="inv-field">
                    <label>Max Penalty Cap (% of invoice)</label>
                    <input type="number" min={0} max={100} step={1} value={form.maxPenaltyPct}
                      onChange={e => setForm({ ...form, maxPenaltyPct: e.target.value })} />
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
