import { useState, useEffect, useMemo, useRef } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  useGetBillingSchedulesQuery, usePauseScheduleMutation,
  useResumeScheduleMutation, useCancelScheduleMutation,
  useCreateBillingScheduleMutation, useUpdateScheduleMutation,
  useGetChargeTypesQuery, useGetCurrencyRatesQuery,
} from '../../../store/api/billingApi';
import type { BillingSchedule } from '../../../store/api/billingApi';
import { useGetDepartmentCentersQuery, useGetCostCentersQuery, useGetGlAccountsQuery, type GlAccount } from '../../../store/api/glApi';
import { useGetPropertiesQuery, useGetFloorSetupsQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useGetUnitsQuery } from '../../../store/api/unitsApi';
import { useGetLeasesQuery } from '../../../store/api/leasesApi';
import { CalendarClock, Pause, Play, X, ChevronLeft, ChevronRight, CircleDot, Plus, Pencil, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import { useSelectedPropertyFilter, useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import ComboBox from '../../../components/ComboBox';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import toast from 'react-hot-toast';
import './BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
const formatAmount = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
const formatCompactAmount = (amount: string | number) => {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const BILLING_CYCLES = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const;

interface ScheduleForm {
  chargeTypeId: string; propertyId: string; tenantId: string; unitId: string; leaseId: string;
  departmentCenterId: string; costCenterId: string;
  amount: number; quantity: number; currency: string; billingCycle: string; billingDay: number;
  paymentDueDays: number; startDate: string; endDate: string; description: string;
}

const emptyForm: ScheduleForm = {
  chargeTypeId: '', propertyId: '', tenantId: '', unitId: '', leaseId: '',
  departmentCenterId: '', costCenterId: '',
  amount: 0, quantity: 1, currency: 'USD', billingCycle: 'monthly', billingDay: 1,
  paymentDueDays: 14, startDate: new Date().toISOString().split('T')[0], endDate: '', description: '',
};

export default function BillingSchedulesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const selectedProperty = useSelectedPropertyFilter();
  const defaultPropertyId = useSelectedPropertyId();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<BillingSchedule | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [floorId, setFloorId] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const { data: listCurrencyRatesData } = useGetCurrencyRatesQuery(
    selectedProperty ? { propertyId: selectedProperty } : undefined,
  );
  const listCurrencyRates = listCurrencyRatesData?.data ?? [];
  const listBaseCurrencyCode = listCurrencyRates.find(r => r.isBaseCurrency)?.currency || 'MMK';

  const listCurrencyOptions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of listCurrencyRates) {
      if (!r.currency) continue;
      map.set(r.currency, Boolean(map.get(r.currency) || r.isBaseCurrency));
    }
    if (map.size === 0) {
      map.set(listBaseCurrencyCode, true);
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0]))
      .map(([code, isBase]) => ({ code, isBase }));
  }, [listCurrencyRates, listBaseCurrencyCode]);

  useEffect(() => {
    setCurrencyFilter(listBaseCurrencyCode);
  }, [selectedProperty, listBaseCurrencyCode]);

  const activeListCurrency = currencyFilter === 'ALL' ? undefined : (currencyFilter || listBaseCurrencyCode);

  const hasActiveFilters = Boolean(
    statusFilter !== 'active' ||
    cycleFilter ||
    (currencyFilter && currencyFilter !== listBaseCurrencyCode)
  );

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset pagination whenever Active Property, filters, or search changes.
  useEffect(() => { setPage(1); }, [selectedProperty, statusFilter, currencyFilter, cycleFilter, debouncedSearch]);

  const { data, isFetching } = useGetBillingSchedulesQuery({
    ...(statusFilter ? { status: statusFilter } : {}),
    propertyId: selectedProperty || undefined,
    currency: activeListCurrency,
    billingCycle: cycleFilter || undefined,
    search: debouncedSearch || undefined,
    page,
    limit: pageSize,
  });
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: glAccounts = [] } = useGetGlAccountsQuery({});
  const { data: departmentCentersData = [] } = useGetDepartmentCentersQuery({ isActive: true });
  const { data: costCentersData = [] } = useGetCostCentersQuery({ isActive: true });
  // /properties requires properties.read, which a billing-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const { data: floorsData } = useGetFloorSetupsQuery(form.propertyId ? { propertyId: form.propertyId } : skipToken);
  const floorNumber = floorsData?.data.find(f => f.id === floorId)?.floorNumber;
  const { data: unitsData } = useGetUnitsQuery(
    form.propertyId ? { propertyId: form.propertyId, floor: floorNumber, limit: 5000 } : skipToken,
  );
  // Tenant choices come from the property's active leases, so a schedule is always tied to the lease it bills.
  const { data: leasesData } = useGetLeasesQuery(
    form.propertyId ? { propertyId: form.propertyId, status: 'active', limit: 5000 } : skipToken,
  );

  const [pauseSchedule] = usePauseScheduleMutation();
  const [resumeSchedule] = useResumeScheduleMutation();
  const [cancelSchedule] = useCancelScheduleMutation();
  const [createSchedule, { isLoading: creating }] = useCreateBillingScheduleMutation();
  const [updateSchedule, { isLoading: updating }] = useUpdateScheduleMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const schedules = data?.data || [];
  const meta = data?.meta;
  const chargeTypes = chargeTypesData?.data || [];
  const properties = propertiesData?.data || [];
  const departmentCenters = Array.isArray(departmentCentersData) ? departmentCentersData : (departmentCentersData as any)?.data || [];
  const costCenters = Array.isArray(costCentersData) ? costCentersData : (costCentersData as any)?.data || [];
  const scopeProperties = scopeData?.data || [];
  const floors = (floorsData?.data || []).slice().sort((a, b) => a.floorNumber - b.floorNumber);
  const units = unitsData?.data || [];
  const leases = leasesData?.data || [];

  const glAccountByCode = useMemo(() => {
    const map = new Map<string, GlAccount>();
    glAccounts.forEach((a) => map.set(a.code, a));
    return map;
  }, [glAccounts]);

  const filteredChargeTypes = useMemo(() => {
    if (!form.departmentCenterId && !form.costCenterId) return [];
    return chargeTypes.filter((ct) => {
      if (!ct.isActive) return false;
      const acc = ct.glAccountCode ? glAccountByCode.get(ct.glAccountCode) : undefined;
      const ctDeptId =
        ct.departmentCenterId ||
        ct.departmentCenter?.id ||
        acc?.departmentCenterId ||
        acc?.departmentCenter?.id ||
        '';
      const ctCcId =
        ct.costCenterId ||
        ct.costCenter?.id ||
        acc?.costCenterId ||
        acc?.costCenter?.id ||
        '';
      if (form.departmentCenterId && ctDeptId !== form.departmentCenterId) return false;
      if (form.costCenterId && ctCcId !== form.costCenterId) return false;
      return true;
    });
  }, [chargeTypes, glAccountByCode, form.departmentCenterId, form.costCenterId]);

  useEffect(() => {
    if (!showForm || !form.chargeTypeId) return;
    const validIds = new Set(filteredChargeTypes.map((ct) => ct.id));
    if (!validIds.has(form.chargeTypeId)) {
      setForm((f) => ({ ...f, chargeTypeId: '' }));
    }
  }, [filteredChargeTypes, showForm, form.chargeTypeId]);

  const effectiveCreatePropertyId = selectedProperty || defaultPropertyId || properties[0]?.id || scopeProperties[0]?.id || '';

  // Currency is bound to the selected Unit's own Currency Code (falling back to the
  // property's currency when no unit is picked, or for units created before that field
  // existed) — not something a schedule sets independently, so it's not user-editable here.
  const propertyCurrency = properties.find((p: any) => p.id === form.propertyId)?.currency
    || scopeProperties.find((p) => p.id === form.propertyId)?.currency;
  const boundCurrency = units.find((u) => u.id === form.unitId)?.currency || propertyCurrency || '';
  useEffect(() => {
    // Only auto-bind for new schedules — editing an existing one keeps its saved
    // currency untouched even though changing property/unit re-runs this effect.
    if (!editId && boundCurrency && form.currency !== boundCurrency) {
      setForm((f) => ({ ...f, currency: boundCurrency }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundCurrency, editId]);

  // Currency dropdown lists Codes from Currency Setup; Base Amount is read-only —
  // it's Amount multiplied (or divided, per the row's own operator) by the Rate from
  // the Currency Setup row matching the schedule's currency. Currency Setup rates (and
  // which one is the Base Currency) are configured per property, so this must be scoped
  // to the schedule's own property — otherwise another property's base currency could
  // leak in when the company has more than one.
  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    form.propertyId ? { propertyId: form.propertyId } : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const currencyCodes = [...new Set(currencyRates.map((r) => r.currency))].sort();
  const baseCurrencyCode = currencyRates.find((r) => r.isBaseCurrency)?.currency ?? '';
  const selectedCurrencyRate = currencyRates.find((r) => r.currency === form.currency);
  const baseAmount = selectedCurrencyRate
    ? (selectedCurrencyRate.operator === 'divide'
        ? form.amount / Number(selectedCurrencyRate.rate)
        : form.amount * Number(selectedCurrencyRate.rate))
    : null;

  useEffect(() => {
    if (showForm && !editId && effectiveCreatePropertyId && form.propertyId !== effectiveCreatePropertyId) {
      setForm((f) => ({ ...f, propertyId: effectiveCreatePropertyId, unitId: '', tenantId: '', leaseId: '' }));
      setFloorId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCreatePropertyId, showForm, editId]);

  // `units` already reflects the current floor filter (all of the property's units when none is
  // picked yet), so cross-referencing against it is how leases stay scoped to Floor as well as Unit.
  const filteredLeases = leases.filter(l =>
    (!form.unitId || l.unit?.id === form.unitId) && (!l.unit || units.some(u => u.id === l.unit!.id)),
  );
  const deriveFloorId = (unitId: string) => {
    const unit = units.find(u => u.id === unitId);
    const fn = unit?.floorNumber ?? (selectedSchedule?.unit?.id === unitId ? selectedSchedule.unit.floorNumber : undefined);
    const fl = (unit as any)?.floorLabel ?? (selectedSchedule?.unit?.id === unitId ? selectedSchedule.unit.floorLabel : undefined);
    const floor = fn != null
      ? floors.find(f => f.floorNumber === fn)
      : fl
        ? floors.find(f => f.floorLabel.toLowerCase() === fl.toLowerCase())
        : undefined;
    return floor?.id || '';
  };

  // Editing a schedule opens with floorId cleared (its floor isn't known yet), so once
  // the property's floors have loaded, auto-bind the Floor field from the
  // schedule's own unit instead of leaving it on "Select floor".
  useEffect(() => {
    if (editId && form.unitId && !floorId && floors.length) {
      const fid = deriveFloorId(form.unitId);
      if (fid) setFloorId(fid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, form.unitId, floors, units, floorId, selectedSchedule]);

  const isBaseRentCharge = (ct?: { code?: string; category?: string; name?: string } | null) => {
    if (!ct) return false;
    const code = (ct.code || '').toUpperCase();
    const cat = (ct.category || '').toLowerCase();
    const name = (ct.name || '').toLowerCase();
    return code === 'RENT' || cat === 'rent' || name === 'rent' || name === 'base rent';
  };

  const quantitySyncedRef = useRef(false);
  useEffect(() => {
    if (!showForm) { quantitySyncedRef.current = false; return; }
    if (!editId || !form.leaseId || quantitySyncedRef.current) return;
    const ct = chargeTypes.find((c) => c.id === form.chargeTypeId) || selectedSchedule?.chargeType;
    if (!isBaseRentCharge(ct)) {
      quantitySyncedRef.current = true;
      setForm((f) => ({ ...f, quantity: 1 }));
      return;
    }
    const lease = leases.find((l) => l.id === form.leaseId);
    if (!lease) return; // not loaded yet (or the lease is no longer active)
    quantitySyncedRef.current = true;
    setForm((f) => ({ ...f, quantity: lease.leaseTermMonths }));
  }, [showForm, editId, form.leaseId, form.chargeTypeId, leases, chargeTypes, selectedSchedule]);

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel' && !(await confirmDialog('Cancel this billing schedule? No future invoices will be generated.', { danger: true, confirmText: 'Cancel Schedule' }))) return;
    try {
      if (action === 'pause') await pauseSchedule(id).unwrap();
      if (action === 'resume') await resumeSchedule(id).unwrap();
      if (action === 'cancel') await cancelSchedule(id).unwrap();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${action} schedule`);
    }
  };

  const openCreate = () => {
    setHasAttemptedSubmit(false);
    setEditId(null);
    setSelectedSchedule(null);
    setForm({ ...emptyForm, propertyId: effectiveCreatePropertyId });
    setFloorId('');
    setShowForm(true);
  };

  const openEdit = (s: BillingSchedule) => {
    setHasAttemptedSubmit(false);
    setEditId(s.id);
    setSelectedSchedule(s);
    setFloorId('');
    const isRent = isBaseRentCharge(s.chargeType);
    const savedQty = Number(s.quantity);
    const effectiveQty = isRent
      ? (savedQty > 1 ? savedQty : (s.lease?.leaseTermMonths || savedQty || 1))
      : 1;
    quantitySyncedRef.current = true;
    setForm({
      chargeTypeId: s.chargeType.id,
      propertyId: s.property.id,
      tenantId: s.tenant.id,
      unitId: s.unit?.id || '',
      leaseId: s.leaseId || '',
      departmentCenterId: s.departmentCenterId || s.departmentCenter?.id || '',
      costCenterId: s.costCenterId || s.costCenter?.id || '',
      amount: Number(s.amount),
      quantity: effectiveQty,
      currency: s.currency,
      billingCycle: s.billingCycle,
      billingDay: s.billingDay,
      paymentDueDays: s.paymentDueDays,
      startDate: s.startDate.split('T')[0],
      endDate: s.endDate ? s.endDate.split('T')[0] : '',
      description: s.description || '',
    });
    setShowForm(true);
  };

  const isChargeTypeMissing = hasAttemptedSubmit && !form.chargeTypeId;
  const isTenantMissing = hasAttemptedSubmit && !form.leaseId;
  const isAmountMissing = hasAttemptedSubmit && (form.amount === undefined || form.amount === null || isNaN(form.amount) || form.amount <= 0 || String(form.amount).trim() === '');
  const isBillingCycleMissing = hasAttemptedSubmit && !form.billingCycle;
  const isBillingDayMissing = hasAttemptedSubmit && (!form.billingDay || form.billingDay < 1 || form.billingDay > 28);
  const isStartDateMissing = hasAttemptedSubmit && !form.startDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (
      !form.chargeTypeId ||
      !form.propertyId ||
      !form.leaseId ||
      form.amount === undefined || form.amount === null || isNaN(form.amount) || form.amount <= 0 || String(form.amount).trim() === '' ||
      !form.billingCycle ||
      !form.billingDay || form.billingDay < 1 || form.billingDay > 28 ||
      !form.startDate
    ) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        chargeTypeId: form.chargeTypeId,
        propertyId: form.propertyId,
        tenantId: form.tenantId,
        amount: form.amount,
        quantity: form.quantity,
        currency: form.currency,
        billingCycle: form.billingCycle,
        billingDay: form.billingDay,
        paymentDueDays: form.paymentDueDays,
        startDate: form.startDate,
        description: form.description || undefined,
      };

      if (editId) {
        // Always send unit/lease/end date/department/cost center on edit (even cleared) so removing any of them actually clears it.
        payload.unitId = form.unitId || null;
        payload.leaseId = form.leaseId || null;
        payload.endDate = form.endDate || null;
        payload.departmentCenterId = form.departmentCenterId || null;
        payload.costCenterId = form.costCenterId || null;
        await updateSchedule({ id: editId, data: payload }).unwrap();
      } else {
        if (form.unitId) payload.unitId = form.unitId;
        if (form.leaseId) payload.leaseId = form.leaseId;
        if (form.endDate) payload.endDate = form.endDate;
        if (form.departmentCenterId) payload.departmentCenterId = form.departmentCenterId;
        if (form.costCenterId) payload.costCenterId = form.costCenterId;
        await createSchedule(payload).unwrap();
      }
      setShowForm(false);
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${editId ? 'update' : 'create'} schedule`);
    }
  };

  const getTenantName = (s: any) => s.tenant.tenantType !== 'individual'
    ? s.tenant.companyName || ''
    : s.tenant.lastName || '';

  return (
    <div className="billing-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <CalendarClock size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Billing Schedules</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {meta ? `${meta.total} total schedules` : 'Recurring charge schedules for leases'}
            </p>
          </div>
          <PermissionGuard permission="billing-schedules.write">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Schedule
            </button>
          </PermissionGuard>
        </div>
        <div className="billing-filters" style={{ marginBottom: 0 }}>
          <div className="billing-filters-left">
            <div className="search-wrap">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search tenant or unit…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch('')} title="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`btn btn-secondary billing-filter-toggle-btn${showFilters || hasActiveFilters ? ' active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={14} /> Filters{hasActiveFilters ? ' •' : ''}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="billing-filter-bar" style={{ marginTop: 12, marginBottom: 0 }}>
          <select
            className="filter-select"
            value={currencyFilter || listBaseCurrencyCode}
            onChange={e => { setCurrencyFilter(e.target.value); setPage(1); }}
            title="Currency"
          >
            {listCurrencyOptions.map(c => (
              <option key={c.code} value={c.code}>
                {c.code}{c.isBase ? ' (Base)' : ''}
              </option>
            ))}
            <option value="ALL">All Currencies</option>
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            title="Status"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>

          <select
            className="filter-select"
            value={cycleFilter}
            onChange={e => { setCycleFilter(e.target.value); setPage(1); }}
            title="Billing Cycle"
          >
            <option value="">All Cycles</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
            <option value="annual">Annual</option>
          </select>

          <button
            type="button"
            className="btn-ghost billing-filter-reset-btn"
            onClick={() => {
              setCurrencyFilter(listBaseCurrencyCode);
              setStatusFilter('active');
              setCycleFilter('');
              setPage(1);
            }}
          >
            <X size={14} /> Reset
          </button>
        </div>
      )}

      <div className="billing-table-wrap" style={{ marginTop: 24 }}>
        <TableScrollWrapper className="schedules-scroll">
          <table className="billing-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Charge</th>
              <th style={{ width: 130 }}>Tenant</th>
              <th style={{ width: 115 }}>Floor / Unit</th>
              <th className="text-center" style={{ width: 65 }}>Qty</th>
              <th className="text-right" style={{ width: 110 }}>Amount</th>
              <th style={{ width: 80 }}>Cycle</th>
              <th style={{ width: 110 }}>Start Date</th>
              <th style={{ width: 120 }}>Next Billing</th>
              <th style={{ width: 100 }}>Status</th>
              <th className="text-center" style={{ width: 70 }}>Invoices</th>
              <th className="text-center" style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="billing-empty">
                    {isFetching ? 'Loading…' : 'No billing schedules found.'}
                  </div>
                </td>
              </tr>
            ) : (
              schedules.map(s => {
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-primary">{s.chargeType.name}</div>
                    </td>
                    <td>
                      <div className="cell-primary">{getTenantName(s)}</div>
                    </td>
                    <td>
                      {s.unit ? (
                        <>
                          {(s.unit.floorLabel || s.unit.floorNumber != null) && (
                            <div className="cell-primary">
                              {s.unit.floorLabel || `Floor ${s.unit.floorNumber}`}
                            </div>
                          )}
                          <div className="cell-secondary">{s.unit.unitNumber}</div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {isBaseRentCharge(s.chargeType)
                          ? (Number(s.quantity) > 1 ? Number(s.quantity) : (s.lease?.leaseTermMonths ?? Number(s.quantity) ?? 1))
                          : 1}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" title={formatAmount(s.amount)}>
                        {formatCompactAmount(s.amount)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                        {s.billingCycle.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {s.startDate ? (
                        <div style={{ fontSize: 13 }}>{format(new Date(`${s.startDate.split('T')[0]}T00:00:00`), 'MMM d, yyyy')}</div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {s.nextBillingDate ? (
                        <div style={{ fontSize: 13 }}>{format(new Date(`${s.nextBillingDate.split('T')[0]}T00:00:00`), 'MMM d, yyyy')}</div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`sched-status sched-status--${s.status}`}>
                        <CircleDot size={10} />
                        {s.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <span style={{ 
                        fontWeight: 700, 
                        fontSize: 14,
                        color: s.invoiceCount > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        background: s.invoiceCount > 0 ? 'rgba(99,102,241,0.1)' : 'transparent',
                        padding: '3px 10px',
                        borderRadius: 8,
                      }}>
                        {s.invoiceCount}
                      </span>
                    </td>
                    <td className="text-center">
                      <PermissionGuard permission="billing-schedules.write">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          {['active', 'paused'].includes(s.status) && (
                            <button className="action-btn" onClick={() => openEdit(s)} title="Edit schedule">
                              <Pencil size={13} />
                            </button>
                          )}
                          {s.status === 'active' && (
                            <button className="action-btn" onClick={() => handleAction(s.id, 'pause')} title="Pause schedule">
                              <Pause size={13} />
                            </button>
                          )}
                          {s.status === 'paused' && (
                            <button className="action-btn" onClick={() => handleAction(s.id, 'resume')} title="Resume schedule">
                              <Play size={13} />
                            </button>
                          )}
                          {['active', 'paused'].includes(s.status) && (
                            <button className="action-btn danger" onClick={() => handleAction(s.id, 'cancel')} title="Cancel schedule">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </PermissionGuard>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </TableScrollWrapper>

        {meta && meta.total >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="sched-page-size">Rows per page:</label>
                <select
                  id="sched-page-size"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </span>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} title="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Create / Edit Schedule Modal ═══ */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg meter-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><CalendarClock size={18} /> {editId ? 'Edit Schedule' : 'New Billing Schedule'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  {/* Row 1: Floor | Unit */}
                  <div className="inv-field">
                    <label>Floor</label>
                    <select value={floorId} disabled={!form.propertyId} onChange={e => {
                      setFloorId(e.target.value);
                      setForm({ ...form, unitId: '', tenantId: '', leaseId: '' });
                    }}>
                      <option value="">{form.propertyId ? 'Select floor' : 'Select property first'}</option>
                      {floors.map(f => <option key={f.id} value={f.id}>{f.floorLabel}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Unit</label>
                    <select value={form.unitId} disabled={!form.propertyId} onChange={e => {
                      const unitId = e.target.value;
                      setForm({ ...form, unitId, tenantId: '', leaseId: '' });
                      if (unitId) setFloorId(deriveFloorId(unitId));
                    }}>
                      <option value="">{form.propertyId ? 'No specific unit' : 'Select property first'}</option>
                      {selectedSchedule?.unit && form.unitId === selectedSchedule.unit.id && !units.some(u => u.id === selectedSchedule.unit!.id) && (
                        <option value={selectedSchedule.unit.id}>{selectedSchedule.unit.unitNumber}</option>
                      )}
                      {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber}</option>)}
                    </select>
                  </div>

                  {/* Row 2: Department | Cost Center */}
                  <div className="inv-field">
                    <label>Department <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                    <select
                      value={form.departmentCenterId}
                      onChange={e => setForm({ ...form, departmentCenterId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {departmentCenters.map((d) => (
                        <option key={d.id} value={d.id}>{d.code}</option>
                      ))}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Cost Center <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                    <select
                      value={form.costCenterId}
                      onChange={e => setForm({ ...form, costCenterId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>{c.code}</option>
                      ))}
                    </select>
                  </div>

                  {/* Row 3: Tenant * | Charge Type * */}
                  <div className={`inv-field ${isTenantMissing ? 'inv-field-error' : ''}`}>
                    <label>Tenant <span className="req">*</span></label>
                    <ComboBox
                      id="schedule-tenant"
                      value={form.leaseId}
                      disabled={!form.propertyId}
                      placeholder={
                        !form.propertyId
                          ? 'Select property first'
                          : (filteredLeases.length > 0 || (selectedSchedule && form.leaseId))
                          ? 'Select tenant'
                          : 'No active leases'
                      }
                      emptyText="No active leases"
                      options={[
                        ...(selectedSchedule && form.leaseId && !filteredLeases.some(l => l.id === form.leaseId)
                          ? [{
                              id: form.leaseId,
                              label: (selectedSchedule.tenant.lastName || selectedSchedule.tenant.companyName || selectedSchedule.tenant.firstName || '').trim(),
                              sublabel: (selectedSchedule.tenant.firstName || '').trim() && (selectedSchedule.tenant.firstName || '').trim() !== (selectedSchedule.tenant.lastName || selectedSchedule.tenant.companyName || selectedSchedule.tenant.firstName || '').trim()
                                ? (selectedSchedule.tenant.firstName || '').trim()
                                : undefined,
                            }]
                          : []),
                        ...filteredLeases.map(l => {
                          const topLine = (l.tenant.lastName || l.tenant.companyName || l.tenant.firstName || '').trim();
                          const firstName = (l.tenant.firstName || '').trim();
                          return {
                            id: l.id,
                            label: topLine,
                            sublabel: firstName && firstName !== topLine ? firstName : undefined,
                          };
                        }),
                      ].filter(o => o.label !== '')}
                      onChange={val => {
                        const lease = leases.find(l => l.id === val);
                        const unitId = lease?.unit?.id || form.unitId;
                        const currentCt = chargeTypes.find(ct => ct.id === form.chargeTypeId) || selectedSchedule?.chargeType;
                        setForm({
                          ...form,
                          leaseId: lease?.id || '',
                          tenantId: lease?.tenant.id || '',
                          unitId,
                          quantity: isBaseRentCharge(currentCt) ? (lease?.leaseTermMonths ?? form.quantity) : 1,
                        });
                        if (lease?.unit?.id) setFloorId(deriveFloorId(lease.unit.id));
                      }}
                    />
                    {isTenantMissing && <span className="inv-error-text">Tenant is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Charge Type <span className="req">*</span></label>
                    <select
                      className={isChargeTypeMissing ? 'inv-input-error' : ''}
                      value={form.chargeTypeId}
                      onChange={e => {
                        const nextCtId = e.target.value;
                        const nextCt = chargeTypes.find(ct => ct.id === nextCtId);
                        const lease = leases.find(l => l.id === form.leaseId);
                        const nextQty = isBaseRentCharge(nextCt)
                          ? (lease?.leaseTermMonths ?? selectedSchedule?.lease?.leaseTermMonths ?? 1)
                          : 1;
                        setForm({ ...form, chargeTypeId: nextCtId, quantity: nextQty });
                      }}
                    >
                      <option value="">
                        {!form.departmentCenterId && !form.costCenterId
                          ? 'Select Dept / CC first…'
                          : filteredChargeTypes.length === 0
                          ? 'No matching charge types'
                          : 'Select charge type'}
                      </option>
                      {filteredChargeTypes.map(ct => (
                        <option key={ct.id} value={ct.id}>{ct.name}</option>
                      ))}
                    </select>
                    {isChargeTypeMissing && <span className="inv-error-text">Charge type is required</span>}
                  </div>

                  {/* Row 4: Qty | Amount * */}
                  <div className="inv-field">
                    <label>Qty</label>
                    <input type="number" min={0} step={1} value={form.quantity}
                      onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Amount <span className="req">*</span></label>
                    <input
                      type="number"
                      className={isAmountMissing ? 'inv-input-error' : ''}
                      min={0}
                      step={0.01}
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: Number(e.target.value) })}
                    />
                    {isAmountMissing && <span className="inv-error-text">Amount must be greater than 0</span>}
                  </div>

                  {/* Row 5: Currency | Base Amount */}
                  <div className="inv-field">
                    <label>Currency</label>
                    <select
                      value={form.currency}
                      disabled
                      title="Currency is set from the selected Unit and cannot be changed here"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                      onChange={() => {}}
                    >
                      <option value="">{form.unitId ? 'Select a unit currency…' : 'Select a unit first'}</option>
                      {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Base Amount</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={baseAmount != null ? `${baseAmount.toFixed(2)} ${baseCurrencyCode}` : ''}
                      placeholder={baseCurrencyCode ? `— no rate set for ${form.currency || 'this currency'} —` : '— not set in Currency Setup —'}
                      style={{ background: 'var(--bg-tertiary)', color: baseAmount != null ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'not-allowed' }}
                    />
                  </div>

                  {/* Row 6: Billing Cycle * | Billing Day (of month) * */}
                  <div className="inv-field">
                    <label>Billing Cycle <span className="req">*</span></label>
                    <select
                      className={isBillingCycleMissing ? 'inv-input-error' : ''}
                      value={form.billingCycle}
                      onChange={e => setForm({ ...form, billingCycle: e.target.value })}
                    >
                      {BILLING_CYCLES.map(c => (
                        <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                      ))}
                    </select>
                    {isBillingCycleMissing && <span className="inv-error-text">Billing cycle is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Billing Day (of month) <span className="req">*</span></label>
                    <input
                      type="number"
                      className={isBillingDayMissing ? 'inv-input-error' : ''}
                      min={1}
                      max={28}
                      value={form.billingDay}
                      onChange={e => setForm({ ...form, billingDay: Number(e.target.value) })}
                    />
                    {isBillingDayMissing && <span className="inv-error-text">Billing day must be between 1 and 28</span>}
                  </div>

                  {/* Row 7: Start Date * | End Date (optional) */}
                  <div className="inv-field">
                    <label>Start Date <span className="req">*</span></label>
                    <input
                      type="date"
                      className={isStartDateMissing ? 'inv-input-error' : ''}
                      value={form.startDate}
                      onChange={e => setForm({ ...form, startDate: e.target.value })}
                    />
                    {isStartDateMissing && <span className="inv-error-text">Start date is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>End Date (optional)</label>
                    <input type="date" value={form.endDate}
                      onChange={e => setForm({ ...form, endDate: e.target.value })} />
                  </div>

                  {/* Row 8: Payment Due (days after billing) | Description (optional) */}
                  <div className="inv-field">
                    <label>Payment Due (days after billing)</label>
                    <input type="number" min={0} max={90} value={form.paymentDueDays}
                      onChange={e => setForm({ ...form, paymentDueDays: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Description (optional)</label>
                    <input placeholder="e.g. Monthly rent for Unit A101" value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {(creating || updating) ? 'Saving…' : editId ? 'Update Schedule' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
