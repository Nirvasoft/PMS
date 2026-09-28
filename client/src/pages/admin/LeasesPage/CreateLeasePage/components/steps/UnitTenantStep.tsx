import { useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPropertiesQuery, useGetFloorSetupsQuery, useGetMyPropertyScopeQuery } from '../../../../../../store/api/propertiesApi';
import { useGetUnitsQuery, useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetTenantsQuery } from '../../../../../../store/api/tenantsApi';
import { useSelectedPropertyFilter } from '../../../../../../hooks/useSelectedPropertyId';
import ComboBox from '../../../../../../components/ComboBox';
import type { FormState } from '../../types';


/** The lease API also accepts 'reserved' units, but the dropdown only offers truly free ones. */
const LEASABLE = ['available'];

export function UnitTenantStep({ form, set, templates }: { form: FormState; set: Function; templates: any[] }) {
  const [propertySearch, setPropertySearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const debounced = useDebounced(propertySearch);
  const unitDebounced = useDebounced(unitSearch);
  const tenantDebounced = useDebounced(tenantSearch);

  // Locked to the sidebar's Active Property, same convention as Expenses/Payment Vouchers —
  // only when "All Properties" is active can the property be chosen here.
  const activeProperty = useSelectedPropertyFilter();
  const propertyLocked = !!activeProperty;
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const lockedProperty = (scopeData?.data || []).find((p) => p.id === activeProperty);

  useEffect(() => {
    if (!propertyLocked) return;
    if (form.propertyId !== activeProperty) {
      set('propertyId', activeProperty);
      set('propertyCode', lockedProperty?.code || lockedProperty?.name || '');
      if (form.unitId) { set('unitId', ''); set('unitCode', ''); }
      if (form.tenantId) { set('tenantId', ''); set('tenantCode', ''); }
      set('floorNumber', '');
    } else if (!form.propertyCode && lockedProperty) {
      set('propertyCode', lockedProperty.code || lockedProperty.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyLocked, activeProperty, lockedProperty]);

  const { data: propertiesData, isFetching: propertiesLoading } = useGetPropertiesQuery(
    propertyLocked ? skipToken : {
      search: debounced || undefined,
      limit: 20,
    },
  );

  // Floors live under a property too, and narrow the unit list below.
  const { data: floorsData } = useGetFloorSetupsQuery(
    form.propertyId ? { propertyId: form.propertyId } : skipToken,
  );
  const floorOptions = (floorsData?.data || [])
    .slice()
    .sort((a, b) => a.floorNumber - b.floorNumber);

  // Units live under a property, so there is nothing to ask for until one is picked.
  // Status is filtered server-side so the 50-row page isn't crowded out by
  // occupied/reserved/etc. units that would otherwise push available ones off the list.
  const { data: unitsData, isFetching: unitsLoading } = useGetUnitsQuery(
    form.propertyId
      ? {
          propertyId: form.propertyId,
          floor: form.floorNumber !== '' ? Number(form.floorNumber) : undefined,
          search: unitDebounced || undefined,
          status: LEASABLE.join(','),
          limit: 50,
        }
      : skipToken,
  );

  // Once a unit is picked, pull its detail so we can surface its total area.
  const { data: selectedUnitData } = useGetUnitQuery(
    form.propertyId && form.unitId
      ? { propertyId: form.propertyId, unitId: form.unitId }
      : skipToken,
  );
  const selectedUnitArea = selectedUnitData?.data?.areaSqft ?? null;

  // Auto-fill floorNumber and unitCode from unit detail if not yet set
  useEffect(() => {
    if (!form.floorNumber && selectedUnitData?.data?.floorNumber != null) {
      set('floorNumber', String(selectedUnitData.data.floorNumber));
    }
    if (form.unitId && !form.unitCode && selectedUnitData?.data?.unitNumber) {
      set('unitCode', selectedUnitData.data.unitNumber);
    }
  }, [form.floorNumber, form.unitId, form.unitCode, selectedUnitData?.data, set]);

  const unitOptions = useMemo(() => {
    const list = (unitsData?.data || []).map((u) => ({
      id: u.id,
      label: u.unitNumber,
      sublabel: [u.tower?.name, u.floorLabel, u.status].filter(Boolean).join(' · ') || undefined,
    }));
    if (form.unitId && !list.some((u) => u.id === form.unitId)) {
      list.unshift({
        id: form.unitId,
        label: form.unitCode || selectedUnitData?.data?.unitNumber || 'Selected unit',
        sublabel: [
          selectedUnitData?.data?.tower?.name,
          selectedUnitData?.data?.floorLabel,
          selectedUnitData?.data?.status,
        ].filter(Boolean).join(' · ') || undefined,
      });
    }
    return list;
  }, [unitsData?.data, form.unitId, form.unitCode, selectedUnitData?.data]);

  // Blacklisted tenants are rejected outright by the lease API; the verified
  // filter matches the rule stated on the field label.
  // propertyId scopes the list to tenants who belong to (or have a lease in)
  // the currently selected property — mirrors the server-side OR filter.
  const { data: tenantsData, isFetching: tenantsLoading } = useGetTenantsQuery(
    form.propertyId
      ? {
          search: tenantDebounced || undefined,
          kycStatus: 'verified',
          isBlacklisted: false,
          propertyId: form.propertyId,
          limit: 20,
        }
      : skipToken,
  );

  const tenantOptions = useMemo(() => {
    const list = (tenantsData?.data || []).map((t) => ({
      id: t.id,
      label: t.displayName,
      sublabel: [t.email, t.mobile].filter(Boolean).join(' · ') || undefined,
    }));
    if (form.tenantId && !list.some((t) => t.id === form.tenantId)) {
      list.unshift({
        id: form.tenantId,
        label: form.tenantCode || 'Selected tenant',
        sublabel: undefined,
      });
    }
    return list;
  }, [tenantsData?.data, form.tenantId, form.tenantCode]);

  // Code is what staff know a property by, so it leads; the name disambiguates.
  const propertyOptions = useMemo(() => {
    if (propertyLocked) {
      return lockedProperty
        ? [{ id: lockedProperty.id, label: lockedProperty.code || lockedProperty.name, sublabel: lockedProperty.code ? lockedProperty.name : undefined }]
        : [];
    }
    const list = (propertiesData?.data || []).map((p) => ({
      id: p.id,
      label: p.code || p.name,
      sublabel: [p.code ? p.name : null, p.city].filter(Boolean).join(' · ') || undefined,
    }));
    if (form.propertyId && !list.some((p) => p.id === form.propertyId)) {
      list.unshift({
        id: form.propertyId,
        label: form.propertyCode || 'Selected property',
        sublabel: undefined,
      });
    }
    return list;
  }, [propertyLocked, lockedProperty, propertiesData?.data, form.propertyId, form.propertyCode]);

  return (
    <div className="step-content">
      <h3>Select Unit &amp; Tenant</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="lease-property">
            Property ID *
            {propertyLocked && <span className="hint"> (locked to the active property)</span>}
          </label>
          <ComboBox
            id="lease-property"
            value={form.propertyId}
            selectedLabel={form.propertyCode}
            onChange={(v) => {
              const opt = propertyOptions.find(p => p.id === v);
              set('propertyId', v);
              set('propertyCode', opt?.label || '');
              if (form.unitId) { set('unitId', ''); set('unitCode', ''); }
              if (form.tenantId) { set('tenantId', ''); set('tenantCode', ''); }
              set('floorNumber', '');
            }}
            options={propertyOptions}
            onSearch={propertyLocked ? undefined : setPropertySearch}
            loading={propertyLocked ? false : propertiesLoading}
            disabled={propertyLocked}
            placeholder={propertyLocked ? 'Loading…' : 'Search by code or name…'}
            emptyText="No properties found"
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease-floor">Floor *</label>
          <select
            id="lease-floor"
            value={form.floorNumber}
            disabled={!form.propertyId}
            onChange={(e) => {
              set('floorNumber', e.target.value);
              if (form.unitId) { set('unitId', ''); set('unitCode', ''); }
            }}
          >
            <option value="">{form.propertyId ? 'Select a floor' : 'Select a property first'}</option>
            {floorOptions.map((f) => (
              <option key={f.id} value={String(f.floorNumber)}>{f.floorLabel}</option>
            ))}
            {form.floorNumber !== '' && !floorOptions.some(f => String(f.floorNumber) === form.floorNumber) && (
              <option value={form.floorNumber}>
                {selectedUnitData?.data?.floorLabel || `Floor ${form.floorNumber}`}
              </option>
            )}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="lease-unit">Unit ID * <span className="hint">(must be available)</span></label>
          <ComboBox
            id="lease-unit"
            value={form.unitId}
            selectedLabel={form.unitCode}
            onChange={(v) => {
              const opt = unitOptions.find(u => u.id === v);
              set('unitId', v);
              set('unitCode', opt?.label || '');
            }}
            options={unitOptions}
            onSearch={setUnitSearch}
            loading={unitsLoading}
            disabled={!form.propertyId || form.floorNumber === ''}
            placeholder={!form.propertyId ? 'Select a property first' : form.floorNumber === '' ? 'Select a floor first' : 'Search unit number…'}
            emptyText="No available units"
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease-unit-area">Total Area (sqft)</label>
          <input
            id="lease-unit-area"
            type="text"
            value={selectedUnitArea != null ? selectedUnitArea.toLocaleString() : '-'}
            readOnly
            tabIndex={-1}
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease-tenant">Tenant ID * <span className="hint">(must be KYC verified)</span></label>
          <ComboBox
            id="lease-tenant"
            value={form.tenantId}
            selectedLabel={form.tenantCode}
            onChange={(v) => {
              const opt = tenantOptions.find(t => t.id === v);
              set('tenantId', v);
              set('tenantCode', opt?.label || '');
            }}
            options={tenantOptions}
            onSearch={setTenantSearch}
            loading={tenantsLoading}
            disabled={!form.propertyId}
            placeholder={!form.propertyId ? 'Select a property first' : 'Search name, email or phone…'}
            emptyText="No KYC-verified tenants found for this property"
          />
        </div>
        {templates.length > 0 && (
          <div className="form-field">
            <label>Lease Template <span className="optional">(optional)</span></label>
            <select value={form.templateId} onChange={(e) => set('templateId', e.target.value)}>
              <option value="">No template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="step-info">
        <p>💡 Only available units and KYC-verified, non-blacklisted tenants linked to the selected property are listed.</p>
      </div>
    </div>
  );
}

function useDebounced(value: string, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
