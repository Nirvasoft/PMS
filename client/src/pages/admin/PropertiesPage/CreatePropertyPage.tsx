import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePropertyMutation, useGetPropertyTypesQuery } from '../../../store/api/propertiesApi';
import { ArrowLeft, Building2, MapPin, DollarSign, Info, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreatePropertyPage.css';

type Step = 1 | 2 | 3 | 4;

interface FormState {
  // Basic
  name: string; code: string; propertyType: string; legalName: string; registrationNo: string; description: string;
  // Address
  addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string; country: string;
  geoLat: string; geoLng: string;
  // Details
  yearBuilt: string; totalFloors: string; totalAreaSqm: string; totalAreaSqft: string;
  // Financial
  billingCycle: string; billingDay: string; currency: string; timezone: string;
}

const INITIAL: FormState = {
  name: '', code: '', propertyType: '', legalName: '', registrationNo: '', description: '',
  addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '',
  geoLat: '', geoLng: '',
  yearBuilt: '', totalFloors: '', totalAreaSqm: '', totalAreaSqft: '',
  billingCycle: 'monthly', billingDay: '1', currency: 'USD', timezone: 'UTC',
};

const STEPS = [
  { n: 1, label: 'Basic Info',    icon: <Info size={15} /> },
  { n: 2, label: 'Address',       icon: <MapPin size={15} /> },
  { n: 3, label: 'Details',       icon: <Building2 size={15} /> },
  { n: 4, label: 'Financial',     icon: <DollarSign size={15} /> },
];

const CURRENCIES = ['USD','SGD','EUR','GBP','AED','THB','MMK','JPY','CNY','INR'];
const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Asia/Bangkok','Asia/Yangon','Asia/Dubai'];
const COUNTRIES  = ['US','SG','GB','TH','MM','JP','AE','AU','DE','FR','IN','CN'];

export default function CreatePropertyPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [createProperty, { isLoading }] = useCreatePropertyMutation();
  const { data: typesData } = useGetPropertyTypesQuery();
  const types = typesData?.data || [];

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  const canNext = (): boolean => {
    if (step === 1) return !!(form.name.trim() && form.propertyType);
    if (step === 2) return true; // address optional
    if (step === 3) return true;
    return true;
  };

  const handleSubmit = async () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      propertyType: form.propertyType,
      code:           form.code          || undefined,
      legalName:      form.legalName     || undefined,
      registrationNo: form.registrationNo|| undefined,
      description:    form.description   || undefined,
      addressLine1:   form.addressLine1  || undefined,
      addressLine2:   form.addressLine2  || undefined,
      city:           form.city          || undefined,
      state:          form.state         || undefined,
      postalCode:     form.postalCode    || undefined,
      country:        form.country       || undefined,
      geoLat:         form.geoLat  ? Number(form.geoLat)  : undefined,
      geoLng:         form.geoLng  ? Number(form.geoLng)  : undefined,
      yearBuilt:      form.yearBuilt     ? Number(form.yearBuilt)     : undefined,
      totalFloors:    form.totalFloors   ? Number(form.totalFloors)   : undefined,
      totalAreaSqm:   form.totalAreaSqm  ? Number(form.totalAreaSqm)  : undefined,
      totalAreaSqft:  form.totalAreaSqft ? Number(form.totalAreaSqft) : undefined,
      billingCycle: form.billingCycle,
      billingDay:   Number(form.billingDay) || 1,
      currency:     form.currency,
      timezone:     form.timezone,
    };

    try {
      const res = await createProperty(payload as any).unwrap();
      toast.success(`Property "${res.data.name}" created`);
      navigate(`/admin/properties/${res.data.id}`);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to create property');
    }
  };

  return (
    <div className="create-property-page">
      {/* Header */}
      <div className="cp-header">
        <button className="back-btn" onClick={() => navigate('/admin/properties')}>
          <ArrowLeft size={16} /> Properties
        </button>
        <h1>Add New Property</h1>
      </div>

      {/* Step bar */}
      <div className="cp-steps">
        {STEPS.map((s) => (
          <div key={s.n} className={`cp-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}
            onClick={() => step > s.n && setStep(s.n as Step)} style={{ cursor: step > s.n ? 'pointer' : 'default' }}>
            <div className="cp-step-dot">{step > s.n ? <Check size={13} /> : s.icon}</div>
            <span className="cp-step-label">{s.label}</span>
            {s.n < 4 && <div className="cp-step-line" />}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="cp-body">
        {step === 1 && (
          <div className="cp-section">
            <h3>Basic Information</h3>
            <div className="cp-grid">
              <div className="cp-field full">
                <label>Property Name *</label>
                <input placeholder="e.g. Marina Bay Residences" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Property Code <span className="opt">(auto-generated if blank)</span></label>
                <input placeholder="e.g. MBR-001" value={form.code} onChange={e => set('code', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Property Type *</label>
                <select value={form.propertyType} onChange={e => set('propertyType', e.target.value)}>
                  <option value="">Select type…</option>
                  {types.length > 0
                    ? types.map(t => <option key={t.id} value={t.code}>{t.name}</option>)
                    : ['residential','commercial','mixed','industrial','retail','hospitality'].map(t =>
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="cp-field">
                <label>Legal Name</label>
                <input placeholder="Official legal name" value={form.legalName} onChange={e => set('legalName', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Registration / Licence No.</label>
                <input placeholder="e.g. BCA-2024-12345" value={form.registrationNo} onChange={e => set('registrationNo', e.target.value)} />
              </div>
              <div className="cp-field full">
                <label>Description</label>
                <textarea rows={3} placeholder="Brief description of the property…" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="cp-section">
            <h3>Address & Location</h3>
            <div className="cp-grid">
              <div className="cp-field full">
                <label>Address Line 1</label>
                <input placeholder="Street address, building name" value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} />
              </div>
              <div className="cp-field full">
                <label>Address Line 2</label>
                <input placeholder="Floor, unit number, block" value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>City</label>
                <input placeholder="e.g. Singapore" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>State / Province</label>
                <input placeholder="e.g. Central Region" value={form.state} onChange={e => set('state', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Postal Code</label>
                <input placeholder="e.g. 018956" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Country</label>
                <select value={form.country} onChange={e => set('country', e.target.value)}>
                  <option value="">Select country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="cp-geo-row">
              <div className="cp-field">
                <label>Latitude <span className="opt">(optional)</span></label>
                <input type="number" step="any" placeholder="e.g. 1.2839" value={form.geoLat} onChange={e => set('geoLat', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Longitude <span className="opt">(optional)</span></label>
                <input type="number" step="any" placeholder="e.g. 103.8607" value={form.geoLng} onChange={e => set('geoLng', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="cp-section">
            <h3>Property Details</h3>
            <div className="cp-grid">
              <div className="cp-field">
                <label>Year Built</label>
                <input type="number" min={1800} max={new Date().getFullYear()} placeholder="e.g. 2018" value={form.yearBuilt} onChange={e => set('yearBuilt', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Total Floors</label>
                <input type="number" min={1} placeholder="e.g. 32" value={form.totalFloors} onChange={e => set('totalFloors', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Total Area (sqm)</label>
                <input type="number" min={0} placeholder="e.g. 12500" value={form.totalAreaSqm} onChange={e => set('totalAreaSqm', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Total Area (sqft)</label>
                <input type="number" min={0} placeholder="e.g. 134549" value={form.totalAreaSqft} onChange={e => set('totalAreaSqft', e.target.value)} />
              </div>
            </div>
            <div className="cp-hint">💡 You can add units, facilities, and photos after creation from the property detail page.</div>
          </div>
        )}

        {step === 4 && (
          <div className="cp-section">
            <h3>Financial & Operational Settings</h3>
            <div className="cp-grid">
              <div className="cp-field">
                <label>Currency</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="cp-field">
                <label>Billing Cycle</label>
                <select value={form.billingCycle} onChange={e => set('billingCycle', e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="cp-field">
                <label>Billing Day (1–28)</label>
                <input type="number" min={1} max={28} value={form.billingDay} onChange={e => set('billingDay', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Timezone</label>
                <select value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>

            {/* Summary */}
            <div className="cp-review">
              <div className="cp-review-title">Review before creating</div>
              <div className="cp-review-grid">
                <ReviewRow label="Name"         value={form.name} />
                <ReviewRow label="Type"         value={form.propertyType} />
                <ReviewRow label="Code"         value={form.code || 'Auto-generated'} />
                <ReviewRow label="Location"     value={[form.city, form.country].filter(Boolean).join(', ') || '—'} />
                <ReviewRow label="Currency"     value={form.currency} />
                <ReviewRow label="Billing"      value={`${form.billingCycle}, day ${form.billingDay}`} />
                <ReviewRow label="Timezone"     value={form.timezone} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="cp-footer">
        {step > 1 && (
          <button className="cp-btn-back" onClick={() => setStep(s => (s - 1) as Step)}>
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <div className="cp-footer-right">
          <button className="cp-btn-cancel" onClick={() => navigate('/admin/properties')}>Cancel</button>
          {step < 4 ? (
            <button className="cp-btn-next" disabled={!canNext()} onClick={() => setStep(s => (s + 1) as Step)}>
              Next →
            </button>
          ) : (
            <button className="cp-btn-submit" onClick={handleSubmit} disabled={isLoading || !form.name.trim() || !form.propertyType}>
              {isLoading ? 'Creating…' : '+ Create Property'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="cp-rr">
      <span className="cp-rr-label">{label}</span>
      <span className="cp-rr-value">{value || '—'}</span>
    </div>
  );
}
