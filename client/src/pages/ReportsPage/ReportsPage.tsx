import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  FileText,
  Receipt,
  ClipboardList,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  useLazyGetInvoicesQuery,
  useGetInvoiceReportFiltersQuery,
  useGetCurrencyRatesQuery,
} from '../../store/api/billingApi';
import {
  useLazyGetLeasesQuery,
  useLazyGetLeaseQuery,
} from '../../store/api/leasesApi';
import { useGetUsersQuery } from '../../store/api/usersApi';
import { useGetLeadsQuery } from '../../store/api/crmApi';
import { useSelectedPropertyFilter } from '../../hooks/useSelectedPropertyId';
import ComboBox from '../../components/ComboBox';
import {
  openInvoicesReportPreview,
  type InvoiceReportType,
} from '../admin/BillingPage/utils/invoicePrintPreview';
import {
  openLeasesReportPreview,
  type LeaseReportType,
} from '../admin/LeasesPage/utils/leasePrintPreview';
import '../admin/BillingPage/BillingPage.css';
import './ReportsPage.css';

function buildCurrencyOptions(
  currencyRates: Array<{ currency?: string; isBaseCurrency?: boolean }>,
  baseCurrencyCode: string,
): Array<{ code: string; isBase: boolean }> {
  const map = new Map<string, boolean>();
  for (const r of currencyRates) {
    if (!r.currency) continue;
    map.set(r.currency, Boolean(map.get(r.currency) || r.isBaseCurrency));
  }
  if (map.size === 0) {
    map.set(baseCurrencyCode, true);
  }
  return Array.from(map.entries())
    .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0]))
    .map(([code, isBase]) => ({ code, isBase }));
}

const LEASE_STATUS_OPTIONS = [
  { value: 'active', label: 'ACTIVE' },
  { value: 'draft', label: 'DRAFT' },
  { value: 'pending_approval', label: 'PENDING APPROVAL' },
  { value: 'approved', label: 'APPROVED' },
  { value: 'expired', label: 'EXPIRED' },
  { value: 'terminated', label: 'TERMINATED' },
  { value: 'renewed', label: 'RENEWED' },
  { value: 'cancelled', label: 'CANCELLED' },
];

export default function ReportsPage({ mode }: { mode?: 'invoice' | 'lease' }) {
  const location = useLocation();
  const activeMode: 'invoice' | 'lease' =
    mode ?? (location.pathname.includes('/leases') ? 'lease' : 'invoice');
  const activeProperty = useSelectedPropertyFilter();

  return (
    <div className="reports-page">
      {/* Page Header */}
      <div className="rp-top-bar">
        <div className="page-title-row">
          <div className="page-icon-lg">
            {activeMode === 'invoice' ? (
              <Receipt size={22} />
            ) : (
              <ClipboardList size={22} />
            )}
          </div>
          <div>
            <h1>{activeMode === 'invoice' ? 'Invoice Report' : 'Lease Report'}</h1>
            <p>
              {activeMode === 'invoice'
                ? 'Invoice Summary, Detail & Voucher Report'
                : 'Lease Summary, Detail, Form & Preview Report'}
            </p>
          </div>
        </div>
      </div>

      {activeMode === 'invoice' ? (
        <InvoiceReportForm activeProperty={activeProperty} />
      ) : (
        <LeaseReportForm activeProperty={activeProperty} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 1. INVOICE REPORT FORM (3-COLUMN CLEAN GRID)
// ═══════════════════════════════════════════════════

function InvoiceReportForm({ activeProperty }: { activeProperty: string }) {
  const { data: filterMetaResp } = useGetInvoiceReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchReportInvoices, { isFetching: generatingReport }] =
    useLazyGetInvoicesQuery();

  const defaultDates = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      min: format(firstDay, 'yyyy-MM-dd'),
      max: format(lastDay, 'yyyy-MM-dd'),
    };
  }, []);

  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode =
    currencyRates.find((r) => r.isBaseCurrency)?.currency || 'MMK';

  const currencyOptions = useMemo(
    () => buildCurrencyOptions(currencyRates, baseCurrencyCode),
    [currencyRates, baseCurrencyCode],
  );

  const [reportType, setReportType] = useState<InvoiceReportType>('summary');
  const [billType, setBillType] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>(() => defaultDates.min);
  const [toDate, setToDate] = useState<string>(() => defaultDates.max);
  const [startInvoice, setStartInvoice] = useState<string>('');
  const [endInvoice, setEndInvoice] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('invoiceNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    setCurrencyFilter(baseCurrencyCode);
  }, [activeProperty, baseCurrencyCode]);

  const activeCurrency =
    currencyFilter === 'ALL' ? undefined : currencyFilter || baseCurrencyCode;

  const floorOptions = useMemo(
    () => filterMeta?.floors || [],
    [filterMeta?.floors],
  );

  const unitOptions = useMemo(() => {
    const list = filterMeta?.units || [];
    const set = new Set<string>();
    list.forEach((u) => {
      if (floor && u.floor !== floor) return;
      if (u.unitNumber) set.add(u.unitNumber);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [filterMeta?.units, floor]);

  const tenantComboOptions = useMemo(() => {
    const items = filterMeta?.tenantItems || [];
    return items.map((t) => {
      const topLine = t.firstName || t.lastName;
      const subLine =
        t.firstName && t.lastName && t.lastName !== t.firstName
          ? t.lastName
          : undefined;
      return {
        id: t.id,
        label: topLine,
        sublabel: subLine,
      };
    });
  }, [filterMeta?.tenantItems]);

  const selectedTenantDisplay = useMemo(() => {
    if (!tenantId) return '';
    const found = (filterMeta?.tenantItems || []).find(
      (t) => t.id === tenantId,
    );
    if (!found) return '';
    return [found.firstName, found.lastName].filter(Boolean).join(' - ');
  }, [tenantId, filterMeta?.tenantItems]);

  const statusOptions = useMemo(
    () => filterMeta?.statuses || [],
    [filterMeta?.statuses],
  );

  useEffect(() => {
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
    } else if (
      startInvoice.trim() &&
      endInvoice.trim() &&
      startInvoice.trim() > endInvoice.trim()
    ) {
      setValidationError('Start Invoice cannot be greater than End Invoice.');
    } else {
      setValidationError('');
    }
  }, [fromDate, toDate, startInvoice, endInvoice]);

  const handleResetFilters = () => {
    setBillType('');
    setCurrencyFilter(baseCurrencyCode);
    setFromDate(defaultDates.min);
    setToDate(defaultDates.max);
    setStartInvoice('');
    setEndInvoice('');
    setFloor('');
    setUnitNumber('');
    setTenantId('');
    setStatusFilter('');
    setSortBy('invoiceNumber');
    setSortOrder('asc');
    setValidationError('');
  };

  const handleGenerateReport = async () => {
    if (!reportType) {
      toast.error('Please select a Report Type');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
      toast.error('From Date cannot be later than To Date');
      return;
    }
    if (
      startInvoice.trim() &&
      endInvoice.trim() &&
      startInvoice.trim() > endInvoice.trim()
    ) {
      setValidationError('Start Invoice cannot be greater than End Invoice.');
      toast.error('Start Invoice cannot be greater than End Invoice');
      return;
    }

    setValidationError('');

    const baseFilterParams: Record<string, any> = {
      includeLines: reportType !== 'summary',
      sortBy,
      sortOrder,
    };
    if (activeProperty) baseFilterParams.propertyId = activeProperty;
    if (activeCurrency) baseFilterParams.currency = activeCurrency;
    if (billType) baseFilterParams.billType = billType;
    if (startInvoice.trim()) baseFilterParams.startInvoice = startInvoice.trim();
    if (endInvoice.trim()) baseFilterParams.endInvoice = endInvoice.trim();
    if (fromDate) baseFilterParams.from = fromDate;
    if (toDate) baseFilterParams.to = toDate;
    if (floor) baseFilterParams.floor = floor;
    if (unitNumber) baseFilterParams.unitNumber = unitNumber;
    if (tenantId) baseFilterParams.tenantId = tenantId;
    if (statusFilter) baseFilterParams.status = statusFilter;

    const reportFiltersInfo = {
      currency: activeCurrency || undefined,
      billType: billType
        ? billType === 'monthly'
          ? 'Monthly Invoice'
          : 'Rental Invoice'
        : undefined,
      startInvoice: startInvoice.trim() || undefined,
      endInvoice: endInvoice.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      floor: floor || undefined,
      unit: unitNumber || undefined,
      tenant: selectedTenantDisplay || undefined,
      status: statusFilter || undefined,
    };

    let previewWin: Window | null = null;

    const loadReportPage = async (
      targetPage: number,
      targetPageSize: number,
      cachedTotals?: Record<
        string,
        {
          subtotal: number;
          tax: number;
          total: number;
          paid: number;
          outstanding: number;
        }
      >,
    ) => {
      try {
        const res = await triggerFetchReportInvoices({
          ...baseFilterParams,
          page: targetPage,
          limit: targetPageSize,
          includeTotals: !cachedTotals,
        }).unwrap();

        const fetched = res?.data || [];
        if (fetched.length === 0 && targetPage === 1) {
          if (previewWin) previewWin.close();
          setValidationError('No invoices match the current filter criteria.');
          toast.error('No invoices match the current filter criteria.');
          return;
        }

        if (!previewWin || previewWin.closed) {
          previewWin = window.open('', '_blank');
          if (!previewWin) {
            toast.error(
              'Popup blocked! Please allow popups for this site to view the report.',
            );
            return;
          }
        }

        const total = res?.meta?.total ?? fetched.length;
        const totalPages =
          res?.meta?.totalPages ?? Math.max(1, Math.ceil(total / targetPageSize));
        const totalsByCurrency = cachedTotals || res?.meta?.totalsByCurrency;

        openInvoicesReportPreview({
          reportType,
          invoices: fetched,
          targetWindow: previewWin,
          filters: reportFiltersInfo,
          pagination: {
            page: targetPage,
            pageSize: targetPageSize,
            total,
            totalPages,
            totalsByCurrency,
            onPageChange: (nextPage, nextSize) => {
              loadReportPage(nextPage, nextSize, totalsByCurrency);
            },
          },
        });
      } catch (err: any) {
        if (targetPage === 1 && previewWin) {
          previewWin.close();
        }
        toast.error(
          err?.data?.errors?.[0]?.message || 'Failed to generate invoice report',
        );
      }
    };

    await loadReportPage(1, 500);
  };

  return (
    <div className="rp-clean-card">
      <div className="rp-grid-3">
        {/* Row 1: Report Type, Invoice Type, Currency */}
        <div className="rb-field">
          <label>
            Report Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as InvoiceReportType)}
          >
            <option value="summary">Invoice Summary Report</option>
            <option value="detail">Invoice Detail Report</option>
            <option value="voucher">Invoice Voucher Print Preview</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Invoice Type</label>
          <select
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
          >
            <option value="">All Invoices</option>
            <option value="monthly">Monthly Invoice</option>
            <option value="rental">Rental Invoice</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Currency</label>
          <select
            value={currencyFilter || baseCurrencyCode}
            onChange={(e) => setCurrencyFilter(e.target.value)}
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.isBase ? ' (Base)' : ''}
              </option>
            ))}
            <option value="ALL">All Currencies</option>
          </select>
        </div>

        {/* Row 2: From Date, To Date, Status */}
        <div className="rb-field">
          <label>From Date (Issue Date)</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>To Date (Issue Date)</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Start Invoice, End Invoice, Tenant */}
        <div className="rb-field">
          <label>Start Invoice</label>
          <input
            type="text"
            placeholder="e.g. INV-000001"
            value={startInvoice}
            onChange={(e) => setStartInvoice(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>End Invoice</label>
          <input
            type="text"
            placeholder="e.g. INV-000500"
            value={endInvoice}
            onChange={(e) => setEndInvoice(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Tenant</label>
          <ComboBox
            id="central-invoice-report-tenant"
            value={tenantId}
            placeholder="All Tenants"
            emptyText="No tenants found"
            options={tenantComboOptions}
            onChange={(val) => setTenantId(val)}
          />
        </div>

        {/* Row 4: Floor, Unit / Room, Sort By & Order */}
        <div className="rb-field">
          <label>Floor</label>
          <select
            value={floor}
            onChange={(e) => {
              setFloor(e.target.value);
              setUnitNumber('');
            }}
          >
            <option value="">All Floors</option>
            {floorOptions.map((fl) => (
              <option key={fl} value={fl}>
                {fl}
              </option>
            ))}
          </select>
        </div>

        <div className="rb-field">
          <label>Unit / Room</label>
          <select
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
          >
            <option value="">All Units</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="rp-sort-pair">
          <div className="rb-field">
            <label>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="invoiceNumber">Invoice Number</option>
              <option value="issueDate">Issue Date</option>
              <option value="dueDate">Due Date</option>
              <option value="floor">Floor</option>
              <option value="unit">Unit / Room</option>
              <option value="tenant">Tenant</option>
              <option value="totalAmount">Total Amount</option>
            </select>
          </div>
          <div className="rb-field">
            <label>Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
        </div>
      </div>

      {/* Validation Banner */}
      {validationError && (
        <div className="rp-validation-alert">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{validationError}</span>
        </div>
      )}

      {/* Footer Bar */}
      <div className="rp-card-footer">
        <span className="rb-hint" style={{ margin: 0 }}>
          <FileText size={13} />
          Opens a printable report preview window (Print / Save as PDF).
        </span>
        <div className="rp-footer-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerateReport}
            disabled={generatingReport}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={14} /> {generatingReport ? 'Loading…' : 'Preview'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 2. LEASE REPORT FORM (3-COLUMN CLEAN GRID)
// ═══════════════════════════════════════════════════

function LeaseReportForm({ activeProperty }: { activeProperty: string }) {
  const { data: filterMetaResp } = useGetInvoiceReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchLeases, { isFetching: fetchingLeases }] =
    useLazyGetLeasesQuery();
  const [triggerFetchLeaseDetail] = useLazyGetLeaseQuery();
  const [loadingDetails, setLoadingDetails] = useState(false);

  const { data: usersData } = useGetUsersQuery({ limit: '200' });
  const { data: leadsData } = useGetLeadsQuery({ limit: 100 });

  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode =
    currencyRates.find((r) => r.isBaseCurrency)?.currency || 'MMK';

  const currencyOptions = useMemo(
    () => buildCurrencyOptions(currencyRates, baseCurrencyCode),
    [currencyRates, baseCurrencyCode],
  );

  const defaultDates = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      min: format(firstDay, 'yyyy-MM-dd'),
      max: format(lastDay, 'yyyy-MM-dd'),
    };
  }, []);

  const [reportType, setReportType] = useState<LeaseReportType>('summary');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>(() => defaultDates.min);
  const [toDate, setToDate] = useState<string>(() => defaultDates.max);
  const [expiringWithinDays, setExpiringWithinDays] = useState<string>('');
  const [startLease, setStartLease] = useState<string>('');
  const [endLease, setEndLease] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('leaseNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [validationError, setValidationError] = useState<string>('');

  const floorOptions = useMemo(
    () => filterMeta?.floors || [],
    [filterMeta?.floors],
  );

  const unitOptions = useMemo(() => {
    const list = filterMeta?.units || [];
    const set = new Set<string>();
    list.forEach((u) => {
      if (floor && u.floor !== floor) return;
      if (u.unitNumber) set.add(u.unitNumber);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [filterMeta?.units, floor]);

  const tenantComboOptions = useMemo(() => {
    const items = filterMeta?.tenantItems || [];
    return items.map((t) => {
      const topLine = t.firstName || t.lastName;
      const subLine =
        t.firstName && t.lastName && t.lastName !== t.firstName
          ? t.lastName
          : undefined;
      return {
        id: t.id,
        label: topLine,
        sublabel: subLine,
      };
    });
  }, [filterMeta?.tenantItems]);

  const selectedTenantDisplay = useMemo(() => {
    if (!tenantId) return '';
    const found = (filterMeta?.tenantItems || []).find(
      (t) => t.id === tenantId,
    );
    if (!found) return '';
    return [found.firstName, found.lastName].filter(Boolean).join(' - ');
  }, [tenantId, filterMeta?.tenantItems]);

  useEffect(() => {
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
    } else if (
      startLease.trim() &&
      endLease.trim() &&
      startLease.trim().localeCompare(endLease.trim(), undefined, { numeric: true }) > 0
    ) {
      setValidationError('Start Lease cannot be greater than End Lease.');
    } else {
      setValidationError('');
    }
  }, [fromDate, toDate, startLease, endLease]);

  const handleResetFilters = () => {
    setCurrencyFilter('ALL');
    setFromDate(defaultDates.min);
    setToDate(defaultDates.max);
    setExpiringWithinDays('');
    setStartLease('');
    setEndLease('');
    setFloor('');
    setUnitNumber('');
    setTenantId('');
    setStatusFilter('');
    setSortBy('leaseNumber');
    setSortOrder('asc');
    setValidationError('');
  };

  const handleGenerateLeaseReport = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
      toast.error('From Date cannot be later than To Date');
      return;
    }
    if (
      startLease.trim() &&
      endLease.trim() &&
      startLease.trim().localeCompare(endLease.trim(), undefined, { numeric: true }) > 0
    ) {
      setValidationError('Start Lease cannot be greater than End Lease.');
      toast.error('Start Lease cannot be greater than End Lease');
      return;
    }

    setValidationError('');

    try {
      setLoadingDetails(true);
      const res = await triggerFetchLeases({
        propertyId: activeProperty || undefined,
        tenantId: tenantId || undefined,
        status: statusFilter || undefined,
        expiringWithinDays: expiringWithinDays ? Number(expiringWithinDays) : undefined,
        page: 1,
        limit: 1000,
      }).unwrap();

      let list = [...(res?.data || [])];

      if (currencyFilter && currencyFilter !== 'ALL') {
        list = list.filter(
          (l) => (l.currency || 'MMK').toUpperCase() === currencyFilter.toUpperCase(),
        );
      }
      if (fromDate) {
        list = list.filter((l) => (l.startDate || '').slice(0, 10) >= fromDate);
      }
      if (toDate) {
        list = list.filter((l) => (l.endDate || '').slice(0, 10) <= toDate);
      }
      if (startLease.trim()) {
        const s = startLease.trim().toLowerCase();
        list = list.filter(
          (l) =>
            (l.leaseNumber || '')
              .toLowerCase()
              .localeCompare(s, undefined, { numeric: true }) >= 0,
        );
      }
      if (endLease.trim()) {
        const e = endLease.trim().toLowerCase();
        list = list.filter(
          (l) =>
            (l.leaseNumber || '')
              .toLowerCase()
              .localeCompare(e, undefined, { numeric: true }) <= 0,
        );
      }
      if (floor) {
        list = list.filter((l) => {
          const fl =
            l.unit?.floorLabel ||
            (l.unit?.floorNumber != null ? `Floor ${l.unit.floorNumber}` : '');
          return fl === floor || String(l.unit?.floorNumber ?? '') === floor;
        });
      }
      if (unitNumber) {
        list = list.filter((l) => l.unit?.unitNumber === unitNumber);
      }

      if (list.length === 0) {
        setValidationError('No leases match the current filter criteria.');
        toast.error('No leases match the current filter criteria.');
        return;
      }

      list.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'leaseNumber') {
          cmp = (a.leaseNumber || '').localeCompare(b.leaseNumber || '', undefined, {
            numeric: true,
          });
        } else if (sortBy === 'startDate') {
          cmp = (a.startDate || '').localeCompare(b.startDate || '');
        } else if (sortBy === 'endDate') {
          cmp = (a.endDate || '').localeCompare(b.endDate || '');
        } else if (sortBy === 'floor') {
          cmp = (a.unit?.floorLabel || '').localeCompare(b.unit?.floorLabel || '', undefined, {
            numeric: true,
          });
        } else if (sortBy === 'unit') {
          cmp = (a.unit?.unitNumber || '').localeCompare(b.unit?.unitNumber || '', undefined, {
            numeric: true,
          });
        } else if (sortBy === 'tenant') {
          const ta = a.tenant?.lastName || a.tenant?.companyName || a.tenant?.firstName || '';
          const tb = b.tenant?.lastName || b.tenant?.companyName || b.tenant?.firstName || '';
          cmp = ta.localeCompare(tb);
        } else if (sortBy === 'rentAmount') {
          cmp = (Number(a.rentAmount) || 0) - (Number(b.rentAmount) || 0);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });

      const previewWin = window.open('', '_blank');
      if (!previewWin) {
        toast.error(
          'Popup blocked! Please allow popups for this site to view the report.',
        );
        return;
      }

      let finalLeases: any[] = list;
      if (reportType === 'detail' || reportType === 'form' || reportType === 'preview') {
        const subset = reportType === 'form' || reportType === 'preview' ? list.slice(0, 25) : list.slice(0, 100);
        const detailed = await Promise.all(
          subset.map(async (item) => {
            try {
              const d = await triggerFetchLeaseDetail(item.id).unwrap();
              return d?.data || item;
            } catch {
              return item;
            }
          }),
        );
        finalLeases = detailed;
      }

      openLeasesReportPreview({
        reportType,
        leases: finalLeases,
        users: usersData?.data || [],
        leads: leadsData?.data || [],
        targetWindow: previewWin,
        filters: {
          currency: currencyFilter !== 'ALL' ? currencyFilter : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          expiringWithinDays: expiringWithinDays ? Number(expiringWithinDays) : undefined,
          startLease: startLease.trim() || undefined,
          endLease: endLease.trim() || undefined,
          floor: floor || undefined,
          unit: unitNumber || undefined,
          tenant: selectedTenantDisplay || undefined,
          status: statusFilter || undefined,
        },
      });
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to generate lease report');
    } finally {
      setLoadingDetails(false);
    }
  };

  const isBusy = fetchingLeases || loadingDetails;

  return (
    <div className="rp-clean-card">
      <div className="rp-grid-3">
        {/* Row 1: Report Type, Currency, Expiring Within */}
        <div className="rb-field">
          <label>
            Report Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as LeaseReportType)}
          >
            <option value="summary">Lease Summary Report</option>
            <option value="detail">Lease Detail Report</option>
            <option value="form">Lease Form Print Preview</option>
            <option value="preview">Lease Preview (A4 Voucher)</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Currency</label>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
          >
            <option value="ALL">All Currencies</option>
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.isBase ? ' (Base)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="rb-field">
          <label>Expiring Within</label>
          <select
            value={expiringWithinDays}
            onChange={(e) => setExpiringWithinDays(e.target.value)}
          >
            <option value="">All Leases</option>
            <option value="30">Expiring within 30 Days</option>
            <option value="60">Expiring within 60 Days</option>
            <option value="90">Expiring within 90 Days</option>
          </select>
        </div>

        {/* Row 2: From Date, To Date, Status */}
        <div className="rb-field">
          <label>From Date (Start Date)</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>To Date (End Date)</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {LEASE_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Start Lease #, End Lease #, Tenant */}
        <div className="rb-field">
          <label>Start Lease #</label>
          <input
            type="text"
            placeholder="e.g. LSE-00001"
            value={startLease}
            onChange={(e) => setStartLease(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>End Lease #</label>
          <input
            type="text"
            placeholder="e.g. LSE-00500"
            value={endLease}
            onChange={(e) => setEndLease(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Tenant</label>
          <ComboBox
            id="central-lease-report-tenant"
            value={tenantId}
            placeholder="All Tenants"
            emptyText="No tenants found"
            options={tenantComboOptions}
            onChange={(val) => setTenantId(val)}
          />
        </div>

        {/* Row 4: Floor, Unit / Room, Sort By & Order */}
        <div className="rb-field">
          <label>Floor</label>
          <select
            value={floor}
            onChange={(e) => {
              setFloor(e.target.value);
              setUnitNumber('');
            }}
          >
            <option value="">All Floors</option>
            {floorOptions.map((fl) => (
              <option key={fl} value={fl}>
                {fl}
              </option>
            ))}
          </select>
        </div>

        <div className="rb-field">
          <label>Unit / Room</label>
          <select
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
          >
            <option value="">All Units</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="rp-sort-pair">
          <div className="rb-field">
            <label>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="leaseNumber">Lease Number</option>
              <option value="startDate">Start Date</option>
              <option value="endDate">End Date</option>
              <option value="floor">Floor</option>
              <option value="unit">Unit / Room</option>
              <option value="tenant">Tenant</option>
              <option value="rentAmount">Rent Amount</option>
            </select>
          </div>
          <div className="rb-field">
            <label>Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
        </div>
      </div>

      {/* Validation Banner */}
      {validationError && (
        <div className="rp-validation-alert">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{validationError}</span>
        </div>
      )}

      {/* Footer Bar */}
      <div className="rp-card-footer">
        <span className="rb-hint" style={{ margin: 0 }}>
          <FileText size={13} />
          Opens a printable report preview window (Print / Save as PDF).
        </span>
        <div className="rp-footer-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerateLeaseReport}
            disabled={isBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={14} /> {isBusy ? 'Loading…' : 'Preview'}
          </button>
        </div>
      </div>
    </div>
  );
}
