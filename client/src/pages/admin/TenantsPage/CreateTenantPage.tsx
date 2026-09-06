import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTenantMutation } from '../../../store/api/tenantsApi';
import { ArrowLeft, User, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './CreateTenantPage.css';

type TenantType = 'individual' | 'company';

export default function CreateTenantPage() {
  const navigate = useNavigate();
  const [createTenant, { isLoading }] = useCreateTenantMutation();
  const [tenantType, setTenantType] = useState<TenantType>('individual');

  const [form, setForm] = useState({
    // individual
    firstName: '', lastName: '', fatherName: '', dateOfBirth: '', gender: '',
    nationality: '', idType: '', idNumber: '', idExpiryDate: '', fatherNrc: '',
    maritalStatus: '',
    // company
    companyName: '', companyRegNo: '', companyType: '', gstRegNo: '',
    contactPersonName: '', contactPersonPhone: '', contactPersonEmail: '', contactPersonRole: '',
    // common
    email: '', phone: '', mobile: '',
    addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '',
    source: '',
    tags: [] as string[],
    notes: '',
  });

  const [tagInput, setTagInput] = useState('');

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (tenantType === 'individual' && !form.firstName) { toast.error('Code is required'); return; }
    if (tenantType === 'company'    && !form.companyName) { toast.error('Company name is required'); return; }

    const payload: Record<string, unknown> = { tenantType };
    if (tenantType === 'individual') {
      Object.assign(payload, {
        firstName: form.firstName, lastName: form.lastName, fatherName: form.fatherName || null,
        dateOfBirth: form.dateOfBirth || null, gender: form.gender || null,
        nationality: form.nationality || null, idType: form.idType || null,
        idNumber: form.idNumber || null, idExpiryDate: form.idExpiryDate || null,
        fatherNrc: form.fatherNrc || null,
        maritalStatus: form.maritalStatus || null,
      });
    } else {
      Object.assign(payload, {
        companyName: form.companyName, companyRegNo: form.companyRegNo || null,
        companyType: form.companyType || null, gstRegNo: form.gstRegNo || null,
        contactPersonName: form.contactPersonName || null, contactPersonPhone: form.contactPersonPhone || null,
        contactPersonEmail: form.contactPersonEmail || null, contactPersonRole: form.contactPersonRole || null,
      });
    }

    Object.assign(payload, {
      email: form.email || null, phone: form.phone || null, mobile: form.mobile || null,
      addressLine1: form.addressLine1 || null, addressLine2: form.addressLine2 || null,
      city: form.city || null, state: form.state || null,
      postalCode: form.postalCode || null, country: form.country || null,
      source: form.source || null, tags: form.tags,
      notes: form.notes || null,
    });

    try {
      const result = await createTenant(payload).unwrap();
      toast.success('Tenant created successfully');
      navigate(`/admin/tenants/${result.data.id}`);
    } catch (e: any) {
      const err = e?.data?.errors?.[0];
      const code = err?.code;
      if (code === 'DUPLICATE_TENANT') {
        toast.error(err?.message || 'Duplicate code — another tenant already uses this code');
      } else if (code === 'TENANT_BLACKLISTED') {
        toast.error(`⛔ ${err?.message}`);
      } else {
        toast.error(err?.message || 'Failed to create tenant');
      }
    }
  };

  return (
    <div className="create-tenant-page">
      <div className="ct-header">
        <button className="back-btn" onClick={() => navigate('/admin/tenants')}>
          <ArrowLeft size={16} /> Tenants
        </button>
        <h1>New Tenant</h1>
      </div>

      {/* Type toggle */}
      <div className="ct-type-toggle">
        <button className={tenantType === 'individual' ? 'active' : ''} onClick={() => setTenantType('individual')}>
          <User size={16} /> Individual
        </button>
        <button className={tenantType === 'company' ? 'active' : ''} onClick={() => setTenantType('company')}>
          <Building2 size={16} /> Company
        </button>
      </div>

      <div className="ct-form">
        {/* Individual fields */}
        {tenantType === 'individual' && (
          <div className="ct-section">
            <h3>Personal Information</h3>
            <div className="form-grid">
              <Field label="Code *"      value={form.firstName} onChange={(v) => set('firstName', v)} />
              <Field label="Name *"      value={form.lastName}  onChange={(v) => set('lastName', v)} />
              <Field label="Father Name" value={form.fatherName} onChange={(v) => set('fatherName', v)} />
              <Field label="Father's NRC" value={form.fatherNrc} onChange={(v) => set('fatherNrc', v)} />
              <Field label="Date of Birth" value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} type="date" />
              <SelectField label="Gender" value={form.gender} onChange={(v) => set('gender', v)}
                options={[['', 'Select…'],['male','Male'],['female','Female'],['other','Other'],['prefer_not_to_say','Prefer not to say']]} />
              <SelectField label="Marital Status" value={form.maritalStatus} onChange={(v) => set('maritalStatus', v)}
                options={[['', '— Select —'],['single','Single'],['married','Married']]} />
              <Field label="Nationality" value={form.nationality} onChange={(v) => set('nationality', v)} />
              <SelectField label="ID Type" value={form.idType} onChange={(v) => set('idType', v)}
                options={[['','Select…'],['nric','NRC'],['passport','Passport'],['fin','FIN'],['driving_license','Driving License']]} />
              <Field label="ID Number" value={form.idNumber} onChange={(v) => set('idNumber', v)} />
              <Field label="ID Expiry Date" value={form.idExpiryDate} onChange={(v) => set('idExpiryDate', v)} type="date" />
            </div>
          </div>
        )}


        {/* Company fields */}
        {tenantType === 'company' && (
          <>
            <div className="ct-section">
              <h3>Company Information</h3>
              <div className="form-grid">
                <Field label="Company Name *" value={form.companyName} onChange={(v) => set('companyName', v)} span={2} />
                <Field label="Registration No." value={form.companyRegNo} onChange={(v) => set('companyRegNo', v)} />
                <SelectField label="Company Type" value={form.companyType} onChange={(v) => set('companyType', v)}
                  options={[['','Select…'],['private_limited','Private Limited'],['partnership','Partnership'],['sole_prop','Sole Proprietor'],['public','Public Listed']]} />
                <Field label="GST Reg. No." value={form.gstRegNo} onChange={(v) => set('gstRegNo', v)} />
              </div>
            </div>

            <div className="ct-section">
              <h3>Contact Person</h3>
              <div className="form-grid">
                <Field label="Contact Name" value={form.contactPersonName} onChange={(v) => set('contactPersonName', v)} />
                <Field label="Role" value={form.contactPersonRole} onChange={(v) => set('contactPersonRole', v)} />
                <Field label="Phone" value={form.contactPersonPhone} onChange={(v) => set('contactPersonPhone', v)} />
                <Field label="Email" value={form.contactPersonEmail} onChange={(v) => set('contactPersonEmail', v)} type="email" />
              </div>
            </div>
          </>
        )}

        {/* Common fields */}
        <div className="ct-section">
          <h3>Contact Details</h3>
          <div className="form-grid">
            <Field label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} />
            <Field label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} />
            <SelectField label="Source" value={form.source} onChange={(v) => set('source', v)}
              options={[['','Select…'],['walk_in','Walk-in'],['referral','Referral'],['online','Online'],['agent','Agent']]} />
          </div>
        </div>

        <div className="ct-section">
          <h3>Address</h3>
          <div className="form-grid">
            <Field label="Address Line 1" value={form.addressLine1} onChange={(v) => set('addressLine1', v)} span={2} />
            <Field label="Address Line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} span={2} />
            <Field label="City"         value={form.city}       onChange={(v) => set('city', v)} />
            <Field label="State"        value={form.state}      onChange={(v) => set('state', v)} />
            <Field label="Postal Code"  value={form.postalCode} onChange={(v) => set('postalCode', v)} />
            <Field label="Country (2-letter)" value={form.country} onChange={(v) => set('country', v.toUpperCase())} maxLength={2} />
          </div>
        </div>

        <div className="ct-section">
          <h3>Tags & Notes</h3>
          <div className="tags-input-row">
            <div className="tags-list">
              {form.tags.map((t) => (
                <span key={t} className="ct-tag">
                  {t}<button onClick={() => set('tags', form.tags.filter((x) => x !== t))}>×</button>
                </span>
              ))}
            </div>
            <div className="tag-input-wrap">
              <input
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput && !form.tags.includes(tagInput)) {
                    set('tags', [...form.tags, tagInput]);
                    setTagInput('');
                  }
                }}
              />
              {tagInput && !form.tags.includes(tagInput) && (
                <button onClick={() => { set('tags', [...form.tags, tagInput]); setTagInput(''); }}>Add</button>
              )}
            </div>
          </div>
          <textarea
            className="ct-notes"
            placeholder="Internal notes (optional)…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="ct-footer">
        <button className="btn-ghost" onClick={() => navigate('/admin/tenants')}>Cancel</button>
        <PermissionGuard permission="tenants.create">
          <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create Tenant'}
          </button>
        </PermissionGuard>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', span, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; span?: number; maxLength?: number;
}) {
  return (
    <div className="form-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
