import { Fragment, useMemo, useState } from 'react';
import { FileSearch, FileText, Printer, Search, X } from 'lucide-react';
import {
  useGetCostCentersQuery,
  useGetDepartmentCentersQuery,
  useGetFiscalPeriodsQuery,
  useGetGlAccountsQuery,
  useLazyGetDetailedTrialBalanceQuery,
  type DetailedTrialParams,
} from '../../../store/api/glApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { useAppSelector } from '../../../store';
import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { GlExportExcelButton } from './GlExportExcelButton';
import './GLPage.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type ReportTemplateId = 'by_period' | 'with_entry_desc' | 'gl_summary' | 'by_account_code';

const REPORT_TEMPLATES: Array<{ id: ReportTemplateId; number: number; label: string }> = [
  { id: 'by_period', number: 1, label: 'By Period' },
  { id: 'with_entry_desc', number: 2, label: 'With Entry Description' },
  { id: 'gl_summary', number: 3, label: 'GL Summary' },
  { id: 'by_account_code', number: 4, label: 'By Account Code' },
];

function formatNum(val: number): string {
  return Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatParenNum(val: number): string {
  if (Math.abs(val) < 0.005) return '0.00';
  const formatted = formatNum(val);
  return val < 0 ? `(${formatted})` : formatted;
}

function formatDmy(isoOrDate: string): string {
  if (!isoOrDate) return '';
  const datePart = isoOrDate.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoOrDate;
}

function formatPrintedTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${day}/${month}/${year} ${pad(hours)}:${mins}:${secs} ${ampm}`;
}

function mapEntryMode(entryType: string): string {
  const map: Record<string, string> = {
    ar_invoice: 'SI',
    ar_receipt: 'CBR',
    ap_invoice: 'PI',
    ap_payment: 'CBP',
    manual: 'JV',
    adjustment: 'ADJ',
    depreciation: 'DEP',
    bank_recon: 'BR',
  };
  return map[entryType] || (entryType || 'JV').toUpperCase().slice(0, 4);
}

export default function DetailedTrialBalancePage() {
  const selectedPropertyId = useSelectedPropertyId();
  const user = useAppSelector(s => s.auth.user);
  const now = new Date();
  const currentYear = now.getFullYear();

  // Filter state
  const [mode, setMode] = useState<'period' | 'date'>('period');
  const [fiscalYear, setFiscalYear] = useState<number>(currentYear);
  const [periodFrom, setPeriodFrom] = useState<string>('OPENING');
  const [periodTo, setPeriodTo] = useState<string>(String(now.getMonth() + 1));
  const [fromDate, setFromDate] = useState<string>(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState<string>(now.toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>('');
  const [includeZero, setIncludeZero] = useState<boolean>(false);
  const [allAccounts, setAllAccounts] = useState<boolean>(true);
  const [accountFrom, setAccountFrom] = useState<string>('');
  const [accountTo, setAccountTo] = useState<string>('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [departmentCenterId, setDepartmentCenterId] = useState<string>('');

  // Popup & Report Viewer state
  const [showTemplatePopup, setShowTemplatePopup] = useState<boolean>(false);
  const [activeTemplate, setActiveTemplate] = useState<ReportTemplateId | null>(null);
  const [printedAtText, setPrintedAtText] = useState<string>('');

  // Account lookup modal state
  const [lookupTarget, setLookupTarget] = useState<'from' | 'to' | null>(null);
  const [lookupSearch, setLookupSearch] = useState<string>('');

  // Reference data queries
  const { data: fiscalPeriods = [] } = useGetFiscalPeriodsQuery();
  const { data: accounts = [] } = useGetGlAccountsQuery({
    propertyId: selectedPropertyId || undefined,
  });
  const { data: costCenters = [] } = useGetCostCentersQuery({
    propertyId: selectedPropertyId || undefined,
    isActive: true,
  });
  const { data: departmentCenters = [] } = useGetDepartmentCentersQuery({
    propertyId: selectedPropertyId || undefined,
    isActive: true,
  });

  // Available fiscal years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentYear, currentYear - 1]);
    for (const fp of fiscalPeriods) {
      if (fp.fiscalYear) yearsSet.add(fp.fiscalYear);
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [fiscalPeriods, currentYear]);

  // Period options for the selected fiscal year
  const periodOptions = useMemo(() => {
    const yearPeriods = fiscalPeriods
      .filter(fp => fp.fiscalYear === fiscalYear)
      .sort((a, b) => a.periodNumber - b.periodNumber);

    const opts: Array<{ value: string; label: string; endDate: string }> = [
      { value: 'OPENING', label: 'Opening', endDate: `01/01/${fiscalYear}` },
    ];

    if (yearPeriods.length > 0) {
      for (const fp of yearPeriods) {
        opts.push({
          value: String(fp.periodNumber),
          label: `${String(fp.periodNumber).padStart(2, '0')} - ${fp.name}`,
          endDate: formatDmy(fp.endDate),
        });
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        const lastDay = new Date(Date.UTC(fiscalYear, m, 0)).getUTCDate();
        opts.push({
          value: String(m),
          label: `${String(m).padStart(2, '0')} - ${MONTH_NAMES[m - 1]} ${fiscalYear}`,
          endDate: `${String(lastDay).padStart(2, '0')}/${String(m).padStart(2, '0')}/${fiscalYear}`,
        });
      }
    }
    return opts;
  }, [fiscalPeriods, fiscalYear]);

  // Category options derived from standard account types + distinct account subtypes
  const categoryOptions = useMemo(() => {
    const subtypes = new Set<string>();
    for (const acc of accounts) {
      if (acc.accountSubtype && acc.accountSubtype.trim()) {
        subtypes.add(acc.accountSubtype.trim());
      }
    }
    return {
      types: [
        { value: 'asset', label: 'Asset' },
        { value: 'liability', label: 'Liability' },
        { value: 'equity', label: 'Equity' },
        { value: 'income', label: 'Income' },
        { value: 'expense', label: 'Expense' },
      ],
      subtypes: Array.from(subtypes).sort(),
    };
  }, [accounts]);

  // Resolved period label shown under Period From - Period To (e.g., "Opening - 31/10/2026")
  const resolvedPeriodText = useMemo(() => {
    if (mode === 'date') {
      return `${formatDmy(fromDate)}  -  ${formatDmy(toDate)}`;
    }
    const fromOpt = periodOptions.find(o => o.value === periodFrom);
    const toOpt = periodOptions.find(o => o.value === periodTo);
    const leftText = periodFrom === 'OPENING' ? 'Opening' : fromOpt?.endDate || 'Opening';
    const rightText = periodTo === 'OPENING' ? 'Opening' : toOpt?.endDate || 'Opening';
    return `${leftText}   -   ${rightText}`;
  }, [mode, fromDate, toDate, periodFrom, periodTo, periodOptions]);

  const buildFilterParams = (): DetailedTrialParams => ({
    mode,
    fiscalYear,
    periodFrom,
    periodTo,
    fromDate,
    toDate,
    category: category || undefined,
    includeZero,
    allAccounts,
    accountFrom: !allAccounts && accountFrom ? accountFrom : undefined,
    accountTo: !allAccounts && accountTo ? accountTo : undefined,
    costCenterId: costCenterId || undefined,
    departmentCenterId: departmentCenterId || undefined,
    propertyId: selectedPropertyId || undefined,
  });

  const [triggerDetailedTrial, { data: report, isLoading, isFetching }] =
    useLazyGetDetailedTrialBalanceQuery();

  const handleOpenTemplate = (templateId: ReportTemplateId) => {
    setShowTemplatePopup(false);
    setActiveTemplate(templateId);
    setPrintedAtText(formatPrintedTimestamp(new Date()));
    triggerDetailedTrial(buildFilterParams());
  };

  const applyDatePreset = (preset: 'thisMonth' | 'thisQuarter' | 'thisYear' | 'lastYear') => {
    const y = now.getFullYear();
    const m = now.getMonth();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'thisMonth') {
      setFromDate(fmt(new Date(Date.UTC(y, m, 1))));
      setToDate(fmt(new Date(Date.UTC(y, m + 1, 0))));
    } else if (preset === 'thisQuarter') {
      const qStart = Math.floor(m / 3) * 3;
      setFromDate(fmt(new Date(Date.UTC(y, qStart, 1))));
      setToDate(fmt(new Date(Date.UTC(y, qStart + 3, 0))));
    } else if (preset === 'thisYear') {
      setFromDate(`${y}-01-01`);
      setToDate(`${y}-12-31`);
    } else if (preset === 'lastYear') {
      setFromDate(`${y - 1}-01-01`);
      setToDate(`${y - 1}-12-31`);
    }
  };

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams();
    const p = buildFilterParams();
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== '') {
        qs.set(k, String(v));
      }
    });
    qs.set('format', 'xlsx');
    return `/api/v1/gl/detailed-trial-balance?${qs.toString()}`;
  }, [
    mode, fiscalYear, periodFrom, periodTo, fromDate, toDate,
    category, includeZero, allAccounts, accountFrom, accountTo,
    costCenterId, departmentCenterId, selectedPropertyId,
  ]);

  const filteredLookupAccounts = useMemo(() => {
    const q = lookupSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.accountType || '').toLowerCase().includes(q),
    );
  }, [accounts, lookupSearch]);

  const selectedCcCode = useMemo(() => {
    if (!costCenterId) return 'ALL';
    return costCenters.find(c => c.id === costCenterId)?.code || 'ALL';
  }, [costCenterId, costCenters]);

  const selectedDeptCode = useMemo(() => {
    if (!departmentCenterId) return 'ALL';
    return departmentCenters.find(d => d.id === departmentCenterId)?.code || 'ALL';
  }, [departmentCenterId, departmentCenters]);

  const reportDateLabel = useMemo(() => {
    if (mode === 'date') {
      return `${formatDmy(fromDate)} to ${formatDmy(toDate)}`;
    }
    const fromOpt = periodOptions.find(o => o.value === periodFrom);
    const toOpt = periodOptions.find(o => o.value === periodTo);
    const leftText = periodFrom === 'OPENING' ? 'Opening' : fromOpt?.endDate || 'Opening';
    const rightText = periodTo === 'OPENING' ? 'Opening' : toOpt?.endDate || 'Opening';
    return `${leftText} to ${rightText}`;
  }, [mode, fromDate, toDate, periodFrom, periodTo, periodOptions]);

  const activeTemplateObj = REPORT_TEMPLATES.find(t => t.id === activeTemplate);
  const companyHeaderTitle = (user as any)?.companyName || 'NirvaSoft PMS';

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <FileText size={22} />
          </div>
          <div>
            <h1>Detailed Trial</h1>
            <p>Detailed Trial Balance report criteria</p>
          </div>
        </div>
      </div>

      {/* Top Action Bar — Preview Button */}
      <div className="dt-action-bar">
        <button
          type="button"
          className="dt-preview-btn"
          onClick={() => setShowTemplatePopup(true)}
        >
          <FileText size={16} />
          Preview
        </button>
      </div>

      {/* Criteria 1 Tab Header */}
      <div className="dt-tabs-header">
        <div className="dt-tab-item">Criteria 1</div>
      </div>

      {/* Section 1: Report Options */}
      <div className="dt-section-box">
        <div className="dt-section-title">Report Options</div>
        <div className="dt-radio-group">
          <label className="dt-radio-label">
            <input
              type="radio"
              name="dtReportMode"
              checked={mode === 'period'}
              onChange={() => setMode('period')}
            />
            By Period
          </label>
          <label className="dt-radio-label">
            <input
              type="radio"
              name="dtReportMode"
              checked={mode === 'date'}
              onChange={() => setMode('date')}
            />
            By Date Range
          </label>
        </div>
      </div>

      {/* Section 2: Filter By */}
      <div className="dt-section-box">
        <div className="dt-section-title">Filter By</div>
        <div className="dt-filter-grid">
          {mode === 'period' ? (
            <>
              <div className="dt-filter-row">
                <span className="dt-filter-label">Acc. Year</span>
                <div className="dt-range-inline">
                  <select
                    className="dt-select"
                    value={fiscalYear}
                    onChange={e => setFiscalYear(Number(e.target.value))}
                  >
                    {availableYears.map((yr, idx) => (
                      <option key={yr} value={yr}>
                        {String(idx + 1).padStart(2, '0')} [ {yr} - {yr + 1} ]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dt-filter-row">
                <span className="dt-filter-label">Period From</span>
                <div className="dt-range-inline">
                  <select
                    className="dt-select"
                    value={periodFrom}
                    onChange={e => setPeriodFrom(e.target.value)}
                  >
                    {periodOptions.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="dt-range-sep">-</span>
                  <select
                    className="dt-select"
                    value={periodTo}
                    onChange={e => setPeriodTo(e.target.value)}
                  >
                    {periodOptions.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dt-filter-row">
                <span />
                <div className="dt-period-preview-text">{resolvedPeriodText}</div>
              </div>
            </>
          ) : (
            <>
              <div className="dt-filter-row">
                <span className="dt-filter-label">Date Range</span>
                <div className="dt-range-inline">
                  <input
                    type="date"
                    className="dt-input"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                  />
                  <span className="dt-range-sep">-</span>
                  <input
                    type="date"
                    className="dt-input"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                  />
                  <div className="dt-preset-pills">
                    <button type="button" className="dt-preset-pill" onClick={() => applyDatePreset('thisMonth')}>
                      This Month
                    </button>
                    <button type="button" className="dt-preset-pill" onClick={() => applyDatePreset('thisQuarter')}>
                      This Quarter
                    </button>
                    <button type="button" className="dt-preset-pill" onClick={() => applyDatePreset('thisYear')}>
                      This Year
                    </button>
                    <button type="button" className="dt-preset-pill" onClick={() => applyDatePreset('lastYear')}>
                      Last Year
                    </button>
                  </div>
                </div>
              </div>

              <div className="dt-filter-row">
                <span />
                <div className="dt-period-preview-text">{resolvedPeriodText}</div>
              </div>
            </>
          )}

          {/* Category + Include Zero Amount */}
          <div className="dt-filter-row">
            <span className="dt-filter-label">Category</span>
            <div className="dt-range-inline">
              <select
                className="dt-select"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">All</option>
                <optgroup label="Account Types">
                  {categoryOptions.types.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                {categoryOptions.subtypes.length > 0 && (
                  <optgroup label="Subtypes">
                    {categoryOptions.subtypes.map(st => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <label className="dt-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeZero}
                  onChange={e => setIncludeZero(e.target.checked)}
                />
                Include Zero Amount
              </label>
            </div>
          </div>

          {/* Account Code + All Account */}
          <div className="dt-filter-row">
            <span className="dt-filter-label">Account Code</span>
            <div className="dt-range-inline">
              <div className="dt-lookup-field">
                <input
                  type="text"
                  placeholder="From Account Code"
                  value={accountFrom}
                  disabled={allAccounts}
                  onChange={e => setAccountFrom(e.target.value)}
                />
                <button
                  type="button"
                  className="dt-lookup-btn"
                  disabled={allAccounts}
                  title="Search Account"
                  onClick={() => {
                    setLookupSearch('');
                    setLookupTarget('from');
                  }}
                >
                  <Search size={15} />
                </button>
              </div>

              <span className="dt-range-sep">-</span>

              <div className="dt-lookup-field">
                <input
                  type="text"
                  placeholder="To Account Code"
                  value={accountTo}
                  disabled={allAccounts}
                  onChange={e => setAccountTo(e.target.value)}
                />
                <button
                  type="button"
                  className="dt-lookup-btn"
                  disabled={allAccounts}
                  title="Search Account"
                  onClick={() => {
                    setLookupSearch('');
                    setLookupTarget('to');
                  }}
                >
                  <Search size={15} />
                </button>
              </div>

              <label className="dt-checkbox-label">
                <input
                  type="checkbox"
                  checked={allAccounts}
                  onChange={e => {
                    const checked = e.target.checked;
                    setAllAccounts(checked);
                    if (checked) {
                      setAccountFrom('');
                      setAccountTo('');
                    }
                  }}
                />
                All Account
              </label>
            </div>
          </div>

          {/* Cost Centre & Department */}
          <div className="dt-filter-row">
            <span className="dt-filter-label">Cost Centre</span>
            <div className="dt-range-inline">
              <select
                className="dt-select"
                value={costCenterId}
                onChange={e => setCostCenterId(e.target.value)}
              >
                <option value="">All</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.name}
                  </option>
                ))}
              </select>

              <span className="dt-filter-label" style={{ marginLeft: 12 }}>
                Department
              </span>
              <select
                className="dt-select"
                value={departmentCenterId}
                onChange={e => setDepartmentCenterId(e.target.value)}
              >
                <option value="">All</option>
                {departmentCenters.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.code} — {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Template Selection Popup (Photo 1) */}
      {showTemplatePopup && (
        <div
          className="dt-template-popup-overlay"
          onClick={() => setShowTemplatePopup(false)}
        >
          <div
            className="dt-template-popup"
            onClick={e => e.stopPropagation()}
          >
            <div className="dt-template-popup-header">
              <h3>Detailed Trial</h3>
              <button
                type="button"
                className="dt-template-close-circle"
                onClick={() => setShowTemplatePopup(false)}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            <ul className="dt-template-list">
              {REPORT_TEMPLATES.map(tpl => (
                <li
                  key={tpl.id}
                  className="dt-template-item"
                  onClick={() => handleOpenTemplate(tpl.id)}
                >
                  <span className="dt-template-item-label">
                    <span>{tpl.number}.</span>
                    <span>{tpl.label}</span>
                  </span>
                  <span className="dt-template-item-icon">
                    <FileSearch size={18} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Full-Screen White-Paper Report Viewer (Photo 2) */}
      {activeTemplate && (
        <div className="dt-report-viewer-overlay">
          <div className="dt-report-viewer-toolbar">
            <div className="dt-report-viewer-title">
              <FileText size={18} />
              <span>
                Detailed Trial — {activeTemplateObj?.number}. {activeTemplateObj?.label}
              </span>
            </div>

            <div className="dt-report-viewer-actions">
              <button
                type="button"
                className="dt-viewer-btn"
                onClick={() => {
                  setActiveTemplate(null);
                  setShowTemplatePopup(true);
                }}
              >
                Templates
              </button>
              <button
                type="button"
                className="dt-viewer-btn"
                onClick={() => window.print()}
              >
                <Printer size={15} />
                Print
              </button>
              <GlExportExcelButton
                url={exportUrl}
                filename={`detailed-trial-balance-${report?.effectiveToDate || toDate}.xlsx`}
                errorMessage="Failed to export Detailed Trial Balance"
              />
              <button
                type="button"
                className="dt-viewer-btn"
                onClick={() => setActiveTemplate(null)}
              >
                <X size={15} />
                Close
              </button>
            </div>
          </div>

          <div className="dt-report-viewer-body">
            {isLoading || isFetching ? (
              <div style={{ maxWidth: 1400, margin: '0 auto' }}>
                <TableSkeleton columns={10} rows={10} />
              </div>
            ) : (
              report && (
                <div className="dt-report-paper">
                  <div className="dt-paper-printed">Printed : {printedAtText}</div>
                  <h2 className="dt-paper-company">{companyHeaderTitle}</h2>
                  <div className="dt-paper-subtitle">
                    Detailed Trial{activeTemplate !== 'by_period' ? ` (${activeTemplateObj?.label})` : ''}
                  </div>

                  <div className="dt-paper-meta-row">
                    <span>Date : {reportDateLabel}</span>
                    <span>CC. Code : {selectedCcCode}</span>
                    <span>Dept. Code : {selectedDeptCode}</span>
                  </div>
                  <div className="dt-paper-currency-note">All Amount in MMK</div>

                  {activeTemplate === 'gl_summary' ? (
                    <table className="dt-paper-table">
                      <thead>
                        <tr>
                          <th>Acc. Code</th>
                          <th>Acc. Description</th>
                          <th>Department</th>
                          <th>CC</th>
                          <th>Curr.</th>
                          <th className="num">Opening</th>
                          <th className="num">Debit</th>
                          <th className="num">Credit</th>
                          <th className="num">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.accounts.map(acc => {
                          const totalDebit = Number(acc.openingDebit || 0) + Number(acc.periodDebit || 0);
                          const totalCredit = Number(acc.openingCredit || 0) + Number(acc.periodCredit || 0);
                          const netBal = totalDebit - totalCredit;
                          return (
                            <tr key={acc.accountId}>
                              <td>{acc.code}</td>
                              <td>{acc.name}</td>
                              <td>{acc.department?.code || '-'}</td>
                              <td>{acc.costCenter?.code || '-'}</td>
                              <td>MMK</td>
                              <td className="num">{formatParenNum(acc.openingDebit - acc.openingCredit)}</td>
                              <td className="num">{formatNum(acc.periodDebit)}</td>
                              <td className="num">{formatNum(acc.periodCredit)}</td>
                              <td className="num">{formatParenNum(netBal)}</td>
                            </tr>
                          );
                        })}
                        {report.accounts.length === 0 && (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                              No records found for the selected criteria.
                            </td>
                          </tr>
                        )}
                        {report.accounts.length > 0 && (
                          <tr className="dt-paper-grandtotal-row">
                            <td colSpan={6} style={{ textAlign: 'right' }}>
                              Grand Total
                            </td>
                            <td className="num">{formatNum(report.summary.totalDebit)}</td>
                            <td className="num">{formatNum(report.summary.totalCredit)}</td>
                            <td className="num">
                              {formatParenNum(report.summary.totalDebit - report.summary.totalCredit)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="dt-paper-table">
                      <thead>
                        <tr>
                          <th>Acc. Code</th>
                          <th>Acc. Description</th>
                          <th>Ref.#</th>
                          <th>Mode</th>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Department</th>
                          <th>CC</th>
                          <th>Curr.</th>
                          <th className="num">Rate</th>
                          <th className="num">Amount</th>
                          <th className="num">Debit</th>
                          <th className="num">Credit</th>
                          <th className="num">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.accounts.map(acc => {
                          const hasOpening =
                            Math.abs(acc.openingDebit) >= 0.005 ||
                            Math.abs(acc.openingCredit) >= 0.005;
                          const openSigned = Number(acc.openingDebit || 0) - Number(acc.openingCredit || 0);
                          const accTotalDebit = Number(acc.openingDebit || 0) + Number(acc.periodDebit || 0);
                          const accTotalCredit = Number(acc.openingCredit || 0) + Number(acc.periodCredit || 0);
                          const accNetBalance = accTotalDebit - accTotalCredit;

                          return (
                            <Fragment key={acc.accountId}>
                              {/* Opening Balance Row if non-zero */}
                              {hasOpening && (
                                <tr>
                                  <td>{acc.code}</td>
                                  <td>{acc.name}</td>
                                  <td>OPENING</td>
                                  <td>OB</td>
                                  <td>{formatDmy(report.effectiveFromDate)}</td>
                                  <td>Opening Balance</td>
                                  <td>{acc.department?.code || '-'}</td>
                                  <td>{acc.costCenter?.code || '-'}</td>
                                  <td>MMK</td>
                                  <td className="num">1.00</td>
                                  <td className="num">{formatParenNum(openSigned)}</td>
                                  <td className="num">{formatNum(acc.openingDebit)}</td>
                                  <td className="num">{formatNum(acc.openingCredit)}</td>
                                  <td className="num" />
                                </tr>
                              )}

                              {/* Zero-activity line when Include Zero Amount is checked */}
                              {!hasOpening && acc.transactions.length === 0 && (
                                <tr>
                                  <td>{acc.code}</td>
                                  <td>{acc.name}</td>
                                  <td>-</td>
                                  <td>-</td>
                                  <td>-</td>
                                  <td>{acc.name}</td>
                                  <td>{acc.department?.code || '-'}</td>
                                  <td>{acc.costCenter?.code || '-'}</td>
                                  <td>MMK</td>
                                  <td className="num">1.00</td>
                                  <td className="num">0.00</td>
                                  <td className="num">0.00</td>
                                  <td className="num">0.00</td>
                                  <td className="num" />
                                </tr>
                              )}

                              {/* Transaction Lines */}
                              {acc.transactions.map(tx => {
                                const signedAmount = Number(tx.debit || 0) - Number(tx.credit || 0);
                                return (
                                  <tr key={tx.id}>
                                    <td>{acc.code}</td>
                                    <td>{acc.name}</td>
                                    <td>{tx.journalNumber}</td>
                                    <td>{mapEntryMode(tx.entryType)}</td>
                                    <td>{formatDmy(tx.entryDate)}</td>
                                    <td>{tx.description || acc.name}</td>
                                    <td>{tx.department?.code || '-'}</td>
                                    <td>{tx.costCenter?.code || '-'}</td>
                                    <td>MMK</td>
                                    <td className="num">1.00</td>
                                    <td className="num">{formatParenNum(signedAmount)}</td>
                                    <td className="num">{formatNum(tx.debit)}</td>
                                    <td className="num">{formatNum(tx.credit)}</td>
                                    <td className="num" />
                                  </tr>
                                );
                              })}

                              {/* Sub Total (Acc. Code) */}
                              <tr className="dt-paper-subtotal-row">
                                <td colSpan={8} />
                                <td colSpan={3} className="subtotal-line">
                                  Sub Total ({acc.code})
                                </td>
                                <td className="num subtotal-line">{formatNum(accTotalDebit)}</td>
                                <td className="num subtotal-line">{formatNum(accTotalCredit)}</td>
                                <td className="num subtotal-line">{formatParenNum(accNetBalance)}</td>
                              </tr>

                              {/* Total (Acc. Code) */}
                              <tr className="dt-paper-total-row">
                                <td colSpan={8} />
                                <td colSpan={3}>Total ({acc.code})</td>
                                <td className="num">{formatNum(accTotalDebit)}</td>
                                <td className="num">{formatNum(accTotalCredit)}</td>
                                <td className="num">{formatParenNum(accNetBalance)}</td>
                              </tr>
                            </Fragment>
                          );
                        })}

                        {report.accounts.length === 0 && (
                          <tr>
                            <td colSpan={14} style={{ textAlign: 'center', padding: 32 }}>
                              No records found for the selected criteria.
                            </td>
                          </tr>
                        )}

                        {report.accounts.length > 0 && (
                          <tr className="dt-paper-grandtotal-row">
                            <td colSpan={8} />
                            <td colSpan={3}>Grand Total</td>
                            <td className="num">{formatNum(report.summary.totalDebit)}</td>
                            <td className="num">{formatNum(report.summary.totalCredit)}</td>
                            <td className="num">
                              {formatParenNum(report.summary.totalDebit - report.summary.totalCredit)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Account Code Lookup Modal */}
      {lookupTarget && (
        <div className="gl-modal-overlay" onClick={() => setLookupTarget(null)}>
          <div
            className="gl-modal"
            style={{ maxWidth: 560, width: '92%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>
                Select {lookupTarget === 'from' ? 'From' : 'To'} Account Code
              </h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setLookupTarget(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              className="dt-input"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
              placeholder="Search by code, name, or type..."
              value={lookupSearch}
              onChange={e => setLookupSearch(e.target.value)}
              autoFocus
            />

            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="gl-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account Name</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLookupAccounts.map(acc => (
                    <tr
                      key={acc.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (lookupTarget === 'from') setAccountFrom(acc.code);
                        else setAccountTo(acc.code);
                        setLookupTarget(null);
                      }}
                    >
                      <td style={{ fontWeight: 700 }}>{acc.code}</td>
                      <td>{acc.name}</td>
                      <td>
                        <span className={`gl-type-chip ${acc.accountType}`}>{acc.accountType}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredLookupAccounts.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No matching accounts found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
