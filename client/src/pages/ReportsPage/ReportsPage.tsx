import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  FileText,
  Receipt,
  ClipboardList,
  Users2,
  Building2,
  Zap,
  RotateCcw,
} from 'lucide-react';
import {
  ReportNoticeModal,
  type ReportNoticeState,
} from './components/ReportNoticeModal';
import {
  useLazyGetInvoicesQuery,
  useGetInvoiceReportFiltersQuery,
  useGetCurrencyRatesQuery,
} from '../../store/api/billingApi';
import {
  useLazyGetLeasesQuery,
  useLazyGetLeaseQuery,
} from '../../store/api/leasesApi';
import {
  useGetMeterRecordReportFiltersQuery,
  useLazyGetMeterRecordsReportQuery,
} from '../../store/api/meterRecordsApi';
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
  openTenantReportPreview,
  openUnitReportPreview,
  computeUnitAvailability,
  isCurrentOccupancyLease,
  isPreviousOccupancyLease,
  type LeaseReportType,
  type TenantReportType,
  type TenantOccupancyFilter,
  type UnitReportType,
  type UnitReportEntry,
} from '../admin/LeasesPage/utils/leasePrintPreview';
import {
  openMeterRecordReportPreview,
  type MeterRecordReportType,
} from './utils/meterRecordPrintPreview';
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

const UNIT_STATUS_OPTIONS = [
  { value: 'occupied', label: 'OCCUPIED' },
  { value: 'available', label: 'AVAILABLE' },
  { value: 'reserved', label: 'RESERVED' },
  { value: 'maintenance', label: 'MAINTENANCE' },
  { value: 'not_for_rent', label: 'NOT FOR RENT' },
];

const AVAILABILITY_WINDOW_OPTIONS = [
  {
    id: 'available_now',
    label: 'Available Now',
    sublabel: 'Vacant / available rooms ready now (0 days)',
  },
  {
    id: '7',
    label: '≤ 7 Days',
    sublabel: 'Available now or active lease expiring within 7 days',
  },
  {
    id: '15',
    label: '≤ 15 Days',
    sublabel: 'Available now or active lease expiring within 15 days',
  },
  {
    id: '30',
    label: '≤ 30 Days',
    sublabel: 'Available now or active lease expiring within 30 days',
  },
  {
    id: '60',
    label: '≤ 60 Days',
    sublabel: 'Available now or active lease expiring within 60 days',
  },
  {
    id: '90',
    label: '≤ 90 Days',
    sublabel: 'Available now or active lease expiring within 90 days',
  },
];

export default function ReportsPage({
  mode,
}: {
  mode?: 'invoice' | 'lease' | 'tenant' | 'unit' | 'meterRecord';
}) {
  const location = useLocation();
  const activeMode: 'invoice' | 'lease' | 'tenant' | 'unit' | 'meterRecord' =
    mode ??
    (location.pathname.includes('/meter-records')
      ? 'meterRecord'
      : location.pathname.includes('/units')
      ? 'unit'
      : location.pathname.includes('/tenants')
      ? 'tenant'
      : location.pathname.includes('/leases')
      ? 'lease'
      : 'invoice');
  const activeProperty = useSelectedPropertyFilter();

  return (
    <div className="reports-page">
      {/* Page Header */}
      <div className="rp-top-bar">
        <div className="page-title-row">
          <div className="page-icon-lg">
            {activeMode === 'invoice' ? (
              <Receipt size={22} />
            ) : activeMode === 'lease' ? (
              <ClipboardList size={22} />
            ) : activeMode === 'tenant' ? (
              <Users2 size={22} />
            ) : activeMode === 'meterRecord' ? (
              <Zap size={22} />
            ) : (
              <Building2 size={22} />
            )}
          </div>
          <div>
            <h1>
              {activeMode === 'invoice'
                ? 'Invoice Report'
                : activeMode === 'lease'
                ? 'Lease Report'
                : activeMode === 'tenant'
                ? 'Tenant Unit & Lease History Report'
                : activeMode === 'meterRecord'
                ? 'Meter Record Report'
                : 'Unit Occupancy & Lease History Report'}
            </h1>
            <p>
              {activeMode === 'invoice'
                ? 'Invoice Summary, Detail & Voucher Report'
                : activeMode === 'lease'
                ? 'Lease Summary, Detail, Form & Preview Report'
                : activeMode === 'tenant'
                ? 'Tenant Current Owned & Previous Owned Units, Lease Numbers, Dates & Status Report'
                : activeMode === 'meterRecord'
                ? 'Meter Readings, Usage, Rate & Amount Detail and Summary Report'
                : 'Unit No, Shop Name, Floor, Area, Lease Numbers, Start & End Dates & Status Report'}
            </p>
          </div>
        </div>
      </div>

      {activeMode === 'invoice' ? (
        <InvoiceReportForm activeProperty={activeProperty} />
      ) : activeMode === 'lease' ? (
        <LeaseReportForm activeProperty={activeProperty} />
      ) : activeMode === 'tenant' ? (
        <TenantReportForm activeProperty={activeProperty} />
      ) : activeMode === 'meterRecord' ? (
        <MeterRecordReportForm activeProperty={activeProperty} />
      ) : (
        <UnitReportForm activeProperty={activeProperty} />
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
  const [notice, setNotice] = useState<ReportNoticeState | null>(null);

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
    setNotice(null);
  };

  const handleGenerateReport = async () => {
    if (!reportType) {
      setNotice({
        variant: 'error',
        title: 'Report Type Required',
        message: 'Please select a Report Type before previewing.',
      });
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setNotice({
        variant: 'error',
        title: 'Invalid Date Range',
        message: 'From Date cannot be later than To Date. Please adjust the dates to continue.',
      });
      return;
    }
    if (
      startInvoice.trim() &&
      endInvoice.trim() &&
      startInvoice.trim() > endInvoice.trim()
    ) {
      setNotice({
        variant: 'error',
        title: 'Invalid Invoice Range',
        message: 'Start Invoice cannot be greater than End Invoice. Please adjust the range.',
      });
      return;
    }

    setNotice(null);

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
        ? ({ monthly: 'Monthly Invoice', rental: 'Rental Invoice', deposit: 'Deposit Invoice', other: 'Other' }[billType] || billType)
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
          setNotice({
            variant: 'empty',
            title: 'No Invoices Found',
            message: 'No invoices match your current filter criteria. Try widening the date range or resetting your filters.',
          });
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
            <option value="deposit">Deposit Invoice</option>
            <option value="other">Other</option>
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

      <ReportNoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        onReset={handleResetFilters}
      />
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
  const [notice, setNotice] = useState<ReportNoticeState | null>(null);

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
    setNotice(null);
  };

  const handleGenerateLeaseReport = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      setNotice({
        variant: 'error',
        title: 'Invalid Date Range',
        message: 'From Date cannot be later than To Date. Please adjust the dates to continue.',
      });
      return;
    }
    if (
      startLease.trim() &&
      endLease.trim() &&
      startLease.trim().localeCompare(endLease.trim(), undefined, { numeric: true }) > 0
    ) {
      setNotice({
        variant: 'error',
        title: 'Invalid Lease Range',
        message: 'Start Lease cannot be greater than End Lease. Please adjust the range.',
      });
      return;
    }

    setNotice(null);

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
        setNotice({
          variant: 'empty',
          title: 'No Leases Found',
          message: 'No leases match your current filter criteria. Try widening the date range or resetting your filters.',
        });
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

      <ReportNoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        onReset={handleResetFilters}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TENANT UNIT & LEASE HISTORY REPORT FORM (3-COLUMN CLEAN GRID)
// ═══════════════════════════════════════════════════════════════════════════

function TenantReportForm({ activeProperty }: { activeProperty: string }) {
  const { data: filterMetaResp } = useGetInvoiceReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchLeases, { isFetching: fetchingLeases }] =
    useLazyGetLeasesQuery();

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

  const [reportType, setReportType] = useState<TenantReportType>('detail');
  const [occupancyFilter, setOccupancyFilter] =
    useState<TenantOccupancyFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>(() => defaultDates.min);
  const [toDate, setToDate] = useState<string>(() => defaultDates.max);
  const [startLease, setStartLease] = useState<string>('');
  const [endLease, setEndLease] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('tenant');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [notice, setNotice] = useState<ReportNoticeState | null>(null);

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

  const handleResetFilters = () => {
    setReportType('detail');
    setOccupancyFilter('all');
    setCurrencyFilter('ALL');
    setFromDate(defaultDates.min);
    setToDate(defaultDates.max);
    setStartLease('');
    setEndLease('');
    setFloor('');
    setUnitNumber('');
    setTenantId('');
    setStatusFilter('');
    setSortBy('tenant');
    setSortOrder('asc');
    setNotice(null);
  };

  const handleGenerateTenantReport = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      setNotice({
        variant: 'error',
        title: 'Invalid Date Range',
        message: 'From Date cannot be later than To Date. Please adjust the dates to continue.',
      });
      return;
    }
    if (
      startLease.trim() &&
      endLease.trim() &&
      startLease
        .trim()
        .localeCompare(endLease.trim(), undefined, { numeric: true }) > 0
    ) {
      setNotice({
        variant: 'error',
        title: 'Invalid Lease Range',
        message: 'Start Lease cannot be greater than End Lease. Please adjust the range.',
      });
      return;
    }

    setNotice(null);

    try {
      const res = await triggerFetchLeases({
        propertyId: activeProperty || undefined,
        tenantId: tenantId || undefined,
        status: statusFilter || undefined,
        page: 1,
        limit: 1000,
      }).unwrap();

      const allLeases = [...(res?.data || [])];

      const getFl = (l: any) =>
        String(l.unit?.floorLabel || l.unit?.floorNumber || '').trim();

      // Step 1: Find which tenants have at least one lease matching the selected date window
      // (a lease matches the date window if its [startDate, endDate] overlaps [fromDate, toDate],
      // or its startDate/endDate falls inside [fromDate, toDate]).
      // Then, when occupancyFilter === 'all', include all historical (previous owned) leases
      // for those matched tenants so the report always shows both Current Unit and Before Owned Units!
      const matchesDateRange = (l: any): boolean => {
        if (!fromDate && !toDate) return true;
        const s = l.startDate ? String(l.startDate).slice(0, 10) : '';
        const e = l.endDate ? String(l.endDate).slice(0, 10) : s;
        if (fromDate && toDate) {
          return s <= toDate && e >= fromDate;
        }
        if (fromDate) return e >= fromDate;
        if (toDate) return s <= toDate;
        return true;
      };

      const matchesNonDateFilters = (l: any): boolean => {
        if (currencyFilter && currencyFilter !== 'ALL') {
          if ((l.currency || 'MMK') !== currencyFilter) return false;
        }
        if (occupancyFilter === 'current' && !isCurrentOccupancyLease(l.status)) {
          return false;
        }
        if (
          occupancyFilter === 'previous' &&
          !isPreviousOccupancyLease(l.status)
        ) {
          return false;
        }
        if (startLease.trim()) {
          if (
            (l.leaseNumber || '').localeCompare(
              startLease.trim(),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ) < 0
          ) {
            return false;
          }
        }
        if (endLease.trim()) {
          if (
            (l.leaseNumber || '').localeCompare(
              endLease.trim(),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ) > 0
          ) {
            return false;
          }
        }
        if (floor && getFl(l) !== floor) return false;
        if (unitNumber && (l.unit?.unitNumber || '') !== unitNumber) {
          return false;
        }
        return true;
      };

      // Identify tenants that have at least one lease overlapping the date range
      const matchedTenantIds = new Set<string>();
      for (const l of allLeases) {
        if (matchesDateRange(l)) {
          const tId =
            l.tenant?.id ||
            `${l.tenant?.firstName || ''}__${l.tenant?.lastName || l.tenant?.companyName || ''}`;
          matchedTenantIds.add(tId);
        }
      }

      let items = allLeases.filter((l) => {
        if (!matchesNonDateFilters(l)) return false;
        const tId =
          l.tenant?.id ||
          `${l.tenant?.firstName || ''}__${l.tenant?.lastName || l.tenant?.companyName || ''}`;
        if (occupancyFilter === 'all') {
          // Include all current & previous owned units of any tenant active/overlapping in the date window
          return matchedTenantIds.has(tId);
        }
        return matchesDateRange(l);
      });

      // Fallback: if no lease overlapped the current month window (e.g. only older historical leases exist),
      // show all leases matching the non-date filters so previous owned units are still visible
      if (items.length === 0 && allLeases.length > 0 && occupancyFilter !== 'current') {
        items = allLeases.filter(matchesNonDateFilters);
      }

      if (items.length === 0) {
        setNotice({
          variant: 'empty',
          title: 'No Tenant Records Found',
          message: 'No tenant unit or lease records match your current filter criteria. Try widening the date range or resetting your filters.',
        });
        return;
      }

      const dir = sortOrder === 'asc' ? 1 : -1;
      items.sort((a: any, b: any) => {
        switch (sortBy) {
          case 'leaseNumber':
            return (
              dir *
              (a.leaseNumber || '').localeCompare(
                b.leaseNumber || '',
                undefined,
                { numeric: true },
              )
            );
          case 'startDate':
            return (
              dir *
              ((a.startDate ? new Date(a.startDate).getTime() : 0) -
                (b.startDate ? new Date(b.startDate).getTime() : 0))
            );
          case 'endDate':
            return (
              dir *
              ((a.endDate ? new Date(a.endDate).getTime() : 0) -
                (b.endDate ? new Date(b.endDate).getTime() : 0))
            );
          case 'floor':
            return (
              dir *
              getFl(a).localeCompare(getFl(b), undefined, { numeric: true })
            );
          case 'unit':
            return (
              dir *
              (a.unit?.unitNumber || '').localeCompare(
                b.unit?.unitNumber || '',
                undefined,
                { numeric: true },
              )
            );
          case 'rentAmount':
            return (
              dir * ((Number(a.rentAmount) || 0) - (Number(b.rentAmount) || 0))
            );
          case 'tenant':
          default: {
            const ta = `${a.tenant?.firstName || ''} ${
              a.tenant?.lastName || a.tenant?.companyName || ''
            }`.trim();
            const tb = `${b.tenant?.firstName || ''} ${
              b.tenant?.lastName || b.tenant?.companyName || ''
            }`.trim();
            return (
              dir * ta.localeCompare(tb, undefined, { numeric: true })
            );
          }
        }
      });

      const sortLabels: Record<string, string> = {
        tenant: 'Tenant',
        unit: 'Unit / Room',
        floor: 'Floor',
        leaseNumber: 'Lease Number',
        startDate: 'Start Date',
        endDate: 'End Date',
        rentAmount: 'Rent Amount',
      };

      const ok = openTenantReportPreview(items, {
        reportType,
        occupancyFilter,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        floor: floor || undefined,
        unit: unitNumber || undefined,
        tenant: selectedTenantDisplay || undefined,
        status: statusFilter || undefined,
        currency:
          currencyFilter === 'ALL' ? 'All Currencies' : currencyFilter,
        sortByLabel: sortLabels[sortBy] || sortBy,
        sortOrder,
      });

      if (!ok) {
        toast.error('Please allow pop-ups to view the printable report');
      }
    } catch {
      toast.error('Failed to load tenant report data');
    }
  };

  return (
    <div className="rp-clean-card">
      <div className="rp-grid-3">
        {/* Row 1: Report Type | Unit History | Currency */}
        <div className="rb-field">
          <label>
            Report Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as TenantReportType)}
          >
            <option value="summary">Tenant Summary Report</option>
            <option value="detail">Tenant Detail Report</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Unit History</label>
          <select
            value={occupancyFilter}
            onChange={(e) =>
              setOccupancyFilter(e.target.value as TenantOccupancyFilter)
            }
          >
            <option value="all">All Units</option>
            <option value="current">Current Units</option>
            <option value="previous">Previous Units</option>
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

        {/* Row 2: From Date | To Date | Lease Status */}
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
          <label>Lease Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {LEASE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Row 3: Start Lease # | End Lease # | Tenant */}
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
            id="central-tenant-report-tenant"
            value={tenantId}
            onChange={(id) => setTenantId(id)}
            options={tenantComboOptions}
            placeholder="All Tenants"
            clearLabel="All Tenants"
          />
        </div>

        {/* Row 4: Floor | Unit / Room | Sort By + Order */}
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
              <option value="tenant">Tenant</option>
              <option value="unit">Unit / Room</option>
              <option value="floor">Floor</option>
              <option value="leaseNumber">Lease Number</option>
              <option value="startDate">Start Date</option>
              <option value="endDate">End Date</option>
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
            onClick={handleGenerateTenantReport}
            disabled={fetchingLeases}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={14} /> {fetchingLeases ? 'Loading…' : 'Preview'}
          </button>
        </div>
      </div>

      <ReportNoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        onReset={handleResetFilters}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. UNIT OCCUPANCY & LEASE HISTORY REPORT FORM (3-COLUMN CLEAN GRID)
// ═══════════════════════════════════════════════════════════════════════════

function UnitReportForm({ activeProperty }: { activeProperty: string }) {
  const { data: filterMetaResp } = useGetInvoiceReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchLeases, { isFetching: fetchingLeases }] =
    useLazyGetLeasesQuery();

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

  const [reportType, setReportType] = useState<UnitReportType>('detail');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('');
  const [unitStatusFilter, setUnitStatusFilter] = useState<string>('');
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>(() => defaultDates.min);
  const [toDate, setToDate] = useState<string>(() => defaultDates.max);
  const [shopNameSearch, setShopNameSearch] = useState<string>('');
  const [startLease, setStartLease] = useState<string>('');
  const [endLease, setEndLease] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('unit');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [notice, setNotice] = useState<ReportNoticeState | null>(null);

  const handleReportTypeChange = (nextType: UnitReportType) => {
    setReportType(nextType);
    if (nextType === 'availability') {
      setSortBy('daysLeft');
      setSortOrder('asc');
    } else if (sortBy === 'daysLeft') {
      setSortBy('unit');
    }
  };

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

  const handleResetFilters = () => {
    setReportType('detail');
    setAvailabilityFilter('');
    setUnitStatusFilter('');
    setLeaseStatusFilter('');
    setCurrencyFilter('ALL');
    setFromDate(defaultDates.min);
    setToDate(defaultDates.max);
    setShopNameSearch('');
    setStartLease('');
    setEndLease('');
    setFloor('');
    setUnitNumber('');
    setTenantId('');
    setSortBy('unit');
    setSortOrder('asc');
    setNotice(null);
  };

  const handleGenerateUnitReport = async () => {
    if (fromDate && toDate && fromDate > toDate) {
      setNotice({
        variant: 'error',
        title: 'Invalid Date Range',
        message: 'From Date cannot be later than To Date. Please adjust the dates to continue.',
      });
      return;
    }
    if (
      startLease.trim() &&
      endLease.trim() &&
      startLease
        .trim()
        .localeCompare(endLease.trim(), undefined, { numeric: true }) > 0
    ) {
      setNotice({
        variant: 'error',
        title: 'Invalid Lease Range',
        message: 'Start Lease cannot be greater than End Lease. Please adjust the range.',
      });
      return;
    }

    setNotice(null);

    try {
      const res = await triggerFetchLeases({
        propertyId: activeProperty || undefined,
        tenantId: tenantId || undefined,
        status: leaseStatusFilter || undefined,
        page: 1,
        limit: 1000,
      }).unwrap();

      const allLeases = [...(res?.data || [])];
      const allMetaUnits = filterMeta?.units || [];

      const getFl = (l: any) => {
        const fl = l.unit?.floorLabel;
        const fn = l.unit?.floorNumber;
        if (fl && String(fl).trim()) return String(fl).trim();
        if (fn !== null && fn !== undefined && String(fn).trim() !== '') {
          return `Floor ${fn}`;
        }
        return '';
      };

      const matchesLeaseDate = (l: any): boolean => {
        if (!fromDate && !toDate) return true;
        const s = l.startDate ? String(l.startDate).slice(0, 10) : '';
        const e = l.endDate ? String(l.endDate).slice(0, 10) : s;
        if (fromDate && toDate) {
          return s <= toDate && e >= fromDate;
        }
        if (fromDate) return e >= fromDate;
        if (toDate) return s <= toDate;
        return true;
      };

      const matchesLeaseSpecificFilters = (l: any): boolean => {
        if (currencyFilter && currencyFilter !== 'ALL') {
          if ((l.currency || 'MMK') !== currencyFilter) return false;
        }
        if (leaseStatusFilter && l.status !== leaseStatusFilter) return false;
        if (tenantId && l.tenant?.id !== tenantId) return false;
        if (startLease.trim()) {
          if (
            (l.leaseNumber || '').localeCompare(
              startLease.trim(),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ) < 0
          ) {
            return false;
          }
        }
        if (endLease.trim()) {
          if (
            (l.leaseNumber || '').localeCompare(
              endLease.trim(),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ) > 0
          ) {
            return false;
          }
        }
        return true;
      };

      // Build map of UnitReportEntry from allMetaUnits + any units referenced on leases
      const unitMap = new Map<string, UnitReportEntry>();

      for (const u of allMetaUnits) {
        const key = u.id || u.unitNumber;
        if (!key) continue;
        unitMap.set(u.unitNumber, {
          id: u.id || u.unitNumber,
          unitNumber: u.unitNumber,
          floor: u.floor || '-',
          areaSqft: u.areaSqft ?? null,
          unitStatus: u.status || 'available',
          shopName: u.shopName || null,
          propertyName: u.propertyName || null,
          baseRent: u.baseRent ?? null,
          currency: u.currency || baseCurrencyCode,
          leases: [],
        });
      }

      // Attach leases to their units
      for (const l of allLeases) {
        const uNum = l.unit?.unitNumber;
        if (!uNum) continue;
        let entry = unitMap.get(uNum);
        if (!entry) {
          entry = {
            id: l.unit?.id || uNum,
            unitNumber: uNum,
            floor: getFl(l) || '-',
            areaSqft:
              l.unit?.areaSqft != null ? Number(l.unit.areaSqft) : null,
            unitStatus:
              l.unit?.status ||
              (isCurrentOccupancyLease(l.status) ? 'occupied' : 'available'),
            shopName:
              l.shopName || l.unit?.shopProfile?.brandName || null,
            propertyName: l.property?.name || null,
            baseRent: Number(l.rentAmount) || null,
            currency: l.currency || baseCurrencyCode,
            leases: [],
          };
          unitMap.set(uNum, entry);
        } else {
          if (!entry.shopName && (l.shopName || l.unit?.shopProfile?.brandName)) {
            entry.shopName = l.shopName || l.unit?.shopProfile?.brandName;
          }
          if (!entry.propertyName && l.property?.name) {
            entry.propertyName = l.property.name;
          }
        }

        if (matchesLeaseSpecificFilters(l)) {
          entry.leases.push(l);
        }
      }

      // Sort leases within each unit: Current leases first, then Previous leases (newest startDate first)
      for (const entry of unitMap.values()) {
        entry.leases.sort((a, b) => {
          const aCurr = isCurrentOccupancyLease(a.status) ? 0 : 1;
          const bCurr = isCurrentOccupancyLease(b.status) ? 0 : 1;
          if (aCurr !== bCurr) return aCurr - bCurr;
          const da = a.startDate ? new Date(a.startDate).getTime() : 0;
          const db = b.startDate ? new Date(b.startDate).getTime() : 0;
          return db - da;
        });
      }

      const hasStrictLeaseFilter = Boolean(
        leaseStatusFilter ||
          tenantId ||
          startLease.trim() ||
          endLease.trim(),
      );

      const qShop = shopNameSearch.trim().toLowerCase();

      const entries = Array.from(unitMap.values()).filter((u) => {
        if (floor && u.floor !== floor) return false;
        if (unitNumber && u.unitNumber !== unitNumber) return false;
        if (
          unitStatusFilter &&
          (u.unitStatus || '').toLowerCase() !== unitStatusFilter.toLowerCase()
        ) {
          return false;
        }
        if (
          currencyFilter &&
          currencyFilter !== 'ALL' &&
          u.leases.length === 0 &&
          (u.currency || baseCurrencyCode) !== currencyFilter
        ) {
          return false;
        }
        if (qShop) {
          const uShopMatch = (u.shopName || '').toLowerCase().includes(qShop);
          const lShopMatch = u.leases.some((l) =>
            String(l.shopName || l.unit?.shopProfile?.brandName || '')
              .toLowerCase()
              .includes(qShop),
          );
          if (!uShopMatch && !lShopMatch) return false;
        }

        if (reportType === 'availability' && availabilityFilter) {
          const avail = computeUnitAvailability(u);
          if (availabilityFilter === 'available_now') {
            if (avail.state !== 'available_now') return false;
          } else {
            const maxDays = Number(availabilityFilter);
            if (!Number.isNaN(maxDays)) {
              if (avail.daysLeft === null || avail.daysLeft > maxDays) return false;
            }
          }
        }

        if (hasStrictLeaseFilter && u.leases.length === 0) {
          return false;
        }

        if (u.leases.length > 0 && reportType !== 'availability') {
          const anyInDateWindow = u.leases.some(matchesLeaseDate);
          if (!anyInDateWindow && hasStrictLeaseFilter) return false;
        }

        return true;
      });

      if (entries.length === 0) {
        setNotice({
          variant: 'empty',
          title: 'No Units Found',
          message: 'No unit or lease records match your current filter criteria. Try widening the date range or resetting your filters.',
        });
        return;
      }

      const dir = sortOrder === 'asc' ? 1 : -1;
      entries.sort((a, b) => {
        const aLease = a.leases[0];
        const bLease = b.leases[0];
        switch (sortBy) {
          case 'daysLeft': {
            const avA = computeUnitAvailability(a);
            const avB = computeUnitAvailability(b);
            const da =
              avA.daysLeft !== null ? avA.daysLeft : Number.MAX_SAFE_INTEGER;
            const db =
              avB.daysLeft !== null ? avB.daysLeft : Number.MAX_SAFE_INTEGER;
            if (da !== db) return dir * (da - db);
            return (a.unitNumber || '').localeCompare(
              b.unitNumber || '',
              undefined,
              { numeric: true },
            );
          }
          case 'floor':
            return (
              dir *
              (a.floor || '').localeCompare(b.floor || '', undefined, {
                numeric: true,
              })
            );
          case 'shopName': {
            const sa = a.shopName || aLease?.shopName || '';
            const sb = b.shopName || bLease?.shopName || '';
            return dir * sa.localeCompare(sb, undefined, { numeric: true });
          }
          case 'leaseNumber':
            return (
              dir *
              (aLease?.leaseNumber || '').localeCompare(
                bLease?.leaseNumber || '',
                undefined,
                { numeric: true },
              )
            );
          case 'startDate':
            return (
              dir *
              ((aLease?.startDate ? new Date(aLease.startDate).getTime() : 0) -
                (bLease?.startDate ? new Date(bLease.startDate).getTime() : 0))
            );
          case 'endDate':
            return (
              dir *
              ((aLease?.endDate ? new Date(aLease.endDate).getTime() : 0) -
                (bLease?.endDate ? new Date(bLease.endDate).getTime() : 0))
            );
          case 'rentAmount': {
            const ra = aLease
              ? Number(aLease.rentAmount) || 0
              : Number(a.baseRent) || 0;
            const rb = bLease
              ? Number(bLease.rentAmount) || 0
              : Number(b.baseRent) || 0;
            return dir * (ra - rb);
          }
          case 'status':
            return (
              dir *
              (a.unitStatus || '').localeCompare(b.unitStatus || '')
            );
          case 'unit':
          default:
            return (
              dir *
              (a.unitNumber || '').localeCompare(
                b.unitNumber || '',
                undefined,
                { numeric: true },
              )
            );
        }
      });

      const sortLabels: Record<string, string> = {
        unit: 'Unit No',
        floor: 'Floor',
        shopName: 'Shop Name',
        leaseNumber: 'Lease Number',
        startDate: 'Start Date',
        endDate: 'End Date',
        rentAmount: 'Rent Amount',
        status: 'Unit Status',
        daysLeft: 'Days Left',
      };

      const selectedAvailOption = AVAILABILITY_WINDOW_OPTIONS.find(
        (o) => o.id === availabilityFilter,
      );

      const ok = openUnitReportPreview(entries, {
        reportType,
        availabilityFilterLabel:
          reportType === 'availability' && selectedAvailOption
            ? selectedAvailOption.label
            : undefined,
        unitStatus: unitStatusFilter || undefined,
        leaseStatus: leaseStatusFilter || undefined,
        fromDate: reportType === 'availability' ? undefined : fromDate || undefined,
        toDate: reportType === 'availability' ? undefined : toDate || undefined,
        floor: floor || undefined,
        unit: unitNumber || undefined,
        shopName: shopNameSearch.trim() || undefined,
        currency:
          currencyFilter === 'ALL' ? 'All Currencies' : currencyFilter,
        sortByLabel: sortLabels[sortBy] || sortBy,
        sortOrder,
      });

      if (!ok) {
        toast.error('Please allow pop-ups to view the printable report');
      }
    } catch {
      toast.error('Failed to load unit report data');
    }
  };

  return (
    <div className="rp-clean-card">
      <div className="rp-grid-3">
        {/* Row 1: Report Type | Unit Status | Currency */}
        <div className="rb-field">
          <label>
            Report Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reportType}
            onChange={(e) => handleReportTypeChange(e.target.value as UnitReportType)}
          >
            <option value="summary">Unit Summary Report</option>
            <option value="detail">Unit Detail Report</option>
            <option value="availability">Upcoming Available Units Report</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Unit Status</label>
          <select
            value={unitStatusFilter}
            onChange={(e) => setUnitStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {UNIT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
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

        {/* Row 2: From Date | To Date | Availability Window (when availability) or Lease Status */}
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

        {reportType === 'availability' ? (
          <div className="rb-field">
            <label>Available / Expiring Within (Days Left)</label>
            <ComboBox
              id="unit-availability-window"
              value={availabilityFilter}
              onChange={setAvailabilityFilter}
              options={AVAILABILITY_WINDOW_OPTIONS}
              placeholder="All Units (Available & Expiring)"
            />
          </div>
        ) : (
          <div className="rb-field">
            <label>Lease Status</label>
            <select
              value={leaseStatusFilter}
              onChange={(e) => setLeaseStatusFilter(e.target.value)}
            >
              <option value="">All Lease Statuses</option>
              {LEASE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Row 3: Start Lease # | End Lease # | Shop Name */}
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
          <label>Shop Name</label>
          <input
            type="text"
            placeholder="Search shop name…"
            value={shopNameSearch}
            onChange={(e) => setShopNameSearch(e.target.value)}
          />
        </div>

        {/* Row 4: Floor | Unit No | Sort By + Order */}
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
          <label>Unit No</label>
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
              {reportType === 'availability' && (
                <option value="daysLeft">Days Left</option>
              )}
              <option value="unit">Unit No</option>
              <option value="floor">Floor</option>
              <option value="shopName">Shop Name</option>
              <option value="leaseNumber">Lease Number</option>
              <option value="startDate">Start Date</option>
              <option value="endDate">End Date</option>
              <option value="rentAmount">Rent Amount</option>
              <option value="status">Unit Status</option>
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
            onClick={handleGenerateUnitReport}
            disabled={fetchingLeases}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={14} /> {fetchingLeases ? 'Loading…' : 'Preview'}
          </button>
        </div>
      </div>

      <ReportNoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        onReset={handleResetFilters}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 5. METER RECORD REPORT FORM (3-COLUMN CLEAN GRID)
// ═══════════════════════════════════════════════════

function MeterRecordReportForm({ activeProperty }: { activeProperty: string }) {
  const { data: filterMetaResp } = useGetMeterRecordReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchMeterRecords, { isFetching: generatingReport }] =
    useLazyGetMeterRecordsReportQuery();

  const [reportType, setReportType] = useState<MeterRecordReportType>('detail');
  const [billDateFrom, setBillDateFrom] = useState<string>('');
  const [billDateTo, setBillDateTo] = useState<string>('');
  const [startDateFrom, setStartDateFrom] = useState<string>('');
  const [endDateTo, setEndDateTo] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantCode, setTenantCode] = useState<string>('');
  const [meterType, setMeterType] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [meterNo, setMeterNo] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('billDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [notice, setNotice] = useState<ReportNoticeState | null>(null);

  // Reset floor/unit selection when switching property scope
  useEffect(() => {
    setFloor('');
    setUnitNumber('');
  }, [activeProperty]);

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

  const tenantComboOptions = useMemo(
    () =>
      (filterMeta?.tenants || []).map((t) => ({
        id: t.code,
        label: t.code,
        sublabel: t.name && t.name !== t.code ? t.name : undefined,
      })),
    [filterMeta?.tenants],
  );

  const selectedTenantLabel = useMemo(() => {
    if (!tenantCode) return undefined;
    const found = (filterMeta?.tenants || []).find(
      (t) => t.code.toLowerCase() === tenantCode.toLowerCase(),
    );
    if (!found) return tenantCode;
    return found.name && found.name !== found.code
      ? `${found.code} — ${found.name}`
      : found.code;
  }, [filterMeta?.tenants, tenantCode]);

  const meterTypeOptions = useMemo(
    () => filterMeta?.meterTypes || [],
    [filterMeta?.meterTypes],
  );

  const categoryOptions = useMemo(
    () => filterMeta?.categories || [],
    [filterMeta?.categories],
  );

  const handleResetFilters = () => {
    setReportType('detail');
    setBillDateFrom('');
    setBillDateTo('');
    setStartDateFrom('');
    setEndDateTo('');
    setFloor('');
    setUnitNumber('');
    setTenantCode('');
    setMeterType('');
    setCategory('');
    setMeterNo('');
    setSortBy('billDate');
    setSortOrder('desc');
    setNotice(null);
  };

  const handleGenerateReport = async () => {
    setNotice(null);

    if (billDateFrom && billDateTo && billDateFrom > billDateTo) {
      setNotice({
        variant: 'error',
        title: 'Invalid Bill Date Range',
        message: 'Bill Date From cannot be later than Bill Date To. Please adjust the dates to continue.',
      });
      return;
    }
    if (startDateFrom && endDateTo && startDateFrom > endDateTo) {
      setNotice({
        variant: 'error',
        title: 'Invalid Period Date Range',
        message: 'Start Date From cannot be later than End Date To. Please adjust the dates to continue.',
      });
      return;
    }

    try {
      const resp = await triggerFetchMeterRecords(
        {
          propertyId: activeProperty || undefined,
          billDateFrom: billDateFrom || undefined,
          billDateTo: billDateTo || undefined,
          startDateFrom: startDateFrom || undefined,
          endDateTo: endDateTo || undefined,
          floor: floor || undefined,
          unitNumber: unitNumber || undefined,
          tenantCode: tenantCode || undefined,
          meterType: meterType || undefined,
          category: category || undefined,
          meterNo: meterNo.trim() || undefined,
          sortBy,
          sortOrder,
        },
        false,
      ).unwrap();

      const records = resp.data || [];
      if (records.length === 0) {
        setNotice({
          variant: 'empty',
          title: 'No Meter Records Found',
          message: 'No meter records match your current filter criteria. Try widening the date range or resetting your filters.',
        });
        return;
      }

      const ok = openMeterRecordReportPreview(records, reportType, {
        showPropertyColumn: !activeProperty,
        billDateFrom: billDateFrom || undefined,
        billDateTo: billDateTo || undefined,
        startDateFrom: startDateFrom || undefined,
        endDateTo: endDateTo || undefined,
        floor: floor || undefined,
        unitNumber: unitNumber || undefined,
        tenantLabel: selectedTenantLabel,
        meterType: meterType || undefined,
        category: category || undefined,
        meterNo: meterNo.trim() || undefined,
        sortBy,
        sortOrder,
      });

      if (!ok) {
        toast.error('Please allow pop-ups to view the printable report');
      }
    } catch {
      toast.error('Failed to load meter record report data');
    }
  };

  return (
    <div className="rp-clean-card">
      <div className="rp-grid-3">
        {/* Row 1: Report Type | Meter Type | Category */}
        <div className="rb-field">
          <label>
            Report Type <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as MeterRecordReportType)}
          >
            <option value="detail">Meter Record Detail Report</option>
            <option value="summary">Meter Record Summary Report</option>
          </select>
        </div>

        <div className="rb-field">
          <label>Meter Type</label>
          <select
            value={meterType}
            onChange={(e) => setMeterType(e.target.value)}
          >
            <option value="">All Meter Types</option>
            {meterTypeOptions.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>
        </div>

        <div className="rb-field">
          <label>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Bill Date From | Bill Date To | Meter No */}
        <div className="rb-field">
          <label>Bill Date From</label>
          <input
            type="date"
            value={billDateFrom}
            max={billDateTo || undefined}
            onChange={(e) => setBillDateFrom(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Bill Date To</label>
          <input
            type="date"
            value={billDateTo}
            min={billDateFrom || undefined}
            onChange={(e) => setBillDateTo(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Meter No</label>
          <input
            type="text"
            placeholder="Search meter no…"
            value={meterNo}
            onChange={(e) => setMeterNo(e.target.value)}
          />
        </div>

        {/* Row 3: Start Date From | End Date To | Tenant */}
        <div className="rb-field">
          <label>Start Date From</label>
          <input
            type="date"
            value={startDateFrom}
            max={endDateTo || undefined}
            onChange={(e) => setStartDateFrom(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>End Date To</label>
          <input
            type="date"
            value={endDateTo}
            min={startDateFrom || undefined}
            onChange={(e) => setEndDateTo(e.target.value)}
          />
        </div>

        <div className="rb-field">
          <label>Tenant</label>
          <ComboBox
            id="meter-record-tenant"
            value={tenantCode}
            onChange={setTenantCode}
            options={tenantComboOptions}
            selectedLabel={selectedTenantLabel}
            placeholder="All Tenants"
          />
        </div>

        {/* Row 4: Floor | Unit No | Sort By + Order */}
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
          <label>Unit No</label>
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
              <option value="billDate">Bill Date</option>
              <option value="unitNumber">Unit No</option>
              <option value="floor">Floor</option>
              <option value="tenant">Tenant</option>
              <option value="meterNo">Meter No</option>
              <option value="meterType">Meter Type</option>
              <option value="category">Category</option>
              <option value="totalUnit">Total Unit</option>
              <option value="amount">Amount</option>
              <option value="startDate">Start Date</option>
              <option value="endDate">End Date</option>
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

      <ReportNoticeModal
        notice={notice}
        onClose={() => setNotice(null)}
        onReset={handleResetFilters}
      />
    </div>
  );
}



