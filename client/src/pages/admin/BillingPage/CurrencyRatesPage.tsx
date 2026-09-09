import { useState, useEffect, useMemo } from 'react';
import {
  useGetCurrencyRatesQuery, useCreateCurrencyRateMutation, useUpdateCurrencyRateMutation, useDeleteCurrencyRateMutation,
  type CurrencyRate,
} from '../../../store/api/billingApi';
import { CURRENCIES } from '../../../constants/currencies';
import { Coins, Plus, X, Trash2, Search, ChevronLeft, ChevronRight, List, Save } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './BillingPage.css';

const formatRate = (rate: string) => {
  const n = Number(rate);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

// 'multiply' — baseAmount = amount * rate (rate quoted as base-per-1-currency).
// 'divide'   — baseAmount = amount / rate (rate quoted as currency-per-1-base).
const computeForward = (rate: number, operator: string) => (!rate ? 0 : operator === 'divide' ? 1 / rate : rate);
const computeInverse = (rate: number, operator: string) => (!rate ? 0 : operator === 'divide' ? rate : 1 / rate);

const emptyForm = {
  currency: '',
  description: '',
  symbol: '',
  isBaseCurrency: false,
  operator: 'multiply' as 'multiply' | 'divide',
  rate: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  remarks: '',
};

export default function CurrencyRatesPage() {
  const { data: ratesData, isFetching } = useGetCurrencyRatesQuery();
  const [createCurrencyRate, { isLoading: creating }] = useCreateCurrencyRateMutation();
  const [updateCurrencyRate, { isLoading: updating }] = useUpdateCurrencyRateMutation();
  const [deleteCurrencyRate] = useDeleteCurrencyRateMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const rates = ratesData?.data || [];
  // The base currency isn't chosen per row — it's whichever currency was most recently
  // flagged "Base Currency" (mirrors the server's own derivation in currencyRates.service.ts).
  const globalBaseCurrency = useMemo(() => {
    const baseRows = rates.filter((r) => r.isBaseCurrency).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return baseRows[0]?.currency || '';
  }, [rates]);

  // ── Search ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRates = rates
    .filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return r.currency.toLowerCase().includes(q) || r.baseCurrency.toLowerCase().includes(q) || (r.remarks || '').toLowerCase().includes(q);
    })
    // History view — newest first within each currency.
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.effectiveDate.localeCompare(a.effectiveDate));

  // ── Pagination ──────────────────────────────────────
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredRates.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRates = filteredRates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── List / Form toolbar (List, New, Save, Delete) ────
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<CurrencyRate | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setViewMode('form'); };
  const openEdit = (r: CurrencyRate) => {
    setEditing(r);
    setForm({
      currency: r.currency,
      description: r.description || '',
      symbol: r.symbol || '',
      isBaseCurrency: r.isBaseCurrency,
      operator: r.operator,
      rate: r.rate,
      effectiveDate: r.effectiveDate.slice(0, 10),
      remarks: r.remarks || '',
    });
    setViewMode('form');
  };
  const backToList = () => { setViewMode('list'); setEditing(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Nothing is base yet — the first currency created must be marked Base Currency,
    // otherwise the system would end up with no base at all.
    if (rates.length === 0 && !form.isBaseCurrency) {
      alertDialog('No Base Currency is set up yet. Check "Base Currency" for this entry before saving.');
      return;
    }

    const payload = {
      currency: form.currency,
      description: form.description.trim(),
      symbol: form.symbol.trim(),
      isBaseCurrency: form.isBaseCurrency,
      operator: form.operator,
      rate: Number(form.rate),
      effectiveDate: form.effectiveDate,
      remarks: form.remarks.trim(),
    };
    try {
      if (editing) {
        await updateCurrencyRate({ id: editing.id, data: payload }).unwrap();
      } else {
        await createCurrencyRate(payload).unwrap();
      }
      backToList();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || err?.data?.message || `Failed to ${editing ? 'update' : 'create'} currency rate`);
    }
  };

  const handleDelete = async (r: CurrencyRate) => {
    if (!(await confirmDialog(`Delete the ${r.currency}/${r.baseCurrency} rate for ${new Date(r.effectiveDate).toLocaleDateString()}?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteCurrencyRate(r.id).unwrap();
      if (editing?.id === r.id) backToList();
    } catch (e: any) {
      const msg = e?.data?.errors?.[0]?.message || 'Failed to delete currency rate';
      alertDialog(msg);
    }
  };

  // ── Live conversion preview for the form ─────────────
  const formRateNum = Number(form.rate);
  const forwardValue = computeForward(formRateNum, form.operator);
  const inverseValue = computeInverse(formRateNum, form.operator);
  // While "Base Currency" is checked, this row is about to become the base, so the
  // preview should reflect the in-progress selection rather than the still-saved one.
  const displayBaseCurrency = form.isBaseCurrency ? (form.currency || '—') : globalBaseCurrency;

  // Only one currency can be the base at a time — lock the checkbox once another is set.
  const existingBaseCurrency = rates.find((r) => r.isBaseCurrency && r.id !== editing?.id);
  const baseCurrencyLocked = !form.isBaseCurrency && !!existingBaseCurrency;

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
            <Coins size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Currency Setup</h1>
          </div>
          {viewMode === 'list' ? (
            <PermissionGuard permission="currency-rate.create">
              <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> New
              </button>
            </PermissionGuard>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={backToList} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <List size={14} /> List
              </button>
              <PermissionGuard permission="currency-rate.create">
                <button type="button" className="btn btn-secondary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> New
                </button>
              </PermissionGuard>
              <button type="submit" form="currency-rate-form" className="btn btn-primary" disabled={creating || updating} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Save size={14} /> {creating || updating ? 'Saving…' : 'Save'}
              </button>
              {editing && (
                <PermissionGuard permission="currency-rate.delete">
                  <button type="button" className="btn btn-danger" onClick={() => handleDelete(editing)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </PermissionGuard>
              )}
            </div>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* Search */}
          <div className="meter-search-bar">
            <div className="meter-search-wrap">
              <Search size={15} className="meter-search-icon" />
              <input
                type="text"
                className="meter-search-input"
                placeholder="Search currency, base currency, remarks…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="meter-search-clear"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Currency Rate History Table */}
          <div className="billing-table-wrap">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Operator</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && rates.length === 0 ? (
                  <tr><td colSpan={4} className="billing-empty">Loading…</td></tr>
                ) : rates.length === 0 ? (
                  <tr><td colSpan={4} className="billing-empty">No currency rates set up yet</td></tr>
                ) : filteredRates.length === 0 ? (
                  <tr><td colSpan={4} className="billing-empty">No currency rates match your filters</td></tr>
                ) : paginatedRates.map((r) => (
                  <tr key={r.id} onClick={() => openEdit(r)} style={{ cursor: 'pointer' }}>
                    <td><span className="cell-primary">{r.currency}</span></td>
                    <td>{r.description || (r.symbol ? `${r.currency} (${r.symbol})` : r.currency)}</td>
                    <td>{r.operator === 'divide' ? '/' : '*'}</td>
                    <td><span className="cell-mono">{formatRate(r.rate)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="billing-pagination">
                <span className="page-info">Page {currentPage} of {totalPages}</span>
                <div className="page-btns">
                  <button disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={15} />
                  </button>
                  <button disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Detail Form — Code / Base Currency checkbox / Description / Operator / Symbol / Rate + live conversion */
        <form id="currency-rate-form" onSubmit={handleSubmit}>
          <div className="billing-table-wrap" style={{ padding: 20 }}>
            <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)', maxWidth: 480 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                <div className="inv-field" style={{ flex: 1 }}>
                  <label>Code <span className="req">*</span></label>
                  <select required value={form.currency} disabled={!!editing}
                    style={editing ? { cursor: 'not-allowed', opacity: 0.6 } : undefined}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    <option value="">Select currency…</option>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10, whiteSpace: 'nowrap',
                    opacity: (baseCurrencyLocked || editing) ? 0.5 : 1,
                  }}
                >
                  <input type="checkbox" checked={form.isBaseCurrency} disabled={baseCurrencyLocked || !!editing}
                    style={{ cursor: (baseCurrencyLocked || editing) ? 'not-allowed' : 'pointer' }}
                    onChange={(e) => setForm({ ...form, isBaseCurrency: e.target.checked, rate: e.target.checked && !form.rate ? '1' : form.rate })} />
                  Base Currency
                </label>
              </div>

              <div className="inv-field">
                <label>Description</label>
                <input placeholder="e.g. US Dollar" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div className="inv-field" style={{ flex: 1 }}>
                  <label>Operator</label>
                  <select value={form.operator} disabled={!!editing}
                    style={editing ? { cursor: 'not-allowed', opacity: 0.6 } : undefined}
                    onChange={(e) => setForm({ ...form, operator: e.target.value as 'multiply' | 'divide' })}>
                    <option value="multiply">*</option>
                    <option value="divide">/</option>
                  </select>
                </div>
                <div className="inv-field" style={{ flex: 1 }}>
                  <label>Symbol</label>
                  <input placeholder="e.g. $" value={form.symbol}
                    onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
                </div>
              </div>

              <div className="inv-field">
                <label>Rate <span className="req">*</span></label>
                <input required type="number" min="0" step="0.000001" placeholder="e.g. 2100.00"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>

              <div className="inv-field">
                <label>1.00 {form.currency || '—'} equals: {globalBaseCurrency}</label>
                <input readOnly disabled style={{ cursor: 'not-allowed' }}
                  value={formRateNum > 0 ? forwardValue.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.0000'} />
              </div>
              <div className="inv-field">
                <label>{displayBaseCurrency} [Base] 1.00 equals: {form.currency || '—'}</label>
                <input readOnly disabled style={{ cursor: 'not-allowed' }}
                  value={formRateNum > 0 ? inverseValue.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.0000'} />
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
