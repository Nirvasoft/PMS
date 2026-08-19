import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreatePropertyMutation, useGetPropertyTypesQuery,
  useGetFacilityTypesQuery, useAddFacilityMutation, useUploadPhotosMutation,
} from '../../../store/api/propertiesApi';
import { useGetBranchesQuery } from '../../../store/api/organizationApi';
import {
  ArrowLeft, Building2, MapPin, DollarSign, Info, Check,
  Waves, Dumbbell, Flame, TreePine, Leaf, CircleDot, Activity,
  UserCheck, Users, Monitor, Mail, Wind, UtensilsCrossed, ShoppingBag,
  Camera, Key, Shield, Car, Zap, ArrowUp, Lock, Battery, ImagePlus, X, Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './CreatePropertyPage.css';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const ICON_MAP: Record<string, React.ReactNode> = {
  waves: <Waves size={18}/>, dumbbell: <Dumbbell size={18}/>, flame: <Flame size={18}/>,
  playground: <TreePine size={18}/>, leaf: <Leaf size={18}/>, circle: <CircleDot size={18}/>,
  activity: <Activity size={18}/>, 'user-check': <UserCheck size={18}/>, users: <Users size={18}/>,
  monitor: <Monitor size={18}/>, mail: <Mail size={18}/>, wind: <Wind size={18}/>,
  utensils: <UtensilsCrossed size={18}/>, 'shopping-bag': <ShoppingBag size={18}/>,
  camera: <Camera size={18}/>, key: <Key size={18}/>, shield: <Shield size={18}/>,
  car: <Car size={18}/>, zap: <Zap size={18}/>, 'arrow-up': <ArrowUp size={18}/>,
  lock: <Lock size={18}/>, battery: <Battery size={18}/>,
};

interface FormState {
  // Basic
  name: string; code: string; propertyType: string; legalName: string; registrationNo: string; description: string;
  // Address
  addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string; country: string;
  geoLat: string; geoLng: string; branchId: string;
  // Details
  yearBuilt: string; totalFloors: string; totalAreaSqm: string; totalAreaSqft: string;
  // Financial
  billingCycle: string; billingDay: string; currency: string; timezone: string;
}

const INITIAL: FormState = {
  name: '', code: '', propertyType: '', legalName: '', registrationNo: '', description: '',
  addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '',
  geoLat: '', geoLng: '', branchId: '',
  yearBuilt: '', totalFloors: '', totalAreaSqm: '', totalAreaSqft: '',
  billingCycle: 'monthly', billingDay: '1', currency: 'USD', timezone: 'UTC',
};

const STEPS = [
  { n: 1, label: 'Basic Info',    icon: <Info size={15} /> },
  { n: 2, label: 'Address',       icon: <MapPin size={15} /> },
  { n: 3, label: 'Details',       icon: <Building2 size={15} /> },
  { n: 4, label: 'Facilities',    icon: <Shield size={15} /> },
  { n: 5, label: 'Photos',        icon: <Camera size={15} /> },
  { n: 6, label: 'Review',        icon: <DollarSign size={15} /> },
];

const CURRENCIES = ['USD','SGD','EUR','GBP','AED','THB','MMK','JPY','CNY','INR'];
const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Asia/Bangkok','Asia/Yangon','Asia/Dubai'];
const COUNTRIES  = ['US','SG','GB','TH','MM','JP','AE','AU','DE','FR','IN','CN'];

export default function CreatePropertyPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [createProperty, { isLoading }] = useCreatePropertyMutation();
  const [addFacility] = useAddFacilityMutation();
  const [uploadPhotos] = useUploadPhotosMutation();
  const { data: typesData } = useGetPropertyTypesQuery();
  const { data: ftData } = useGetFacilityTypesQuery();
  const { data: branchesData } = useGetBranchesQuery();
  const types = typesData?.data || [];
  const branches = branchesData?.data || [];
  const facilityTypes = ftData?.data || [];
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFacility = (id: string) => {
    setSelectedFacilities(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePhotoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setPhotoFiles(prev => [...prev, ...files].slice(0, 10));
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    setPhotoFiles(prev => [...prev, ...files].slice(0, 10));
    e.target.value = '';
  };

  const removePhoto = (idx: number) => setPhotoFiles(prev => prev.filter((_, i) => i !== idx));

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  const canNext = (): boolean => {
    if (step === 1) return !!(form.name.trim() && form.propertyType);
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
      branchId:       form.branchId      || undefined,
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
      const pid = res.data.id;

      // Add facilities
      for (const ftId of selectedFacilities) {
        try { await addFacility({ propertyId: pid, data: { facilityTypeId: ftId } }).unwrap(); } catch {}
      }

      // Upload photos
      if (photoFiles.length > 0) {
        const fd = new FormData();
        photoFiles.forEach(f => fd.append('photos', f));
        try { await uploadPhotos({ propertyId: pid, formData: fd }).unwrap(); } catch {}
      }

      toast.success(`Property "${res.data.name}" created`);
      navigate(`/admin/properties/${pid}`);
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
            {s.n < 6 && <div className="cp-step-line" />}
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
              <div className="cp-field">
                <label>Branch <span className="opt">(optional)</span></label>
                <select value={form.branchId} onChange={e => set('branchId', e.target.value)}>
                  <option value="">— No Branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="cp-geo-section">
              <label className="cp-geo-label">
                <MapPin size={14} /> Location on Map <span className="opt">(click map or enter coordinates)</span>
              </label>
              <div className="cp-map-container">
                {form.geoLat && form.geoLng ? (
                  <iframe
                    className="cp-map-embed"
                    title="Property Map"
                    src={`https://maps.google.com/maps?q=${form.geoLat},${form.geoLng}&z=16&output=embed`}
                    loading="lazy"
                    allowFullScreen
                  />
                ) : (
                  <div className="cp-map-placeholder" onClick={() => {
                    /* Default to Singapore if empty */
                    set('geoLat', '1.3521');
                    set('geoLng', '103.8198');
                  }}>
                    <MapPin size={32} />
                    <span>Click to set location on map</span>
                    <span className="hint">Or enter coordinates below</span>
                  </div>
                )}
              </div>
              <div className="cp-geo-inputs">
                <div className="cp-field">
                  <label>Latitude</label>
                  <input type="number" step="any" placeholder="e.g. 1.2839" value={form.geoLat}
                    onChange={e => set('geoLat', e.target.value)} />
                </div>
                <div className="cp-field">
                  <label>Longitude</label>
                  <input type="number" step="any" placeholder="e.g. 103.8607" value={form.geoLng}
                    onChange={e => set('geoLng', e.target.value)} />
                </div>
                {form.geoLat && form.geoLng && (
                  <button type="button" className="btn-text-danger" onClick={() => {
                    set('geoLat', '');
                    set('geoLng', '');
                  }}>
                    <X size={12} /> Clear
                  </button>
                )}
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
          </div>
        )}

        {step === 4 && (
          <div className="cp-section">
            <h3>Facilities</h3>
            <p className="cp-subtitle">Select the facilities available at this property</p>
            {(['recreation','convenience','security','utility'] as const).map(cat => {
              const items = facilityTypes.filter(ft => ft.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="cp-fac-group">
                  <div className="cp-fac-cat">{cat}</div>
                  <div className="cp-fac-grid">
                    {items.map(ft => (
                      <button key={ft.id} type="button"
                        className={`cp-fac-card ${selectedFacilities.includes(ft.id) ? 'selected' : ''}`}
                        onClick={() => toggleFacility(ft.id)}>
                        <div className="cp-fac-icon">{ICON_MAP[ft.icon || ''] || <Shield size={18}/>}</div>
                        <span className="cp-fac-name">{ft.name}</span>
                        {selectedFacilities.includes(ft.id) && <Check size={14} className="cp-fac-check" />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {selectedFacilities.length > 0 && (
              <div className="cp-hint">✅ {selectedFacilities.length} facilities selected</div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="cp-section">
            <h3>Photos</h3>
            <p className="cp-subtitle">Upload property photos (max 10). First photo becomes the cover.</p>
            <div className="cp-drop-zone"
              onDragOver={e => e.preventDefault()}
              onDrop={handlePhotoDrop}
              onClick={() => fileInputRef.current?.click()}>
              <Upload size={28} />
              <span>Drag & drop images here or click to browse</span>
              <span className="cp-drop-hint">JPG, PNG, WebP — max 10 files</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoSelect} />
            </div>
            {photoFiles.length > 0 && (
              <div className="cp-photo-grid">
                {photoFiles.map((f, i) => (
                  <div key={i} className="cp-photo-thumb">
                    <img src={URL.createObjectURL(f)} alt={f.name} />
                    {i === 0 && <span className="cp-cover-badge">Cover</span>}
                    <button className="cp-photo-remove" onClick={() => removePhoto(i)}><X size={12}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="cp-section">
            <h3>Financial & Review</h3>
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
            <div className="cp-review">
              <div className="cp-review-title">Review before creating</div>
              <div className="cp-review-grid">
                <ReviewRow label="Name" value={form.name} />
                <ReviewRow label="Type" value={form.propertyType} />
                <ReviewRow label="Code" value={form.code || 'Auto-generated'} />
                <ReviewRow label="Location" value={[form.city, form.country].filter(Boolean).join(', ') || '—'} />
                <ReviewRow label="Branch" value={branches.find(b => b.id === form.branchId)?.name || '—'} />
                <ReviewRow label="Facilities" value={`${selectedFacilities.length} selected`} />
                <ReviewRow label="Photos" value={`${photoFiles.length} uploaded`} />
                <ReviewRow label="Currency" value={form.currency} />
                <ReviewRow label="Billing" value={`${form.billingCycle}, day ${form.billingDay}`} />
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
          {step < 6 ? (
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
