import { useEffect, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPropertiesQuery, useGetFloorSetupsQuery } from '../../../../../../store/api/propertiesApi';
import { useGetUnitsQuery, useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetTenantsQuery } from '../../../../../../store/api/tenantsApi';
import ComboBox from '../../../../../../components/ComboBox';
import type { FormState } from '../../types';

/** Units the lease API will accept — see leases.service.ts. */
const LEASABLE = ['available', 'reserved'];

export function UnitTenantStep({ form, set, templates }: { form: FormState; set: Function; templates: any[] }) {
  const [propertySearch, setPropertySearch] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const debounced = useDebounced(propertySearch);
  const unitDebounced = useDebounced(unitSearch);
  const tenantDebounced = useDebounced(tenantSearch);

  const { data: propertiesData, isFetching: propertiesLoading } = useGetPropertiesQuery({
    search: debounced || undefined,
    limit: 20,
  });

  // Floors live under a property too, and narrow the unit list below.
  const { data: floorsData } = useGetFloorSetupsQuery(
    form.propertyId ? { propertyId: form.propertyId } : skipToken,
  );
  const floorOptions = (floorsData?.data || [])
    .slice()
    .sort((a, b) => a.floorNumber - b.floorNumber);

  // Units live under a property, so there is nothing to ask for until one is picked.
  const { data: unitsData, isFetching: unitsLoading } = useGetUnitsQuery(
    form.propertyId
      ? {
          propertyId: form.propertyId,
          floor: floorNumber ? Number(floorNumber) : undefined,
          search: unitDebounced || undefined,
          limit: 50,
        }
      : skipToken,
  );

  const unitOptions = (unitsData?.data || [])
    .filter((u) => LEASABLE.includes(u.status))
    .map((u) => ({
      id: u.id,
      label: u.unitNumber,
      sublabel: [u.tower?.name, u.floorLabel, u.status].filter(Boolean).join(' · ') || undefined,
    }));

  // Once a unit is picked, pull its detail so we can surface its total area.
  const { data: selectedUnitData } = useGetUnitQuery(
    form.propertyId && form.unitId
      ? { propertyId: form.propertyId, unitId: form.unitId }
      : skipToken,
  );
  const selectedUnitArea = selectedUnitData?.data?.areaSqft ?? null;

  // Blacklisted tenants are rejected outright by the lease API; the verified
  // filter matches the rule stated on the field label.
  const { data: tenantsData, isFetching: tenantsLoading } = useGetTenantsQuery({
    search: tenantDebounced || undefined,
    kycStatus: 'verified',
    isBlacklisted: false,
    limit: 20,
  });

  const tenantOptions = (tenantsData?.data || []).map((t) => ({
    id: t.id,
    label: t.displayName,
    sublabel: [t.email, t.mobile].filter(Boolean).join(' · ') || undefined,
  }));

  // Code is what staff know a property by, so it leads; the name disambiguates.
  const propertyOptions = (propertiesData?.data || []).map((p) => ({
    id: p.id,
    label: p.code || p.name,
    sublabel: [p.code ? p.name : null, p.city].filter(Boolean).join(' · ') || undefined,
  }));

  return (
    <div className="step-content">
      <h3>Select Unit &amp; Tenant</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label htmlFor="lease-property">Property ID *</label>
          <ComboBox
            id="lease-property"
            value={form.propertyId}
            onChange={(v) => {
              const opt = propertyOptions.find(p => p.id === v);
              set('propertyId', v);
              set('propertyCode', opt?.label || '');
              if (form.unitId) { set('unitId', ''); set('unitCode', ''); }
              setFloorNumber('');
            }}
            options={propertyOptions}
            onSearch={setPropertySearch}
            loading={propertiesLoading}
            placeholder="Search by code or name…"
            emptyText="No properties found"
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease-floor">Floor *</label>
          <select
            id="lease-floor"
            value={floorNumber}
            disabled={!form.propertyId}
            onChange={(e) => {
              setFloorNumber(e.target.value);
              if (form.unitId) { set('unitId', ''); set('unitCode', ''); }
            }}
          >
            <option value="">{form.propertyId ? 'Select a floor' : 'Select a property first'}</option>
            {floorOptions.map((f) => (
              <option key={f.id} value={f.floorNumber}>{f.floorLabel}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="lease-unit">Unit ID * <span className="hint">(must be available)</span></label>
          <ComboBox
            id="lease-unit"
            value={form.unitId}
            onChange={(v) => {
              const opt = unitOptions.find(u => u.id === v);
              set('unitId', v);
              set('unitCode', opt?.label || '');
            }}
            options={unitOptions}
            onSearch={setUnitSearch}
            loading={unitsLoading}
            disabled={!form.propertyId || !floorNumber}
            placeholder={!form.propertyId ? 'Select a property first' : !floorNumber ? 'Select a floor first' : 'Search unit number…'}
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
            onChange={(v) => {
              const opt = tenantOptions.find(t => t.id === v);
              set('tenantId', v);
              set('tenantCode', opt?.label || '');
            }}
            options={tenantOptions}
            onSearch={setTenantSearch}
            loading={tenantsLoading}
            placeholder="Search name, email or phone…"
            emptyText="No KYC-verified tenants found"
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
        <p>💡 Only available units and KYC-verified, non-blacklisted tenants are listed.</p>
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
