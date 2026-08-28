import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateLeadMutation } from '../../../store/api/crmApi';
import { useGetPropertiesQuery, useGetFloorSetupsQuery } from '../../../store/api/propertiesApi';
import { useGetUnitsQuery } from '../../../store/api/unitsApi';
import { ZONE_OPTIONS } from '../PropertyDetailPage/zoneOptions';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import './CreateLeadPage.css';

const LEVEL_OPTIONS: [string, string][] = [
  ['', 'Select…'],
  ['ground_floor', 'Ground Floor'],
  ['first_floor', 'First Floor'],
  ['second_floor', 'Second Floor'],
  ['third_floor', 'Third Floor'],
  ['fourth_floor', 'Fourth Floor'],
  ['basement', 'Basement'],
];

const YES_NO_OPTIONS: [string, string][] = [
  ['yes', 'Yes'],
  ['no', 'No'],
];

export default function CreateLeadPage() {
  const navigate = useNavigate();
  const [createLead, { isLoading }] = useCreateLeadMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', mobile: '',
    propertyId: '', source: 'website', priority: 'medium',
    budgetMin: '', budgetMax: '', unitTypePreference: '', leaseTermMonths: '',
  });

  const [loi, setLoi] = useState({
    // Contract Information
    loiSendDate: '', customerId: '', shopName: '', contractStartDate: '', contractEndDate: '',
    // Applicant Information
    applicantDate: '', center: '',
    businessType: '', doorType: '', priceRange: '', productPlan: '',
    level: '', ceiling: '', layout: '', currentShop: '',
    // Room Details
    floor: '', room: '', roomAreaSqft: '', airconSaleableAreaSqft: '', zone: '',
    advanceRentalRate: '', advanceRentalRateType: 'fixed', rentalPeriodMonths: '',
  });

  const { data: floorSetupsData } = useGetFloorSetupsQuery(
    form.propertyId ? { propertyId: form.propertyId } : undefined,
    { skip: !form.propertyId }
  );
  const floors = floorSetupsData?.data || [];

  const { data: unitsData } = useGetUnitsQuery(
    { propertyId: form.propertyId, floor: Number(loi.floor), limit: 100 },
    { skip: !form.propertyId || !loi.floor }
  );
  const rooms = unitsData?.data || [];

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'propertyId') setLoi((l) => ({ ...l, center: '', floor: '', room: '' }));
  };
  const setLoiField = (key: string, value: string) => {
    setLoi((l) => ({ ...l, [key]: value, ...(key === 'floor' ? { room: '', roomAreaSqft: '' } : {}) }));
  };

  const onRoomChange = (unitNumber: string) => {
    const unit = rooms.find((u) => u.unitNumber === unitNumber);
    setLoi((l) => ({
      ...l,
      room: unitNumber,
      roomAreaSqft: unit?.areaSqft != null ? String(unit.areaSqft) : '',
    }));
  };
  const handleSubmit = async () => {
    if (!form.firstName) { toast.error('Code is required'); return; }
    try {
      const loiDetails: Record<string, unknown> = {};
      Object.entries(loi).forEach(([key, value]) => {
        if (Array.isArray(value) ? value.length > 0 : value !== '') loiDetails[key] = value;
      });

      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        email: form.email || undefined,
        mobile: form.mobile || undefined,
        propertyId: form.propertyId || undefined,
        source: form.source || undefined,
        priority: form.priority,
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
          <h3>Lead Information</h3>
          <div className="form-grid">
            <Field label="Code *" value={form.firstName} onChange={(v) => set('firstName', v)} placeholder="John" />
            <Field label="Name" value={form.lastName} onChange={(v) => set('lastName', v)} placeholder="Doe" />
          </div>
        </div>

        <div className="cl-section">
          <h3>Contact Details</h3>
          <div className="form-grid">
            <Field label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" placeholder="john@email.com" />
            <Field label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} placeholder="+1-555-1234" />
          </div>
        </div>

        <div className="cl-section">
          <h3>Property & Preferences</h3>
          <div className="form-grid">
            <SelectField label="Property" value={form.propertyId} onChange={(v) => set('propertyId', v)}
              options={[['', '— Select property —'], ...properties.map((p: any) => [p.id, p.name] as [string, string])]} span={2} />
            <SelectField label="Source" value={form.source} onChange={(v) => set('source', v)}
              options={[['website', 'Website'], ['walk_in', 'Walk-in'], ['referral', 'Referral'], ['agent', 'Agent'], ['portal', 'Portal']]} />
            <SelectField label="Priority" value={form.priority} onChange={(v) => set('priority', v)}
              options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
            <Field label="Budget Min" value={form.budgetMin} onChange={(v) => set('budgetMin', v)} type="number" placeholder="0" />
            <Field label="Budget Max" value={form.budgetMax} onChange={(v) => set('budgetMax', v)} type="number" placeholder="5000" />
          </div>
        </div>

        <div className="cl-section">
          <h3>Contract Information</h3>
          <div className="form-grid">
            <Field label="LOI Send Date" value={loi.loiSendDate} onChange={(v) => setLoiField('loiSendDate', v)} type="date" />
            <Field label="Customer ID" value={loi.customerId} onChange={(v) => setLoiField('customerId', v)} placeholder="00005" />
            <Field label="Shop Name" value={loi.shopName} onChange={(v) => setLoiField('shopName', v)} span={2} />
            <Field label="Contract Start Date" value={loi.contractStartDate} onChange={(v) => setLoiField('contractStartDate', v)} type="date" />
            <Field label="Contract End Date" value={loi.contractEndDate} onChange={(v) => setLoiField('contractEndDate', v)} type="date" />
          </div>
        </div>

        <div className="cl-section">
          <h3>Applicant Information</h3>
          <div className="form-grid">
            <Field label="Applicant Date" value={loi.applicantDate} onChange={(v) => setLoiField('applicantDate', v)} type="date" />
            <SelectField label="Floor Level" value={loi.center} onChange={(v) => setLoiField('center', v)}
              options={[['', form.propertyId ? 'Select…' : 'Select property first'], ...floors.map((f) => [String(f.floorNumber), f.floorLabel || `Floor ${f.floorNumber}`] as [string, string])]} />
            <SelectField label="Level" value={loi.level} onChange={(v) => setLoiField('level', v)} options={LEVEL_OPTIONS} />
            <RadioGroup label="Ceiling" name="ceiling" value={loi.ceiling} onChange={(v) => setLoiField('ceiling', v)} options={YES_NO_OPTIONS} />
            <RadioGroup label="Layout (If have)" name="layout" value={loi.layout} onChange={(v) => setLoiField('layout', v)} options={YES_NO_OPTIONS} />
            <RadioGroup label="Current Shop (If have)" name="currentShop" value={loi.currentShop} onChange={(v) => setLoiField('currentShop', v)} options={YES_NO_OPTIONS} />
            <SelectField label="Business Type" value={loi.businessType} onChange={(v) => setLoiField('businessType', v)}
              options={[['', 'Select…'], ['private', 'Private'], ['share', 'Share'], ['company', 'Company']]} />
            <SelectField label="Door Type" value={loi.doorType} onChange={(v) => setLoiField('doorType', v)}
              options={[['', 'Select…'], ['glass_door', 'Glass Door'], ['other', 'Other'], ['roller_shutter', 'Roller Shutter']]} />
            <SelectField label="Price Range" value={loi.priceRange} onChange={(v) => setLoiField('priceRange', v)}
              options={[['', 'Select…'], ['under_10000', 'Under 10000'], ['10000_100000', '10000-100000'], ['above_100000', 'Above 100000']]} />
            <SelectField label="Product Plan" value={loi.productPlan} onChange={(v) => setLoiField('productPlan', v)}
              options={[['', 'Select…'], ['100_300', '100-300 Sq.ft'], ['300_500', '300-500 Sq.ft'], ['500_700', '500-700 Sq.ft'], ['700_above', '700 Sq.ft & Above']]} />
          </div>
        </div>

        <div className="cl-section">
          <h3>Room Details</h3>
          <div className="form-grid">
            <SelectField label="Floor" value={loi.floor} onChange={(v) => setLoiField('floor', v)}
              options={[['', form.propertyId ? 'Select…' : 'Select property first'], ...floors.map((f) => [String(f.floorNumber), f.floorLabel || `Floor ${f.floorNumber}`] as [string, string])]} />
            <SelectField label="Room" value={loi.room} onChange={onRoomChange}
              options={[['', loi.floor ? 'Select…' : 'Select floor first'], ...rooms.map((u) => [u.unitNumber, u.unitNumber] as [string, string])]} />
            <Field label="Room Area (Sq.ft)" value={loi.roomAreaSqft} onChange={(v) => setLoiField('roomAreaSqft', v)} type="number"
              placeholder={loi.room && !loi.roomAreaSqft ? 'Not set up for this room' : undefined} />
            <Field label="Aircon Saleable Area (Sq.ft)" value={loi.airconSaleableAreaSqft} onChange={(v) => setLoiField('airconSaleableAreaSqft', v)} type="number" />
            <SelectField label="Zone" value={loi.zone} onChange={(v) => setLoiField('zone', v)}
              options={[['', 'Select…'], ...ZONE_OPTIONS.map((z) => [z, z] as [string, string])]} />
            <Field label="Advance Rental Rate" value={loi.advanceRentalRate} onChange={(v) => setLoiField('advanceRentalRate', v)} type="number" />
            <RadioGroup label="Rate Type" name="advanceRentalRateType" value={loi.advanceRentalRateType} onChange={(v) => setLoiField('advanceRentalRateType', v)}
              options={[['fixed', 'Fixed'], ['per_sqft', 'Per Sq.ft']]} />
            <Field label="Rental Period (Months)" value={loi.rentalPeriodMonths} onChange={(v) => setLoiField('rentalPeriodMonths', v)} type="number" />
          </div>
        </div>
      </div>

      <div className="cl-footer">
        <button className="btn-secondary" onClick={() => navigate('/admin/crm/leads')}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={isLoading || !form.firstName}>
          {isLoading ? 'Creating…' : 'Create Lead'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', span, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; span?: number; placeholder?: string;
}) {
  return (
    <div className="form-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
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
