import { useState, useEffect, useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  useGetCurrencyRatesQuery, useGetCurrencyRateHistoryQuery,
  useCreateCurrencyRateMutation, useUpdateCurrencyRateMutation, useDeleteCurrencyRateMutation,
  type CurrencyRate, type CurrencyRateHistory,
} from '../../../store/api/billingApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';

import { Coins, Plus, X, Trash2, Search, ChevronLeft, ChevronRight, List, Save, History } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import './BillingPage.css';

/** ISO currency reference table — country, currency name, ISO code, symbol */
const ISO_CURRENCY_LIST: { country: string; name: string; code: string; symbol: string }[] = [
  { country: 'UAE',           name: 'UAE Dirham',          code: 'AED', symbol: 'د.إ' },
  { country: 'Australia',     name: 'Australian Dollar',   code: 'AUD', symbol: 'A$'  },
  { country: 'Bangladesh',    name: 'Bangladeshi Taka',    code: 'BDT', symbol: '৳'   },
  { country: 'Bahrain',       name: 'Bahraini Dinar',      code: 'BHD', symbol: '.د.ب'},
  { country: 'Brazil',        name: 'Brazilian Real',      code: 'BRL', symbol: 'R$'  },
  { country: 'Canada',        name: 'Canadian Dollar',     code: 'CAD', symbol: 'CA$' },
  { country: 'Switzerland',   name: 'Swiss Franc',         code: 'CHF', symbol: 'Fr'  },
  { country: 'China',         name: 'Chinese Yuan',        code: 'CNY', symbol: '¥'   },
  { country: 'Denmark',       name: 'Danish Krone',        code: 'DKK', symbol: 'kr'  },
  { country: 'Euro Zone',     name: 'Euro',                code: 'EUR', symbol: '€'   },
  { country: 'UK',            name: 'British Pound',       code: 'GBP', symbol: '£'   },
  { country: 'Hong Kong',     name: 'Hong Kong Dollar',    code: 'HKD', symbol: 'HK$' },
  { country: 'Indonesia',     name: 'Indonesian Rupiah',   code: 'IDR', symbol: 'Rp'  },
  { country: 'India',         name: 'Indian Rupee',        code: 'INR', symbol: '₹'   },
  { country: 'Japan',         name: 'Japanese Yen',        code: 'JPY', symbol: '¥'   },
  { country: 'Cambodia',      name: 'Cambodian Riel',      code: 'KHR', symbol: '៛'   },
  { country: 'South Korea',   name: 'South Korean Won',    code: 'KRW', symbol: '₩'   },
  { country: 'Kuwait',        name: 'Kuwaiti Dinar',       code: 'KWD', symbol: 'د.ك' },
  { country: 'Laos',          name: 'Lao Kip',             code: 'LAK', symbol: '₭'   },
  { country: 'Sri Lanka',     name: 'Sri Lankan Rupee',    code: 'LKR', symbol: 'Rs'  },
  { country: 'Myanmar',       name: 'Myanmar Kyat',        code: 'MMK', symbol: 'K'   },
  { country: 'Malaysia',      name: 'Malaysian Ringgit',   code: 'MYR', symbol: 'RM'  },
  { country: 'Norway',        name: 'Norwegian Krone',     code: 'NOK', symbol: 'kr'  },
  { country: 'Nepal',         name: 'Nepalese Rupee',      code: 'NPR', symbol: 'Rs'  },
  { country: 'New Zealand',   name: 'New Zealand Dollar',  code: 'NZD', symbol: 'NZ$' },
  { country: 'Oman',          name: 'Omani Rial',          code: 'OMR', symbol: 'ر.ع.'},
  { country: 'Philippines',   name: 'Philippine Peso',     code: 'PHP', symbol: '₱'   },
  { country: 'Pakistan',      name: 'Pakistani Rupee',     code: 'PKR', symbol: 'Rs'  },
  { country: 'Qatar',         name: 'Qatari Riyal',        code: 'QAR', symbol: 'ر.ق' },
  { country: 'Saudi Arabia',  name: 'Saudi Riyal',         code: 'SAR', symbol: 'ر.س' },
  { country: 'Sweden',        name: 'Swedish Krona',       code: 'SEK', symbol: 'kr'  },
  { country: 'Singapore',     name: 'Singapore Dollar',    code: 'SGD', symbol: 'S$'  },
  { country: 'Thailand',      name: 'Thai Baht',           code: 'THB', symbol: '฿'   },
  { country: 'Turkey',        name: 'Turkish Lira',        code: 'TRY', symbol: '₺'   },
  { country: 'Taiwan',        name: 'Taiwan Dollar',       code: 'TWD', symbol: 'NT$' },
  { country: 'USA',           name: 'US Dollar',           code: 'USD', symbol: '$'   },
  { country: 'Vietnam',       name: 'Vietnamese Dong',     code: 'VND', symbol: '₫'   },
  { country: 'Central Africa',name: 'CFA Franc BEAC',      code: 'XAF', symbol: 'Fr'  },
  { country: 'South Africa',  name: 'South African Rand',  code: 'ZAR', symbol: 'R'   },
];

const formatRate = (rate: string) => {
  const n = Number(rate);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

const formatChangedBy = (h: CurrencyRateHistory) => {
  if (!h.changedByUser) return 'System';
  const first = h.changedByUser.profile?.firstName?.trim() || '';
  const last = h.changedByUser.profile?.lastName?.trim() || '';
  const fullName = `${first} ${last}`.trim();
  return fullName || h.changedByUser.email || 'System';
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderActionBadge = (action: string) => {
  const act = (action || '').toLowerCase();
  const config =
    act === 'create'
      ? { label: 'Created', bg: 'rgba(16, 185, 129, 0.14)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' }
      : act === 'delete'
        ? { label: 'Deleted', bg: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' }
        : { label: 'Updated', bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
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
  operator: 'divide' as 'multiply' | 'divide',
  rate: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  remarks: '',
};

export default function CurrencyRatesPage() {
  const activePropertyId = useSelectedPropertyId();
  // /properties/my-scope is permission-free — see useSelectedPropertyId.ts — and carries
  // each property's own currency, which Code/Base Currency below bind to.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const activeProperty = scopeData?.data.find((p) => p.id === activePropertyId);
  const propertyCurrency = activeProperty?.currency || '';

  const { data: ratesData, isFetching } = useGetCurrencyRatesQuery(activePropertyId ? { propertyId: activePropertyId } : skipToken);
  const { data: historyData, isFetching: isFetchingHistory } = useGetCurrencyRateHistoryQuery(
    activePropertyId ? { propertyId: activePropertyId } : skipToken,
  );
  const [createCurrencyRate, { isLoading: creating }] = useCreateCurrencyRateMutation();
  const [updateCurrencyRate, { isLoading: updating }] = useUpdateCurrencyRateMutation();
  const [deleteCurrencyRate] = useDeleteCurrencyRateMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const rates = ratesData?.data || [];
  const historyList = historyData?.data || [];

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
    // Base currency always pinned to top, then alphabetical, then newest-first within each code.
    .sort((a, b) => (b.isBaseCurrency ? 1 : 0) - (a.isBaseCurrency ? 1 : 0) || a.currency.localeCompare(b.currency) || b.effectiveDate.localeCompare(a.effectiveDate));

  // ── Pagination ──────────────────────────────────────
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [searchQuery, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filteredRates.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRates = filteredRates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── History Search, Filter & Pagination ─────────────
  const [historySearch, setHistorySearch] = useState('');
  const [historyCurrencyFilter, setHistoryCurrencyFilter] = useState('');
  const [historyActionFilter, setHistoryActionFilter] = useState('');
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);

  const historyCurrencies = useMemo(() => {
    const set = new Set<string>();
    historyList.forEach((h) => { if (h.currency) set.add(h.currency); });
    return Array.from(set).sort();
  }, [historyList]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return historyList.filter((h) => {
      if (historyCurrencyFilter && h.currency !== historyCurrencyFilter) return false;
      if (historyActionFilter && h.action.toLowerCase() !== historyActionFilter) return false;
      if (!q) return true;
      const userStr = formatChangedBy(h).toLowerCase();
      return (
        h.currency.toLowerCase().includes(q) ||
        h.baseCurrency.toLowerCase().includes(q) ||
        userStr.includes(q) ||
        (h.oldRate || '').toLowerCase().includes(q) ||
        (h.newRate || '').toLowerCase().includes(q) ||
        (h.remarks || '').toLowerCase().includes(q)
      );
    });
  }, [historyList, historySearch, historyCurrencyFilter, historyActionFilter]);

  useEffect(() => { setHistoryPage(1); }, [historySearch, historyCurrencyFilter, historyActionFilter, historyPageSize]);
  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistory = filteredHistory.slice(
    (currentHistoryPage - 1) * historyPageSize,
    currentHistoryPage * historyPageSize,
  );

  // ── List / Form / History toolbar ───────────────────
  const [viewMode, setViewMode] = useState<'list' | 'form' | 'history'>('list');
  const [showIsoModal, setShowIsoModal] = useState(false);
  const [isoSearch, setIsoSearch] = useState('');
  const [editing, setEditing] = useState<CurrencyRate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const editingCurrencyHistory = useMemo(() => {
    if (!editing) return [];
    return historyList.filter(
      (h) => h.currencyRateId === editing.id || h.currency === editing.currency,
    );
  }, [editing, historyList]);

  // No rows yet for this property means no base currency is set — the row about to be
  // created must be it, so Code/Base Currency below bind to and lock onto the property's
  // own currency instead of offering a free choice.
  const mustBeBaseCurrency = !editing && rates.length === 0;

  const currencyError = hasAttemptedSubmit && !form.currency.trim() ? 'Currency code is required' : '';
  const rateError = hasAttemptedSubmit && (!String(form.rate).trim() || !(Number(form.rate) > 0)) ? 'Valid rate is required' : '';

  const openCreate = () => {
    setEditing(null);
    setHasAttemptedSubmit(false);
    setForm(propertyCurrency && rates.length === 0
      ? { ...emptyForm, currency: propertyCurrency, isBaseCurrency: true, rate: '1' }
      : emptyForm);
    setViewMode('form');
  };
  const openEdit = (r: CurrencyRate) => {
    setEditing(r);
    setHasAttemptedSubmit(false);
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
  const backToList = () => { setViewMode('list'); setEditing(null); setHasAttemptedSubmit(false); setForm(emptyForm); };
  const openHistory = () => { setViewMode('history'); };

  // Switching the sidebar's Active Property changes which property's rates this page shows —
  // an open create/edit form would otherwise keep referencing the property it was opened for.
  useEffect(() => { backToList(); }, [activePropertyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!form.currency.trim() || !String(form.rate).trim() || !(Number(form.rate) > 0)) {
      return;
    }

    // Nothing is base yet — the first currency created must be marked Base Currency,
    // otherwise the property would end up with no base at all. Unreachable in practice
    // since mustBeBaseCurrency already forces the checkbox on — kept as a safety net.
    if (rates.length === 0 && !form.isBaseCurrency) {
      alertDialog('No Base Currency is set up yet. Check "Base Currency" for this entry before saving.');
      return;
    }

    const payload = {
      propertyId: activePropertyId,
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
        <div className="page-title-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            className="page-icon-lg"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Coins size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              {viewMode === 'history' ? 'Currency Update History' : 'Currency Setup'}
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {viewMode === 'history'
                ? (isFetchingHistory && historyList.length === 0 ? 'Loading…' : `${historyList.length} total update records`)
                : (isFetching && rates.length === 0 ? 'Loading…' : `${rates.length} total currencies`)}
            </p>
          </div>
          {viewMode === 'list' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={openHistory}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <History size={14} /> History
              </button>
              <PermissionGuard permission="currency-rate.create">
                <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> New
                </button>
              </PermissionGuard>
            </div>
          ) : viewMode === 'history' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={backToList} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <List size={14} /> List
              </button>
              <PermissionGuard permission="currency-rate.create">
                <button type="button" className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> New
                </button>
              </PermissionGuard>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={backToList} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <List size={14} /> List
              </button>
              <button type="button" className="btn btn-secondary" onClick={openHistory} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <History size={14} /> History
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

          {/* Currency Rates Table */}
          <div className="billing-table-wrap">
            <TableScrollWrapper>
              <table className="billing-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Symbol</th>
                  <th>Operator</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && rates.length === 0 ? (
                  <tr><td colSpan={5} className="billing-empty">Loading…</td></tr>
                ) : rates.length === 0 ? (
                  <tr><td colSpan={5} className="billing-empty">No currency rates set up yet</td></tr>
                ) : filteredRates.length === 0 ? (
                  <tr><td colSpan={5} className="billing-empty">No currency rates match your filters</td></tr>
                ) : paginatedRates.map((r) => (
                  <tr key={r.id} onClick={() => openEdit(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="cell-primary">{r.currency}</span>
                        {r.isBaseCurrency && <span className="cr-base-badge">Base</span>}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{r.description || '—'}</td>
                    <td>
                      {r.symbol
                        ? <span className="cr-symbol-chip">{r.symbol}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.operator === 'divide' ? '/' : '*'}</td>
                    <td><span className="cell-mono">{formatRate(r.rate)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScrollWrapper>

            {filteredRates.length >= 10 && (
              <div className="positions-pagination billing-pagination">
                <div className="pagination-left">
                  <div className="page-size-selector">
                    <label htmlFor="cr-page-size">Rows per page:</label>
                    <select
                      id="cr-page-size"
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
                    disabled={currentPage === 1}
                    onClick={() => setPage((p) => p - 1)}
                    title="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="page-num-display">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    title="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : viewMode === 'history' ? (
        <>
          {/* History Search & Filter Bar */}
          <div className="meter-search-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="meter-search-wrap" style={{ flex: 1, minWidth: 240 }}>
              <Search size={15} className="meter-search-icon" />
              <input
                type="text"
                className="meter-search-input"
                placeholder="Search currency, rate, changed by…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              {historySearch && (
                <button
                  type="button"
                  className="meter-search-clear"
                  onClick={() => setHistorySearch('')}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <select
              className="filter-select"
              value={historyCurrencyFilter}
              onChange={(e) => setHistoryCurrencyFilter(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="">All Currencies</option>
              {historyCurrencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={historyActionFilter}
              onChange={(e) => setHistoryActionFilter(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="">All Actions</option>
              <option value="create">Created</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted</option>
            </select>
          </div>

          {/* Property-wide Currency Update History Table */}
          <div className="billing-table-wrap">
            <TableScrollWrapper>
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Code</th>
                    <th>Base Currency</th>
                    <th>Operator</th>
                    <th>Action</th>
                    <th className="text-right">Old Rate</th>
                    <th className="text-right">New Rate</th>
                    <th>Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetchingHistory && historyList.length === 0 ? (
                    <tr><td colSpan={8} className="billing-empty">Loading…</td></tr>
                  ) : historyList.length === 0 ? (
                    <tr><td colSpan={8} className="billing-empty">No currency update history yet</td></tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr><td colSpan={8} className="billing-empty">No history records match your filters</td></tr>
                  ) : paginatedHistory.map((h) => (
                    <tr key={h.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12.5 }}>
                        {formatDateTime(h.changedAt)}
                      </td>
                      <td><span className="cell-primary">{h.currency}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{h.baseCurrency}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.operator === 'divide' ? '/' : '*'}</td>
                      <td>{renderActionBadge(h.action)}</td>
                      <td className="text-right">
                        {h.oldRate != null ? <span className="cell-mono">{formatRate(h.oldRate)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="text-right">
                        {h.newRate != null ? <span className="cell-mono">{formatRate(h.newRate)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatChangedBy(h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollWrapper>

            {filteredHistory.length >= 10 && (
              <div className="positions-pagination billing-pagination">
                <div className="pagination-left">
                  <div className="page-size-selector">
                    <label htmlFor="cr-history-page-size">Rows per page:</label>
                    <select
                      id="cr-history-page-size"
                      value={historyPageSize}
                      onChange={(e) => {
                        setHistoryPageSize(Number(e.target.value));
                        setHistoryPage(1);
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
                    disabled={currentHistoryPage === 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                    title="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="page-num-display">
                    Page {currentHistoryPage} of {totalHistoryPages}
                  </span>
                  <button
                    disabled={currentHistoryPage >= totalHistoryPages}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    title="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Detail Form — Code / Base Currency checkbox / Description / Operator / Symbol / Rate + live conversion */
        <>
          <form id="currency-rate-form" onSubmit={handleSubmit} noValidate>
            <div className="billing-table-wrap cr-detail-form-card" style={{ padding: 24 }}>
              <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)', maxWidth: 480 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div className="inv-field" style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Code <span className="req">*</span></span>
                      {!editing && !mustBeBaseCurrency && (
                        <button
                          type="button"
                          className="cr-iso-link"
                          onClick={() => { setIsoSearch(''); setShowIsoModal(true); }}
                        >
                          ISO ↗
                        </button>
                      )}
                    </label>
                    <input
                      className={currencyError ? 'input-error' : ''}
                      placeholder="Select via ISO →"
                      value={form.currency}
                      disabled
                      style={{ cursor: 'not-allowed', opacity: form.currency ? 1 : (currencyError ? 1 : 0.6) }}
                      readOnly
                    />
                    {currencyError && <span className="field-error-text">{currencyError}</span>}
                  </div>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, paddingTop: 28, whiteSpace: 'nowrap',
                      opacity: (baseCurrencyLocked || editing || mustBeBaseCurrency) ? 0.5 : 1,
                    }}
                  >
                    <input type="checkbox" checked={form.isBaseCurrency} disabled={baseCurrencyLocked || !!editing || mustBeBaseCurrency}
                      style={{ cursor: (baseCurrencyLocked || editing || mustBeBaseCurrency) ? 'not-allowed' : 'pointer' }}
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
                  <input
                    className={rateError ? 'input-error' : ''}
                    type="number"
                    min="0"
                    step="0.000001"
                    placeholder="e.g. 2100.00"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  />
                  {rateError && <span className="field-error-text">{rateError}</span>}
                </div>

                <div className="cr-conversion-preview">
                  <div className="cr-conversion-row">
                    <span className="cr-conversion-label">1.00 {form.currency || '—'}</span>
                    <span className="cr-conversion-eq">=</span>
                    <span className="cr-conversion-value">
                      {formRateNum > 0
                        ? <>{forwardValue.toLocaleString(undefined, { maximumFractionDigits: 6 })} <strong>{displayBaseCurrency}</strong></>
                        : <span className="cr-conversion-empty">—</span>}
                    </span>
                  </div>
                  <div className="cr-conversion-divider" />
                  <div className="cr-conversion-row">
                    <span className="cr-conversion-label">1.00 {displayBaseCurrency || '—'} <span className="cr-conversion-base-tag">base</span></span>
                    <span className="cr-conversion-eq">=</span>
                    <span className="cr-conversion-value">
                      {formRateNum > 0
                        ? <>{inverseValue.toLocaleString(undefined, { maximumFractionDigits: 6 })} <strong>{form.currency || '—'}</strong></>
                        : <span className="cr-conversion-empty">—</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {editing && (
            <div className="billing-table-wrap" style={{ marginTop: 20 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Rate Update History ({editing.currency})
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {editingCurrencyHistory.length} record{editingCurrencyHistory.length === 1 ? '' : 's'}
                </span>
              </div>
              <TableScrollWrapper>
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Code</th>
                      <th>Base Currency</th>
                      <th>Operator</th>
                      <th>Action</th>
                      <th className="text-right">Old Rate</th>
                      <th className="text-right">New Rate</th>
                      <th>Changed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingCurrencyHistory.length === 0 ? (
                      <tr><td colSpan={8} className="billing-empty">No rate update history for {editing.currency} yet</td></tr>
                    ) : editingCurrencyHistory.map((h) => (
                      <tr key={h.id}>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12.5 }}>
                          {formatDateTime(h.changedAt)}
                        </td>
                        <td><span className="cell-primary">{h.currency}</span></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{h.baseCurrency}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.operator === 'divide' ? '/' : '*'}</td>
                        <td>{renderActionBadge(h.action)}</td>
                        <td className="text-right">
                          {h.oldRate != null ? <span className="cell-mono">{formatRate(h.oldRate)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td className="text-right">
                          {h.newRate != null ? <span className="cell-mono">{formatRate(h.newRate)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatChangedBy(h)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrapper>
            </div>
          )}
        </>
      )}

      {/* ISO Currency Picker Modal */}
      {showIsoModal && (
        <div className="cr-iso-overlay" onClick={() => setShowIsoModal(false)}>
          <div className="cr-iso-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="cr-iso-header">
              <span className="cr-iso-title">ISO Currency Reference</span>
              <button type="button" className="cr-iso-close" onClick={() => setShowIsoModal(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="cr-iso-search-wrap">
              <Search size={14} className="cr-iso-search-icon" />
              <input
                autoFocus
                type="text"
                className="cr-iso-search"
                placeholder="Search country, currency or ISO code…"
                value={isoSearch}
                onChange={(e) => setIsoSearch(e.target.value)}
              />
              {isoSearch && (
                <button type="button" className="cr-iso-search-clear" onClick={() => setIsoSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Table */}
            <div className="cr-iso-table-wrap">
              <table className="cr-iso-table">
                <thead>
                  <tr>
                    <th>Country / Region</th>
                    <th>Currency</th>
                    <th>ISO Code</th>
                    <th>Symbol</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = isoSearch.toLowerCase();
                    const filtered = ISO_CURRENCY_LIST.filter((c) =>
                      !q || c.country.toLowerCase().includes(q) ||
                      c.name.toLowerCase().includes(q) ||
                      c.code.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) return (
                      <tr><td colSpan={4} className="cr-iso-empty">No currencies match "{isoSearch}"</td></tr>
                    );
                    return filtered.map((c) => (
                      <tr
                        key={c.code}
                        className={`cr-iso-row ${form.currency === c.code ? 'cr-iso-row--selected' : ''}`}
                        onClick={() => {
                          setForm({
                            ...form,
                            currency: c.code,
                            description: c.name,
                            symbol: c.symbol,
                          });
                          setShowIsoModal(false);
                        }}
                      >
                        <td className="cr-iso-cell-country">{c.country}</td>
                        <td className="cr-iso-cell-name">{c.name}</td>
                        <td><span className="cr-iso-code-badge">{c.code}</span></td>
                        <td className="cr-iso-cell-symbol">{c.symbol}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
