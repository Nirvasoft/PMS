import type { FormState } from '../../types';

export function UnitTenantStep({ form, set, templates }: { form: FormState; set: Function; templates: any[] }) {
  return (
    <div className="step-content">
      <h3>Select Unit & Tenant</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Property ID *</label>
          <input placeholder="Property UUID" value={form.propertyId} onChange={(e) => set('propertyId', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Unit ID * <span className="hint">(must be available)</span></label>
          <input placeholder="Unit UUID" value={form.unitId} onChange={(e) => set('unitId', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Tenant ID * <span className="hint">(must be KYC verified)</span></label>
          <input placeholder="Tenant UUID" value={form.tenantId} onChange={(e) => set('tenantId', e.target.value)} />
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
        <p>💡 In a future update, these fields will have searchable autocomplete pickers for units and tenants.</p>
      </div>
    </div>
  );
}
