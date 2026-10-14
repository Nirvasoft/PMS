import { useState } from 'react';
import { useGetTaxConfigsQuery, useCreateTaxConfigMutation, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { Calculator, Plus, X, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import './BillingPage.css';

export default function TaxConfigPage() {
  const { data: taxData, isFetching } = useGetTaxConfigsQuery();
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const [createTax, { isLoading: creating }] = useCreateTaxConfigMutation();
  const alertDialog = useAlertDialog();

  const taxes = taxData?.data || [];
  const chargeTypes = chargeTypesData?.data || [];

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showForm, setShowForm] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    taxName: '', taxRate: '0.09', appliesTo: [] as string[],
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
  });

  const rateNum = Number(form.taxRate);
  const isNameInvalid = !form.taxName.trim();
  const isRateInvalid = form.taxRate.trim() === '' || isNaN(rateNum) || rateNum <= 0 || rateNum > 1;
  const isFromInvalid = !form.effectiveFrom;

  const openCreate = () => {
    setHasAttemptedSubmit(false);
    setForm({ taxName: '', taxRate: '0.09', appliesTo: [], effectiveFrom: new Date().toISOString().split('T')[0], effectiveTo: '' });
    setShowForm(true);
  };

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
    setHasAttemptedSubmit(true);
    if (isNameInvalid || isRateInvalid || isFromInvalid) return;
    try {
      await createTax({
        taxName: form.taxName.trim(),
        taxRate: rateNum,
        appliesTo: form.appliesTo.length > 0 ? form.appliesTo : undefined,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
      }).unwrap();
      setShowForm(false);
      setHasAttemptedSubmit(false);
      setForm({ taxName: '', taxRate: '0.09', appliesTo: [], effectiveFrom: new Date().toISOString().split('T')[0], effectiveTo: '' });
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to create tax config');
    }
  };

  const totalItems = taxes.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedTaxes = taxes.slice(startIndex, startIndex + pageSize);

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Calculator size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Tax Configuration</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {`${taxes.length} total tax configs`}
            </p>
          </div>
          <PermissionGuard permission="billing-settings.write">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Tax Config
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Tax Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
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
            ) : paginatedTaxes.map((tax: any) => (
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
        </TableScrollWrapper>

        {totalItems >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="tc-page-size">Rows per page:</label>
                <select
                  id="tc-page-size"
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
              <h2><Calculator size={18} /> New Tax Configuration</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Tax Name <span className="req">*</span></label>
                    <input
                      placeholder="e.g. GST, VAT, SST"
                      value={form.taxName}
                      onChange={e => setForm({ ...form, taxName: e.target.value })}
                      className={hasAttemptedSubmit && isNameInvalid ? 'inv-input-error' : ''}
                    />
                    {hasAttemptedSubmit && isNameInvalid && (
                      <span className="inv-error-text">Tax name is required</span>
                    )}
                  </div>
                  <div className="inv-field">
                    <label>Tax Rate (decimal) <span className="req">*</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.001}
                        value={form.taxRate}
                        onChange={e => setForm({ ...form, taxRate: e.target.value })}
                        className={hasAttemptedSubmit && isRateInvalid ? 'inv-input-error' : ''}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#fbbf24', whiteSpace: 'nowrap' }}>
                        = {((isNaN(rateNum) ? 0 : rateNum) * 100).toFixed(1)}%
                      </span>
                    </div>
                    {hasAttemptedSubmit && isRateInvalid && (
                      <span className="inv-error-text">Valid tax rate (0–1) is required</span>
                    )}
                  </div>
                  <div className="inv-field">
                    <label>Effective From <span className="req">*</span></label>
                    <input
                      type="date"
                      value={form.effectiveFrom}
                      onChange={e => setForm({ ...form, effectiveFrom: e.target.value })}
                      className={hasAttemptedSubmit && isFromInvalid ? 'inv-input-error' : ''}
                    />
                    {hasAttemptedSubmit && isFromInvalid && (
                      <span className="inv-error-text">Effective from date is required</span>
                    )}
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
