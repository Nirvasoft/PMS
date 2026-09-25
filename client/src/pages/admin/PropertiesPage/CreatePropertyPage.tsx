import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreatePropertyMutation, useGetPropertyTypesQuery,
  useGetFacilityTypesQuery, useAddFacilityMutation, useUploadPhotosMutation,
} from '../../../store/api/propertiesApi';
import { useGetBranchesQuery } from '../../../store/api/organizationApi';
import { useAppDispatch } from '../../../store';
import { setSelectedProperty } from '../../../store/slices/propertiesSlice';
import {
  ArrowLeft, Building2, MapPin, DollarSign, Info, Check,
  Waves, Dumbbell, Flame, TreePine, Leaf, CircleDot, Activity,
  UserCheck, Users, Monitor, Mail, Wind, UtensilsCrossed, ShoppingBag,
  Camera, Key, Shield, Car, Zap, ArrowUp, Lock, Battery, ImagePlus, X, Upload, Search, Navigation,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './CreatePropertyPage.css';

/** Build a self-contained Leaflet map HTML for use in an srcdoc iframe */
function buildMapSrcdoc(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map { margin:0; padding:0; width:100%; height:100%; }
  body { background: #1a1f2e; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var lat = ${lat}, lng = ${lng};
  var map = L.map('map', { attributionControl: false }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  var marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.bindPopup('Drag to set location').openPopup();

  function sendCoords(la, ln) {
    window.parent.postMessage({ type: 'MAP_COORDS', lat: la, lng: ln }, '*');
  }

  marker.on('dragend', function(e) {
    var pos = e.target.getLatLng();
    sendCoords(pos.lat, pos.lng);
  });

  map.on('click', function(e) {
    marker.setLatLng(e.latlng);
    sendCoords(e.latlng.lat, e.latlng.lng);
  });

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'SET_COORDS') {
      var ll = [e.data.lat, e.data.lng];
      marker.setLatLng(ll);
      map.setView(ll, 15);
    }
  });
</script>
</body>
</html>`;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const SQM_TO_SQFT = 10.7639;

/** ISO currency reference — mirrors CurrencyRatesPage, shows code only in property form */
const ISO_CURRENCY_LIST: { country: string; name: string; code: string }[] = [
  { country: 'UAE',           name: 'UAE Dirham',          code: 'AED' },
  { country: 'Australia',     name: 'Australian Dollar',   code: 'AUD' },
  { country: 'Bangladesh',    name: 'Bangladeshi Taka',    code: 'BDT' },
  { country: 'Bahrain',       name: 'Bahraini Dinar',      code: 'BHD' },
  { country: 'Brazil',        name: 'Brazilian Real',      code: 'BRL' },
  { country: 'Canada',        name: 'Canadian Dollar',     code: 'CAD' },
  { country: 'Switzerland',   name: 'Swiss Franc',         code: 'CHF' },
  { country: 'China',         name: 'Chinese Yuan',        code: 'CNY' },
  { country: 'Denmark',       name: 'Danish Krone',        code: 'DKK' },
  { country: 'Euro Zone',     name: 'Euro',                code: 'EUR' },
  { country: 'UK',            name: 'British Pound',       code: 'GBP' },
  { country: 'Hong Kong',     name: 'Hong Kong Dollar',    code: 'HKD' },
  { country: 'Indonesia',     name: 'Indonesian Rupiah',   code: 'IDR' },
  { country: 'India',         name: 'Indian Rupee',        code: 'INR' },
  { country: 'Japan',         name: 'Japanese Yen',        code: 'JPY' },
  { country: 'Cambodia',      name: 'Cambodian Riel',      code: 'KHR' },
  { country: 'South Korea',   name: 'South Korean Won',    code: 'KRW' },
  { country: 'Kuwait',        name: 'Kuwaiti Dinar',       code: 'KWD' },
  { country: 'Laos',          name: 'Lao Kip',             code: 'LAK' },
  { country: 'Sri Lanka',     name: 'Sri Lankan Rupee',    code: 'LKR' },
  { country: 'Myanmar',       name: 'Myanmar Kyat',        code: 'MMK' },
  { country: 'Malaysia',      name: 'Malaysian Ringgit',   code: 'MYR' },
  { country: 'Norway',        name: 'Norwegian Krone',     code: 'NOK' },
  { country: 'Nepal',         name: 'Nepalese Rupee',      code: 'NPR' },
  { country: 'New Zealand',   name: 'New Zealand Dollar',  code: 'NZD' },
  { country: 'Oman',          name: 'Omani Rial',          code: 'OMR' },
  { country: 'Philippines',   name: 'Philippine Peso',     code: 'PHP' },
  { country: 'Pakistan',      name: 'Pakistani Rupee',     code: 'PKR' },
  { country: 'Qatar',         name: 'Qatari Riyal',        code: 'QAR' },
  { country: 'Saudi Arabia',  name: 'Saudi Riyal',         code: 'SAR' },
  { country: 'Sweden',        name: 'Swedish Krona',       code: 'SEK' },
  { country: 'Singapore',     name: 'Singapore Dollar',    code: 'SGD' },
  { country: 'Thailand',      name: 'Thai Baht',           code: 'THB' },
  { country: 'Turkey',        name: 'Turkish Lira',        code: 'TRY' },
  { country: 'Taiwan',        name: 'Taiwan Dollar',       code: 'TWD' },
  { country: 'USA',           name: 'US Dollar',           code: 'USD' },
  { country: 'Vietnam',       name: 'Vietnamese Dong',     code: 'VND' },
  { country: 'Central Africa',name: 'CFA Franc BEAC',      code: 'XAF' },
  { country: 'South Africa',  name: 'South African Rand',  code: 'ZAR' },
];

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
  billingCycle: 'monthly', billingDay: '1', currency: '', timezone: 'UTC',
};

const STEPS = [
  { n: 1, label: 'Basic Info',    icon: <Info size={15} /> },
  { n: 2, label: 'Address',       icon: <MapPin size={15} /> },
  { n: 3, label: 'Details',       icon: <Building2 size={15} /> },
  { n: 4, label: 'Facilities',    icon: <Shield size={15} /> },
  { n: 5, label: 'Photos',        icon: <Camera size={15} /> },
  { n: 6, label: 'Review',        icon: <DollarSign size={15} /> },
];

const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Asia/Bangkok','Asia/Yangon','Asia/Dubai'];
const COUNTRIES  = ['US','SG','GB','TH','MM','JP','AE','AU','DE','FR','IN','CN'];

/** ISO-2 → currency code — used to auto-select currency when location is detected */
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  AE: 'AED', AU: 'AUD', BD: 'BDT', BH: 'BHD', BR: 'BRL', CA: 'CAD',
  CH: 'CHF', CN: 'CNY', DE: 'EUR', DK: 'DKK', FR: 'EUR', GB: 'GBP',
  HK: 'HKD', ID: 'IDR', IN: 'INR', JP: 'JPY', KH: 'KHR', KR: 'KRW',
  KW: 'KWD', LA: 'LAK', LK: 'LKR', MM: 'MMK', MY: 'MYR', NO: 'NOK',
  NP: 'NPR', NZ: 'NZD', OM: 'OMR', PH: 'PHP', PK: 'PKR', QA: 'QAR',
  SA: 'SAR', SE: 'SEK', SG: 'SGD', TH: 'THB', TR: 'TRY', TW: 'TWD',
  US: 'USD', VN: 'VND', ZA: 'ZAR',
};

/** ISO-2 → IANA timezone — values must exist in the TIMEZONES list */
const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  AE: 'Asia/Dubai',       AU: 'UTC',               BD: 'UTC',
  BH: 'Asia/Dubai',       BR: 'UTC',               CA: 'America/New_York',
  CH: 'Europe/Paris',     CN: 'Asia/Singapore',    DE: 'Europe/Paris',
  DK: 'Europe/Paris',     FR: 'Europe/Paris',      GB: 'Europe/London',
  HK: 'Asia/Singapore',   ID: 'Asia/Singapore',    IN: 'UTC',
  JP: 'Asia/Tokyo',       KH: 'Asia/Bangkok',      KR: 'Asia/Tokyo',
  KW: 'Asia/Dubai',       LA: 'Asia/Bangkok',      LK: 'UTC',
  MM: 'Asia/Yangon',      MY: 'Asia/Singapore',    NO: 'Europe/Paris',
  NP: 'UTC',              NZ: 'UTC',               OM: 'Asia/Dubai',
  PH: 'Asia/Singapore',   PK: 'UTC',               QA: 'Asia/Dubai',
  SA: 'Asia/Dubai',       SE: 'Europe/Paris',      SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',     TR: 'Europe/Paris',      TW: 'Asia/Tokyo',
  US: 'America/New_York', VN: 'Asia/Bangkok',      ZA: 'UTC',
};

export default function CreatePropertyPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
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
  const mapIframeRef = useRef<HTMLIFrameElement>(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [locating, setLocating] = useState(false);
  // Snapshot of coords at the moment step 2 is entered — keeps iframe stable on coord changes
  const mapInitRef = useRef({ lat: 1.3521, lng: 103.8198 });
  const mapSrcdoc = useMemo(() => {
    if (step === 2) {
      // Update snapshot only when step becomes 2
      mapInitRef.current = {
        lat: parseFloat(form.geoLat) || 1.3521,
        lng: parseFloat(form.geoLng) || 103.8198,
      };
    }
    return buildMapSrcdoc(mapInitRef.current.lat, mapInitRef.current.lng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]); // intentionally only re-run when step changes

  // Listen for draggable marker / map-click coords from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'MAP_COORDS') {
        const lat = String(parseFloat(e.data.lat).toFixed(6));
        const lng = String(parseFloat(e.data.lng).toFixed(6));
        setForm(f => ({ ...f, geoLat: lat, geoLng: lng }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Sync typed coordinates back into the iframe marker
  const syncMapMarker = useCallback((lat: string, lng: string) => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!isNaN(la) && !isNaN(ln)) {
      mapIframeRef.current?.contentWindow?.postMessage(
        { type: 'SET_COORDS', lat: la, lng: ln }, '*'
      );
    }
  }, []);

  const detectLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = String(pos.coords.latitude.toFixed(6));
        const lng = String(pos.coords.longitude.toFixed(6));
        setForm(f => ({ ...f, geoLat: lat, geoLng: lng }));
        syncMapMarker(lat, lng);

        // Reverse geocode via Nominatim to auto-fill all address fields
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const addr = data.address || {};

          // Address Line 1: building/amenity name + house number + road
          const roadParts = [
            addr.building || addr.amenity || '',
            [addr.house_number, addr.road].filter(Boolean).join(' '),
          ].filter(Boolean);
          const addressLine1 = roadParts.join(', ');

          // Address Line 2: neighbourhood / suburb / quarter / district
          const addressLine2 = [
            addr.neighbourhood || addr.suburb || addr.quarter || '',
            addr.district || addr.city_district || '',
          ].filter(Boolean).join(', ');

          const countryCode    = (addr.country_code || '').toUpperCase();
          const matchedCountry = COUNTRIES.includes(countryCode) ? countryCode : '';
          const city           = addr.city || addr.town || addr.village || addr.county || '';
          const state          = addr.state || addr.region || '';
          const postalCode     = addr.postcode || '';
          const currency       = COUNTRY_CURRENCY_MAP[countryCode] || '';
          const timezone       = COUNTRY_TIMEZONE_MAP[countryCode] || '';

          setForm(f => ({
            ...f,
            geoLat: lat,
            geoLng: lng,
            ...(addressLine1    && { addressLine1 }),
            ...(addressLine2    && { addressLine2 }),
            ...(matchedCountry  && { country: matchedCountry }),
            ...(state           && { state }),
            ...(city            && { city }),
            ...(postalCode      && { postalCode }),
            ...(currency        && { currency }),
            ...(timezone        && { timezone }),
          }));
          toast.success('Address & location filled from your position');
        } catch {
          // Geocoding failed — coords still set, address fields unchanged
        }
        setLocating(false);
      },
      () => { toast.error('Could not get location'); setLocating(false); }
    );
  };

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
  const setTotalAreaSqm = (v: string) => setForm(f => ({
    ...f, totalAreaSqm: v, totalAreaSqft: v ? (Number(v) * SQM_TO_SQFT).toFixed(2) : '',
  }));
  const setTotalAreaSqft = (v: string) => setForm(f => ({
    ...f, totalAreaSqft: v, totalAreaSqm: v ? (Number(v) / SQM_TO_SQFT).toFixed(2) : '',
  }));

  const canNext = (): boolean => {
    if (step === 1) return !!(form.name.trim() && form.propertyType);
    if (step === 3) {
      const floorsOk = !!(form.totalFloors && Number(form.totalFloors) >= 1 && Number(form.totalFloors) <= 100);
      const maxYear = new Date().getFullYear() + 5;
      const yearOk = form.yearBuilt === '' || (Number(form.yearBuilt) >= 1800 && Number(form.yearBuilt) <= maxYear);
      return floorsOk && yearOk;
    }
    if (step === 6) return !!form.currency;
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
      dispatch(setSelectedProperty(pid));
      navigate(`/admin/properties/${pid}`);
    } catch (e: any) {
      console.error('Create property error:', e);
      toast.error(e?.data?.errors?.[0]?.message || e?.data?.message || 'Failed to create property');
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Address &amp; Location</h3>
              <button type="button" className="cp-btn-locate" onClick={detectLocation} disabled={locating}>
                <Navigation size={13} /> {locating ? 'Locating…' : 'Use My Address & Location'}
              </button>
            </div>
            <div className="cp-grid">
              <div className="cp-field full">
                <label>Address Line 1</label>
                <input placeholder="Street address, building name" value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} />
              </div>
              <div className="cp-field full">
                <label>Address Line 2</label>
                <input placeholder="Floor, unit number, block" value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} />
              </div>
              {/* Row 1: Country | State / Province */}
              <div className="cp-field">
                <label>Country</label>
                <select value={form.country} onChange={e => set('country', e.target.value)}>
                  <option value="">Select country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="cp-field">
                <label>State / Province</label>
                <input placeholder="e.g. Central Region" value={form.state} onChange={e => set('state', e.target.value)} />
              </div>
              {/* Row 2: City | Postal Code */}
              <div className="cp-field">
                <label>City</label>
                <input placeholder="e.g. Singapore" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Postal Code</label>
                <input placeholder="e.g. 018956" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Branch <span className="opt">(optional)</span></label>
                <select value={form.branchId} onChange={e => set('branchId', e.target.value)}>
                  <option value="">No Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="cp-geo-section">
              <label className="cp-geo-label">
                <MapPin size={14} /> Location on Map <span className="opt">(drag the marker or click the map)</span>
              </label>
              <div className="cp-map-container">
                <iframe
                  ref={mapIframeRef}
                  className="cp-map-embed"
                  title="Property Location Map"
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={mapSrcdoc}
                />
              </div>
              <div className="cp-geo-inputs">
                <div className="cp-field">
                  <label>Latitude</label>
                  <input type="number" step="any" placeholder="e.g. 1.2839" value={form.geoLat}
                    onChange={e => {
                      set('geoLat', e.target.value);
                      syncMapMarker(e.target.value, form.geoLng);
                    }} />
                </div>
                <div className="cp-field">
                  <label>Longitude</label>
                  <input type="number" step="any" placeholder="e.g. 103.8607" value={form.geoLng}
                    onChange={e => {
                      set('geoLng', e.target.value);
                      syncMapMarker(form.geoLat, e.target.value);
                    }} />
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
                <input
                  type="number"
                  min={1800}
                  max={new Date().getFullYear() + 5}
                  placeholder="e.g. 2018"
                  value={form.yearBuilt}
                  onChange={e => set('yearBuilt', e.target.value)}
                />
                {form.yearBuilt !== '' && Number(form.yearBuilt) < 1800 && (
                  <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    Year Built cannot be before 1800.
                  </span>
                )}
                {form.yearBuilt !== '' && Number(form.yearBuilt) > new Date().getFullYear() + 5 && (
                  <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    Year Built cannot exceed {new Date().getFullYear() + 5}.
                  </span>
                )}
              </div>
              <div className="cp-field">
                <label>Total Floors *</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="e.g. 32"
                  value={form.totalFloors}
                  onChange={e => set('totalFloors', e.target.value)}
                />
                {form.totalFloors !== '' && Number(form.totalFloors) > 100 && (
                  <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    Maximum allowed is 100 floors.
                  </span>
                )}
              </div>
              <div className="cp-field">
                <label>Total Area (sqm)</label>
                <input type="number" min={0} placeholder="e.g. 12500" value={form.totalAreaSqm} onChange={e => setTotalAreaSqm(e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Total Area (sqft)</label>
                <input type="number" min={0} placeholder="e.g. 134549" value={form.totalAreaSqft} onChange={e => setTotalAreaSqft(e.target.value)} />
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
            <h3>Financial &amp; Review</h3>
            <div className="cp-grid">
              <div className="cp-field">
                <label>Currency *</label>
                <button
                  type="button"
                  className="cp-currency-btn"
                  onClick={() => { setCurrencySearch(''); setShowCurrencyPicker(true); }}
                >
                  {form.currency
                    ? <span className="cp-currency-code">{form.currency}</span>
                    : <span className="cp-currency-placeholder">Select currency…</span>
                  }
                  <Search size={14} className="cp-currency-search-icon" />
                </button>
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
                <ReviewRow label="Total Floors" value={form.totalFloors} />
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
            <PermissionGuard permission="properties.create">
              <button className="cp-btn-submit" onClick={handleSubmit} disabled={isLoading || !form.name.trim() || !form.propertyType || !form.currency}>
                {isLoading ? 'Creating…' : '+ Create Property'}
              </button>
            </PermissionGuard>
          )}
        </div>
      </div>

      {/* ISO Currency Picker Modal */}
      {showCurrencyPicker && (
        <div className="cp-iso-overlay" onClick={() => setShowCurrencyPicker(false)}>
          <div className="cp-iso-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-iso-header">
              <span className="cp-iso-title">Select Currency</span>
              <button type="button" className="cp-iso-close" onClick={() => setShowCurrencyPicker(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="cp-iso-search-wrap">
              <Search size={14} className="cp-iso-search-icon" />
              <input
                autoFocus
                type="text"
                className="cp-iso-search"
                placeholder="Search country, currency or code…"
                value={currencySearch}
                onChange={e => setCurrencySearch(e.target.value)}
              />
              {currencySearch && (
                <button type="button" className="cp-iso-search-clear" onClick={() => setCurrencySearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="cp-iso-table-wrap">
              <table className="cp-iso-table">
                <thead>
                  <tr>
                    <th>Country / Region</th>
                    <th>Currency</th>
                    <th>ISO Code</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = currencySearch.toLowerCase();
                    const filtered = ISO_CURRENCY_LIST.filter(c =>
                      !q || c.country.toLowerCase().includes(q) ||
                      c.name.toLowerCase().includes(q) ||
                      c.code.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) return (
                      <tr><td colSpan={3} className="cp-iso-empty">No currencies match "{currencySearch}"</td></tr>
                    );
                    return filtered.map(c => (
                      <tr
                        key={c.code}
                        className={`cp-iso-row${form.currency === c.code ? ' cp-iso-row--selected' : ''}`}
                        onClick={() => {
                          set('currency', c.code);
                          setShowCurrencyPicker(false);
                        }}
                      >
                        <td className="cp-iso-cell-country">{c.country}</td>
                        <td className="cp-iso-cell-name">{c.name}</td>
                        <td><span className="cp-iso-code-badge">{c.code}</span></td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
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
