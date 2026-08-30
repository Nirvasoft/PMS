import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateLeadMutation } from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetUsersQuery } from '../../../store/api/usersApi';
import { useGetUnitTypesQuery } from '../../../store/api/unitsApi';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreateLeadPage.css';

const YES_NO_OPTIONS: [string, string][] = [
  ['yes', 'Yes'],
  ['no', 'No'],
];

export default function CreateLeadPage() {
  const navigate = useNavigate();
  const [createLead, { isLoading }] = useCreateLeadMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];
  const { data: usersData } = useGetUsersQuery({ page: 1, limit: 200 });
  const users = usersData?.data || [];
  const { data: unitTypesData } = useGetUnitTypesQuery();
  const unitTypes = unitTypesData?.data || [];

  const [form, setForm] = useState({
    lastName: '', email: '', phone: '',
    propertyId: '', source: 'website', priority: 'medium', assignedTo: '',
    budgetMin: '', budgetMax: '', unitTypePreference: '', leaseTermMonths: '',
  });

  const [loi, setLoi] = useState({
    // Applicant Information
    applicantDate: '', shopName: '', address: '',
    businessType: '', doorType: '', productPlan: '',
    ceiling: '', currentShop: '',
  });

  useEffect(() => {
    if (properties.length === 1 && !form.propertyId) {
      setForm((f) => ({ ...f, propertyId: properties[0].id }));
    }
  }, [properties]);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setLoiField = (key: string, value: string) => {
    setLoi((l) => ({ ...l, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.lastName) { toast.error('Name is required'); return; }
    if ((form.budgetMin && Number(form.budgetMin) < 0) || (form.budgetMax && Number(form.budgetMax) < 0)) {
      toast.error('Budget cannot be negative');
      return;
    }
    const MAX_BUDGET = 9999999999999.99;
    if ((form.budgetMin && Number(form.budgetMin) > MAX_BUDGET) || (form.budgetMax && Number(form.budgetMax) > MAX_BUDGET)) {
      toast.error('Budget exceeds maximum allowed value');
      return;
    }
    if (form.budgetMin && form.budgetMax && Number(form.budgetMin) > Number(form.budgetMax)) {
      toast.error('Budget Min cannot be greater than Budget Max');
      return;
    }
    try {
      const loiDetails: Record<string, unknown> = {};
      Object.entries(loi).forEach(([key, value]) => {
        if (Array.isArray(value) ? value.length > 0 : value !== '') loiDetails[key] = value;
      });

      const body: Record<string, unknown> = {
        lastName: form.lastName,
        email: form.email ? form.email.trim().toLowerCase() : undefined,
        phone: form.phone || undefined,
        propertyId: form.propertyId || undefined,
        source: form.source || undefined,
        priority: form.priority,
        assignedTo: form.assignedTo || undefined,
        unitTypePreference: form.unitTypePreference || undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        leaseTermMonths: form.leaseTermMonths ? Number(form.leaseTermMonths) : undefined,
        loiDetails: Object.keys(loiDetails).length > 0 ? loiDetails : undefined,
      };
      const result = await createLead(body).unwrap();
      toast.success('Lead created');
      navigate(`/admin/crm/leads/${result.data.id}`);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to create lead');
    }
  };

  return (
    <div className="create-lead-page">
      <div className="cl-header">
        <button className="back-btn" onClick={() => navigate('/admin/crm/leads')}>
          <ArrowLeft size={16} /> Lead Pipeline
        </button>
        <h1>New Lead</h1>
      </div>

      <div className="cl-form">
        <div className="cl-section">
          <h3>Contact Information</h3>
          <div className="form-grid">
            <Field label="Name *" value={form.lastName} onChange={(v) => set('lastName', v)} placeholder="Doe" />
            <Field label="Email" value={form.email} onChange={(v) => set('email', v.toLowerCase())} type="email" placeholder="john@email.com" />
            <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v.replace(/\D/g, ''))} type="tel" placeholder="15551234" />
            <Field label="Address" value={loi.address} onChange={(v) => setLoiField('address', v)} placeholder="123 Main St" />
          </div>
        </div>

        <div className="cl-section">
          <h3>Requirements</h3>
          <div className="form-grid">
            <SelectField label="Property" value={form.propertyId} onChange={(v) => set('propertyId', v)}
              options={[['', '— Select property —'], ...properties.map((p: any) => [p.id, p.name] as [string, string])]} span={2} />
            <SelectField label="Unit Type Preference" value={form.unitTypePreference} onChange={(v) => set('unitTypePreference', v)}
              options={[['', 'Select…'], ...[...unitTypes].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.code, t.name] as [string, string])]} />
            <Field label="Lease Term (months)" value={form.leaseTermMonths} onChange={(v) => set('leaseTermMonths', v)} type="number" min={0} placeholder="12" />
            <Field label="Budget Min" value={form.budgetMin} onChange={(v) => set('budgetMin', v)} type="number" min={0} placeholder="0" />
            <Field label="Budget Max" value={form.budgetMax} onChange={(v) => set('budgetMax', v)} type="number" min={0} placeholder="5000" />

            <Field label="Applicant Date" value={loi.applicantDate} onChange={(v) => setLoiField('applicantDate', v)} type="date" />
            <Field label="Shop Name" value={loi.shopName} onChange={(v) => setLoiField('shopName', v)} />

            <SelectField label="Business Type" value={loi.businessType} onChange={(v) => setLoiField('businessType', v)}
              options={[['', 'Select…'], ['private', 'Private'], ['share', 'Share'], ['company', 'Company']]} />
            <SelectField label="Door Type" value={loi.doorType} onChange={(v) => setLoiField('doorType', v)}
              options={[['', 'Select…'], ['glass_door', 'Glass Door'], ['other', 'Other'], ['roller_shutter', 'Roller Shutter']]} />
            <SelectField label="Product Plan" value={loi.productPlan} onChange={(v) => setLoiField('productPlan', v)}
              options={[['', 'Select…'], ['100_300', '100-300 Sq.ft'], ['300_500', '300-500 Sq.ft'], ['500_700', '500-700 Sq.ft'], ['700_above', '700 Sq.ft & Above']]} />

            <RadioGroup label="Ceiling" name="ceiling" value={loi.ceiling} onChange={(v) => setLoiField('ceiling', v)} options={YES_NO_OPTIONS} />
            <RadioGroup label="Current Shop (If have)" name="currentShop" value={loi.currentShop} onChange={(v) => setLoiField('currentShop', v)} options={YES_NO_OPTIONS} />
          </div>
        </div>

        <div className="cl-section">
          <h3>Pipeline Details</h3>
          <div className="form-grid">
            <SelectField label="Source" value={form.source} onChange={(v) => set('source', v)}
              options={[['website', 'Website'], ['walk_in', 'Walk-in'], ['referral', 'Referral'], ['agent', 'Agent'], ['portal', 'Portal']]} />
            <SelectField label="Priority" value={form.priority} onChange={(v) => set('priority', v)}
              options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
            <SelectField label="Assign To" value={form.assignedTo} onChange={(v) => set('assignedTo', v)}
              options={[['', '-'], ...users.map((u: any) => [u.id, u.email] as [string, string])]} />
          </div>
        </div>
      </div>

      <div className="cl-footer">
        <button className="btn-secondary" onClick={() => navigate('/admin/crm/leads')}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={isLoading || !form.lastName}>
          {isLoading ? 'Creating…' : 'Create Lead'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', span, placeholder, min }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; span?: number; placeholder?: string; min?: number;
}) {
  return (
    <div className="form-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <input type={type} value={value} min={min}
        onChange={(e) => {
          const v = e.target.value;
          if (min !== undefined && v !== '' && Number(v) < min) return;
          onChange(v);
        }}
        placeholder={placeholder}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        autoCorrect={type === 'email' ? 'off' : undefined}
        spellCheck={type === 'email' ? false : undefined}
        style={type === 'email' ? { textTransform: 'lowercase' } : undefined} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, span }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; span?: number;
}) {
  return (
    <div className="form-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function RadioGroup({ label, name, value, onChange, options, span }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; span?: number;
}) {
  return (
    <div className="form-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <div className="cl-radio-options">
        {options.map(([v, l]) => (
          <label key={v} className="cl-radio-option">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}
