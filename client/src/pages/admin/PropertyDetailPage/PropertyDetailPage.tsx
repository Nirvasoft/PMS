import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useGetPropertyQuery, useGetStatusHistoryQuery,
  useUpdatePropertyStatusMutation, useGetPhotosQuery,
  useGetFacilitiesQuery, useGetContactsQuery,
  useSetCoverPhotoMutation, useDeletePhotoMutation,
  useAddFacilityMutation, useRemoveFacilityMutation,
  useAddContactMutation, useRemoveContactMutation, useUpdateContactMutation,
  useGetFacilityTypesQuery, useUploadPhotosMutation,
  useUpdatePropertyMutation, useReorderPhotosMutation,
} from '../../../store/api/propertiesApi';
import { useGetLeasesQuery } from '../../../store/api/leasesApi';
import { useGetDocumentsQuery } from '../../../store/api/documentsApi';
import { useGetInvoicesQuery, useGetBillingSchedulesQuery } from '../../../store/api/billingApi';
import UnitsTab from './UnitsTab';
import {
  ArrowLeft, Building2, MapPin, Calendar, Users, Phone, Mail,
  Settings2, Globe, Clock, Star, Trash2, Plus, Upload, CheckCircle,
  AlertCircle, Wrench, ChevronRight, ChevronLeft, X, Camera, Tag, Edit3, GripVertical,
  Waves, Dumbbell, Flame, TreePine, Lock, Zap, Car, Coffee, FileText, DollarSign, Briefcase,
  Wifi, Shield, ArrowUp, ShoppingBag, UtensilsCrossed, MonitorSmartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import './PropertyDetailPage.css';

type Tab = 'overview' | 'units' | 'leases' | 'documents' | 'facilities' | 'contacts' | 'photos' | 'history' | 'finance' | 'settings';

const STATUS_TRANSITIONS: Record<string, Array<{ value: string; label: string }>> = {
  active:           [{ value: 'under_renovation', label: 'Put Under Renovation' }, { value: 'decommissioned', label: 'Decommission' }],
  under_renovation: [{ value: 'active', label: 'Mark Active' }, { value: 'decommissioned', label: 'Decommission' }],
  decommissioned:   [],
};

const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  active:           { bg: 'rgba(46,204,113,0.12)', color: '#2ecc71' },
  under_renovation: { bg: 'rgba(243,156,18,0.12)', color: '#f39c12' },
  decommissioned:   { bg: 'rgba(231,76,60,0.12)', color: '#e74c3c' },
};

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');

  const { data: propertyData, isLoading } = useGetPropertyQuery(id!);
  const property = propertyData?.data;

  const [updateStatus] = useUpdatePropertyStatusMutation();

  const handleStatusChange = async () => {
    if (!newStatus) return;
    try {
      await updateStatus({ id: id!, status: newStatus, reason: statusReason || undefined }).unwrap();
      toast.success('Property status updated');
      setStatusModal(false);
      setStatusReason('');
      setNewStatus('');
    } catch { toast.error('Failed to update status'); }
  };

  if (isLoading) return <div className="detail-loading"><div className="loading-pulse" /></div>;
  if (!property) return (
    <div className="detail-not-found">
      <AlertCircle size={48} />
      <h3>Property not found</h3>
      <button onClick={() => navigate('/admin/properties')}>Back to Properties</button>
    </div>
  );

  const statusStyle = STATUS_BADGE_STYLE[property.status] || { bg: 'rgba(255,255,255,0.1)', color: '#fff' };
  const transitions = STATUS_TRANSITIONS[property.status] || [];

  return (
    <div className="property-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate('/admin/properties')}><ArrowLeft size={16} /> Properties</button>

        <div className="detail-title">
          <div className="property-cover-thumb">
            {property.coverImageUrl
              ? <img src={property.coverImageUrl} alt={property.name} />
              : <Building2 size={28} />}
          </div>
          <div>
            <h1>{property.name}</h1>
            <div className="property-meta">
              {property.code && <span className="meta-code">{property.code}</span>}
              <span className="meta-type">{property.propertyType.replace(/_/g, ' ')}</span>
              {property.city && <span className="meta-location"><MapPin size={12} /> {[property.city, property.country].filter(Boolean).join(', ')}</span>}
            </div>
          </div>
        </div>

        <div className="detail-header-actions">
          <div className="status-chip" style={{ background: statusStyle.bg, color: statusStyle.color }}>
            {property.status.replace(/_/g, ' ')}
          </div>
          {transitions.length > 0 && (
            <div className="status-actions">
              {transitions.map((t) => (
                <button key={t.value} className="btn-status" onClick={() => { setNewStatus(t.value); setStatusModal(true); }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="stats-bar">
        <div className="stat-item"><span className="stat-val">{property.totalUnits}</span><span className="stat-lbl">Total Units</span></div>
        <div className="stat-item"><span className="stat-val">0</span><span className="stat-lbl">Occupied</span></div>
        <div className="stat-item"><span className="stat-val">0%</span><span className="stat-lbl">Occupancy</span></div>
        <div className="stat-item"><span className="stat-val">{property.currency}</span><span className="stat-lbl">Currency</span></div>
        <div className="stat-item"><span className="stat-val">{property.billingCycle}</span><span className="stat-lbl">Billing Cycle</span></div>
        {property.yearBuilt && <div className="stat-item"><span className="stat-val">{property.yearBuilt}</span><span className="stat-lbl">Year Built</span></div>}
        {property.totalFloors && <div className="stat-item"><span className="stat-val">{property.totalFloors}</span><span className="stat-lbl">Floors</span></div>}
      </div>

      {/* Tab navigation */}
      <div className="detail-tabs">
        {(['overview', 'units', 'leases', 'documents', 'facilities', 'contacts', 'photos', 'history', 'finance', 'settings'] as Tab[]).map((tab) => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`detail-content${activeTab === 'units' ? ' units-content' : ''}`}>
        {activeTab === 'overview' && <OverviewTab property={property} />}
        {activeTab === 'units' && <UnitsTab />}
        {activeTab === 'leases' && <LeasesTab propertyId={id!} />}
        {activeTab === 'documents' && <DocumentsTab propertyId={id!} />}
        {activeTab === 'facilities' && <FacilitiesTab propertyId={id!} />}
        {activeTab === 'contacts' && <ContactsTab propertyId={id!} />}
        {activeTab === 'photos' && <PhotosTab propertyId={id!} />}
        {activeTab === 'history' && <HistoryTab propertyId={id!} />}
        {activeTab === 'finance' && <FinanceTab property={property} />}
        {activeTab === 'settings' && <SettingsTab property={property} />}
      </div>

      {/* Status change modal */}
      {statusModal && (
        <div className="modal-overlay" onClick={() => setStatusModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Status</h3>
              <button onClick={() => setStatusModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>Changing status to: <strong>{newStatus.replace(/_/g, ' ')}</strong></p>
              <label>Reason (optional)</label>
              <textarea
                placeholder="Provide a reason for this status change..."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setStatusModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleStatusChange}>Confirm Change</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────
function OverviewTab({ property }: { property: any }) {
  return (
    <div className="overview-grid">
      {/* Location card */}
      <div className="info-card">
        <h4><MapPin size={16} /> Address</h4>
        <div className="info-rows">
          {property.addressLine1 && <div className="info-row"><span>{property.addressLine1}</span></div>}
          {property.addressLine2 && <div className="info-row"><span>{property.addressLine2}</span></div>}
          {(property.city || property.state) && <div className="info-row"><span>{[property.city, property.state, property.postalCode].filter(Boolean).join(', ')}</span></div>}
          {property.country && <div className="info-row"><span>{property.country}</span></div>}
        </div>
        {property.geoLat && property.geoLng && (
          <div className="map-preview">
            <iframe
              title="Property Map"
              src={`https://maps.google.com/maps?q=${property.geoLat},${property.geoLng}&z=15&output=embed`}
              style={{ border: 0, borderRadius: 8, width: '100%', height: 160 }}
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Property details */}
      <div className="info-card">
        <h4><Building2 size={16} /> Property Details</h4>
        <div className="info-rows">
          {property.legalName && <div className="info-row"><span className="label">Legal Name</span><span>{property.legalName}</span></div>}
          {property.registrationNo && <div className="info-row"><span className="label">Registration No.</span><span>{property.registrationNo}</span></div>}
          {property.yearBuilt && <div className="info-row"><span className="label">Year Built</span><span>{property.yearBuilt}</span></div>}
          {property.totalFloors && <div className="info-row"><span className="label">Total Floors</span><span>{property.totalFloors}</span></div>}
          {property.totalAreaSqm && <div className="info-row"><span className="label">Area (sqm)</span><span>{Number(property.totalAreaSqm).toLocaleString()}</span></div>}
          {property.totalAreaSqft && <div className="info-row"><span className="label">Area (sqft)</span><span>{Number(property.totalAreaSqft).toLocaleString()}</span></div>}
        </div>
      </div>

      {/* Manager */}
      {property.manager && (
        <div className="info-card">
          <h4><Users size={16} /> Property Manager</h4>
          <div className="manager-card">
            <div className="manager-avatar">
              {property.manager.profile
                ? `${property.manager.profile.firstName[0]}${property.manager.profile.lastName[0]}`
                : property.manager.email[0].toUpperCase()}
            </div>
            <div>
              <div className="manager-name">
                {property.manager.profile
                  ? `${property.manager.profile.firstName} ${property.manager.profile.lastName}`
                  : property.manager.email}
              </div>
              <div className="manager-email">{property.manager.email}</div>
            </div>
          </div>
        </div>
      )}

      {/* Billing */}
      <div className="info-card">
        <h4><Calendar size={16} /> Billing Settings</h4>
        <div className="info-rows">
          <div className="info-row"><span className="label">Cycle</span><span className="capitalize">{property.billingCycle}</span></div>
          <div className="info-row"><span className="label">Day of Month</span><span>{property.billingDay}</span></div>
          <div className="info-row"><span className="label">Currency</span><span>{property.currency}</span></div>
          <div className="info-row"><span className="label">Timezone</span><span>{property.timezone}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Facility helpers ─────────────────────────
const FACILITY_ICONS: Record<string, JSX.Element> = {
  waves:          <Waves size={18} />,
  dumbbell:       <Dumbbell size={18} />,
  flame:          <Flame size={18} />,
  playground:     <TreePine size={18} />,
  parking:        <Car size={18} />,
  concierge:      <Coffee size={18} />,
  meeting_room:   <Users size={18} />,
  rooftop:        <TreePine size={18} />,
  locker:         <Lock size={18} />,
  ev_charging:    <Zap size={18} />,
  cctv:           <Shield size={18} />,
  access_control: <Lock size={18} />,
  elevator:       <ArrowUp size={18} />,
  laundry:        <ShoppingBag size={18} />,
  mailroom:       <Coffee size={18} />,
  coworking:      <MonitorSmartphone size={18} />,
  restaurant:     <UtensilsCrossed size={18} />,
  retail:         <ShoppingBag size={18} />,
  wifi:           <Wifi size={18} />,
};
const FACILITY_CAT_COLORS: Record<string, string> = {
  recreation:  '#6c5ce7',
  convenience: '#0984e3',
  security:    '#e74c3c',
  utility:     '#00b894',
};

// ─── Facilities Tab ───────────────────────────
function FacilitiesTab({ propertyId }: { propertyId: string }) {
  const confirmDialog = useConfirm();
  const { data } = useGetFacilitiesQuery(propertyId);
  const { data: typesData } = useGetFacilityTypesQuery();
  const [addFacility] = useAddFacilityMutation();
  const [removeFacility] = useRemoveFacilityMutation();
  const [adding, setAdding] = useState(false);
  const [fForm, setFForm] = useState({
    facilityTypeId: '', name: '', floor: '',
    capacity: '', isBookable: false, bookingAdvanceDays: '7',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const facilities = data?.data || [];
  const facilityTypes = typesData?.data || [];
  const assigned = new Set(facilities.map((f) => f.facilityTypeId));

  const resetForm = () => setFForm({ facilityTypeId: '', name: '', floor: '', capacity: '', isBookable: false, bookingAdvanceDays: '7' });

  const handleAdd = async () => {
    if (!fForm.facilityTypeId) { toast.error('Please select a facility type'); return; }
    setIsSubmitting(true);
    try {
      await addFacility({
        propertyId,
        data: {
          facilityTypeId: fForm.facilityTypeId,
          name:           fForm.name.trim() || undefined,
          floor:          fForm.floor.trim() || undefined,
          capacity:       fForm.capacity ? Number(fForm.capacity) : undefined,
          isBookable:     fForm.isBookable,
          bookingAdvanceDays: fForm.isBookable ? Number(fForm.bookingAdvanceDays) : undefined,
        },
      }).unwrap();
      toast.success('Facility added');
      setAdding(false);
      resetForm();
    } catch { toast.error('Failed to add facility'); }
    finally { setIsSubmitting(false); }
  };

  const handleRemove = async (facilityId: string) => {
    if (!(await confirmDialog('Remove this facility?', { danger: true, confirmText: 'Remove' }))) return;
    try { await removeFacility({ propertyId, facilityId }).unwrap(); toast.success('Removed'); }
    catch { toast.error('Failed to remove'); }
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Facilities &amp; Amenities</h3>
        <button className="btn-secondary" onClick={() => { setAdding(!adding); if (adding) resetForm(); }}>
          <Plus size={14} /> Add Facility
        </button>
      </div>

      {adding && (
        <div className="rich-facility-form">
          <div className="rff-row">
            <div className="rff-field rff-grow">
              <label>Facility Type *</label>
              <select value={fForm.facilityTypeId} onChange={e => setFForm(f => ({ ...f, facilityTypeId: e.target.value }))}>
                <option value="">Select type…</option>
                {facilityTypes.filter(t => !assigned.has(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                ))}
              </select>
            </div>
            <div className="rff-field rff-grow">
              <label>Display Name <span className="rff-opt">(optional override)</span></label>
              <input
                placeholder={facilityTypes.find(t => t.id === fForm.facilityTypeId)?.name || 'e.g. Rooftop Pool'}
                value={fForm.name}
                onChange={e => setFForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="rff-row">
            <div className="rff-field">
              <label>Floor / Location</label>
              <input placeholder="e.g. B1 or 30F" value={fForm.floor} onChange={e => setFForm(f => ({ ...f, floor: e.target.value }))} />
            </div>
            <div className="rff-field">
              <label>Capacity <span className="rff-opt">(persons)</span></label>
              <input type="number" min={0} placeholder="e.g. 50" value={fForm.capacity} onChange={e => setFForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
          </div>
          <div className="rff-row rff-check-row">
            <label className="rff-checkbox-label">
              <input
                type="checkbox"
                checked={fForm.isBookable}
                onChange={e => setFForm(f => ({ ...f, isBookable: e.target.checked }))}
              />
              <CheckCircle size={14} /> Bookable by tenants
            </label>
            {fForm.isBookable && (
              <div className="rff-field">
                <label>Advance booking (days)</label>
                <input type="number" min={1} max={90} value={fForm.bookingAdvanceDays}
                  onChange={e => setFForm(f => ({ ...f, bookingAdvanceDays: e.target.value }))} style={{ width: 80 }} />
              </div>
            )}
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleAdd} disabled={isSubmitting}>
              <Plus size={14} /> {isSubmitting ? 'Adding…' : 'Add Facility'}
            </button>
            <button className="btn-ghost" onClick={() => { setAdding(false); resetForm(); }}>Cancel</button>
          </div>
        </div>
      )}

      {facilities.length === 0 ? (
        <div className="empty-section">No facilities configured yet</div>
      ) : (
        <div className="facilities-grid">
          {facilities.map((f) => {
            const iconKey = f.facilityType?.icon || '';
            const catColor = FACILITY_CAT_COLORS[f.facilityType?.category || ''] || '#6c5ce7';
            return (
              <div key={f.id} className="facility-card">
                <div className="facility-icon" style={{ background: `${catColor}18`, color: catColor }}>
                  {FACILITY_ICONS[iconKey] || <Wrench size={18} />}
                </div>
                <div className="facility-info">
                  <span className="facility-name">{f.name || f.facilityType?.name}</span>
                  <span className="facility-category">{f.facilityType?.category}</span>
                  <div className="facility-meta">
                    {f.floor    && <span className="facility-floor"><MapPin size={10} /> {f.floor}</span>}
                    {f.capacity && <span className="facility-capacity"><Users size={10} /> {f.capacity} cap.</span>}
                  </div>
                  {f.isBookable && (
                    <span className="facility-bookable">
                      <CheckCircle size={11} /> Bookable · {f.bookingAdvanceDays ?? 7}d advance
                    </span>
                  )}
                </div>
                <button className="remove-btn" onClick={() => handleRemove(f.id)}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Contact helpers ──────────────────────────
const CONTACT_ROLES = [
  { value: 'building_manager', label: 'Building Manager' },
  { value: 'security',         label: 'Security' },
  { value: 'maintenance',      label: 'Maintenance' },
  { value: 'emergency',        label: 'Emergency' },
  { value: 'leasing',          label: 'Leasing Agent' },
  { value: 'other',            label: 'Other' },
];
const BLANK_CONTACT = { role: 'building_manager', name: '', phone: '', mobile: '', email: '', isPrimary: false };

// ─── Contacts Tab ─────────────────────────────
function ContactsTab({ propertyId }: { propertyId: string }) {
  const confirmDialog = useConfirm();
  const { data } = useGetContactsQuery(propertyId);
  const [addContact] = useAddContactMutation();
  const [updateContact] = useUpdateContactMutation();
  const [removeContact] = useRemoveContactMutation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_CONTACT });
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  const contacts = data?.data || [];

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setIsAdding(true);
    try {
      if (editingId) {
        await updateContact({ propertyId, contactId: editingId, data: { ...form, name: form.name.trim() } }).unwrap();
        toast.success('Contact updated');
      } else {
        await addContact({ propertyId, data: { ...form, name: form.name.trim() } }).unwrap();
        toast.success('Contact added');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...BLANK_CONTACT });
    } catch { toast.error('Failed to save contact'); }
    finally { setIsAdding(false); }
  };

  const handleEdit = (c: typeof contacts[0]) => {
    setEditingId(c.id);
    setForm({ role: c.role, name: c.name, phone: c.phone || '', mobile: c.mobile || '', email: c.email || '', isPrimary: c.isPrimary });
    setShowForm(true);
  };

  const handleRemove = async (contactId: string) => {
    if (!(await confirmDialog('Remove this contact?', { danger: true, confirmText: 'Remove' }))) return;
    setIsRemoving(contactId);
    try { await removeContact({ propertyId, contactId }).unwrap(); toast.success('Removed'); }
    catch { toast.error('Failed'); }
    finally { setIsRemoving(null); }
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Key Contacts</h3>
        <button className="btn-secondary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ ...BLANK_CONTACT }); }}>
          <Plus size={14} /> {showForm ? 'Cancel' : 'Add Contact'}
        </button>
      </div>

      {showForm && (
        <div className="contact-form">
          <div className="contact-form-title">{editingId ? 'Edit Contact' : 'New Contact'}</div>
          {/* Row 1: Role + Name */}
          <div className="form-row">
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input placeholder="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          {/* Row 2: Phone + Mobile + Email */}
          <div className="form-row">
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Mobile" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          {/* Row 3: isPrimary */}
          <div className="form-row form-check-row">
            <label className="contact-primary-label">
              <input type="checkbox" checked={form.isPrimary} onChange={e => setForm({ ...form, isPrimary: e.target.checked })} />
              <Star size={13} /> Mark as primary contact
            </label>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSave} disabled={isAdding}>
              {isAdding ? 'Saving…' : editingId ? 'Update Contact' : 'Save Contact'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {contacts.length === 0
        ? <div className="empty-section">No contacts added yet</div>
        : <div className="contacts-list">
            {contacts.map((c) => (
              <div key={c.id} className="contact-card">
                {c.isPrimary && <span className="primary-badge"><Star size={11} /> Primary</span>}
                <div className="contact-avatar" style={{ background: c.isPrimary ? 'rgba(243,156,18,0.15)' : 'rgba(108,92,231,0.12)', color: c.isPrimary ? '#f39c12' : '#6c5ce7' }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="contact-body">
                  <div className="contact-role">{CONTACT_ROLES.find(r => r.value === c.role)?.label || c.role.replace(/_/g, ' ')}</div>
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-details">
                    {c.phone  && <span><Phone size={12} /> {c.phone}</span>}
                    {c.mobile && <span><Phone size={12} /> {c.mobile} <span className="contact-tag">mob</span></span>}
                    {c.email  && <span><Mail size={12} /> {c.email}</span>}
                  </div>
                </div>
                <div className="contact-card-actions">
                  <button className="edit-btn" title="Edit" onClick={() => handleEdit(c)}><Edit3 size={14} /></button>
                  <button className="remove-btn" disabled={isRemoving === c.id} onClick={() => handleRemove(c.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── Photos Tab ───────────────────────────────
function PhotosTab({ propertyId }: { propertyId: string }) {
  const confirmDialog = useConfirm();
  const { data } = useGetPhotosQuery(propertyId);
  const [uploadPhotos] = useUploadPhotosMutation();
  const [setCover] = useSetCoverPhotoMutation();
  const [deletePhoto] = useDeletePhotoMutation();
  const [reorderPhotos] = useReorderPhotosMutation();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const photos = [...(data?.data || [])].sort((a, b) => {
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('photos', f));
    try {
      await uploadPhotos({ propertyId, formData }).unwrap();
      toast.success(`${files.length} photo(s) uploaded`);
    } catch { toast.error('Upload failed'); }
    e.target.value = '';
  };

  // ── DnD handlers ──
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    // Reorder locally then send to API
    const reordered = [...photos];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const newOrder = reordered.map((p) => p.id);
    setDragIdx(null);
    setDragOverIdx(null);
    try {
      await reorderPhotos({ propertyId, order: newOrder }).unwrap();
      toast.success('Photo order saved');
    } catch { toast.error('Failed to reorder'); }
  }, [dragIdx, photos, propertyId, reorderPhotos]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // ── Lightbox keyboard navigation ──
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      else if (e.key === 'ArrowRight' && lightboxIdx < photos.length - 1) setLightboxIdx(lightboxIdx + 1);
      else if (e.key === 'ArrowLeft' && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, photos.length]);

  // Focus lightbox on open for keyboard events
  useEffect(() => {
    if (lightboxIdx !== null) lightboxRef.current?.focus();
  }, [lightboxIdx]);

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Photo Gallery</h3>
        <div className="section-header-actions">
          {photos.length > 1 && <span className="drag-hint"><GripVertical size={12} /> Drag to reorder</span>}
          <label className="btn-secondary upload-label">
            <Upload size={14} /> Upload Photos
            <input type="file" multiple accept="image/*" hidden onChange={handleUpload} />
          </label>
        </div>
      </div>

      {photos.length === 0
        ? <div className="empty-section"><Camera size={32} /><p>No photos uploaded yet</p></div>
        : <div className="photos-grid">
            {photos.map((photo, idx) => (
              <div
                key={photo.id}
                className={`photo-card${photo.isCover ? ' is-cover' : ''}${dragIdx === idx ? ' dragging' : ''}${dragOverIdx === idx ? ' drag-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
              >
                <div className="photo-drag-handle"><GripVertical size={14} /></div>
                <img src={photo.url} alt="" loading="lazy" onClick={() => setLightboxIdx(idx)} />
                <div className="photo-sort-badge">#{idx + 1}</div>
                {photo.isCover && <div className="cover-badge"><Star size={12} /> Cover</div>}
                <div className="photo-actions">
                  {!photo.isCover && (
                    <button title="Set as cover" onClick={async () => {
                      try { await setCover({ propertyId, photoId: photo.id }).unwrap(); toast.success('Cover updated'); }
                      catch { toast.error('Failed'); }
                    }}><Star size={14} /></button>
                  )}
                  <button className="danger" title="Delete" onClick={async () => {
                    if (!(await confirmDialog('Delete this photo?', { danger: true, confirmText: 'Delete' }))) return;
                    try { await deletePhoto({ propertyId, photoId: photo.id }).unwrap(); toast.success('Deleted'); }
                    catch { toast.error('Failed'); }
                  }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
      }

      {/* Enhanced Lightbox with prev/next */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div className="lightbox" ref={lightboxRef} tabIndex={-1} onClick={() => setLightboxIdx(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {lightboxIdx > 0 && (
              <button className="lightbox-nav lightbox-prev" onClick={() => setLightboxIdx(lightboxIdx - 1)}>
                <ChevronLeft size={28} />
              </button>
            )}
            <img src={photos[lightboxIdx].url} alt="Full size" />
            {lightboxIdx < photos.length - 1 && (
              <button className="lightbox-nav lightbox-next" onClick={() => setLightboxIdx(lightboxIdx + 1)}>
                <ChevronRight size={28} />
              </button>
            )}
            <div className="lightbox-counter">
              {lightboxIdx + 1} / {photos.length}
            </div>
          </div>
          <button className="lightbox-close" onClick={() => setLightboxIdx(null)}><X size={24} /></button>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────
function HistoryTab({ propertyId }: { propertyId: string }) {
  const { data } = useGetStatusHistoryQuery(propertyId);
  const history = data?.data || [];

  return (
    <div className="tab-section">
      <h3>Status History</h3>
      {history.length === 0
        ? <div className="empty-section">No status changes recorded</div>
        : <div className="history-list">
            {history.map((h) => (
              <div key={h.id} className="history-item">
                <div className="history-dot" />
                <div className="history-body">
                  <div className="history-change">
                    {h.fromStatus ? <span className="from-status">{h.fromStatus.replace(/_/g, ' ')}</span> : <span className="from-status">—</span>}
                    <ChevronRight size={14} />
                    <span className="to-status">{h.toStatus.replace(/_/g, ' ')}</span>
                  </div>
                  {h.reason && <p className="history-reason">{h.reason}</p>}
                  <div className="history-meta">
                    {h.changedByUser && (
                      <span>by {h.changedByUser.profile
                        ? `${h.changedByUser.profile.firstName} ${h.changedByUser.profile.lastName}`
                        : h.changedByUser.email}</span>
                    )}
                    <span>{new Date(h.changedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────
const BILLING_CYCLES = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',      label: 'Annual' },
];
const CURRENCIES = ['USD','SGD','EUR','GBP','AED','THB','MMK','JPY','CNY','INR','AUD'];
const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Asia/Bangkok','Asia/Yangon','Asia/Dubai','Australia/Sydney'];

function SettingsTab({ property }: { property: any }) {
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();
  const [form, setForm] = useState({
    billingCycle: property.billingCycle || 'monthly',
    billingDay:   String(property.billingDay || 1),
    currency:     property.currency || 'USD',
    timezone:     property.timezone || 'UTC',
  });
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const handleSave = async () => {
    const day = Number(form.billingDay);
    if (isNaN(day) || day < 1 || day > 28) {
      toast.error('Billing day must be between 1 and 28');
      return;
    }
    try {
      await updateProperty({
        id: property.id,
        data: {
          billingCycle: form.billingCycle,
          billingDay:   day,
          currency:     form.currency,
          timezone:     form.timezone,
        },
      }).unwrap();
      toast.success('Settings saved');
      setSaved(true);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to save settings');
    }
  };

  return (
    <div className="tab-section settings-tab">
      <div className="section-header">
        <h3>Property Settings</h3>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isLoading}
          style={{ gap: 6 }}
        >
          {isLoading ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      <div className="settings-form">
        {/* Billing Cycle */}
        <div className="settings-field">
          <label className="settings-field-label">
            <Calendar size={14} /> Billing Cycle
          </label>
          <div className="settings-field-desc">How often invoices are generated for this property</div>
          <select
            className="settings-select"
            value={form.billingCycle}
            onChange={e => set('billingCycle', e.target.value)}
          >
            {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Billing Day */}
        <div className="settings-field">
          <label className="settings-field-label">
            <Calendar size={14} /> Billing Day
          </label>
          <div className="settings-field-desc">Day of the month invoices are issued (1–28)</div>
          <input
            type="number"
            className="settings-input"
            min={1} max={28}
            value={form.billingDay}
            onChange={e => set('billingDay', e.target.value)}
          />
        </div>

        {/* Currency */}
        <div className="settings-field">
          <label className="settings-field-label">
            <Globe size={14} /> Currency
          </label>
          <div className="settings-field-desc">Default currency for rent and billing amounts</div>
          <select
            className="settings-select"
            value={form.currency}
            onChange={e => set('currency', e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Timezone */}
        <div className="settings-field">
          <label className="settings-field-label">
            <Clock size={14} /> Timezone
          </label>
          <div className="settings-field-desc">Used for invoice dates and lease expiry calculations</div>
          <select
            className="settings-select"
            value={form.timezone}
            onChange={e => set('timezone', e.target.value)}
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      {/* Current values summary */}
      <div className="settings-summary">
        <div className="settings-summary-title">Current Settings</div>
        <div className="settings-grid">
          <div className="setting-row"><span className="setting-label">Billing Cycle</span><span className="capitalize">{property.billingCycle}</span></div>
          <div className="setting-row"><span className="setting-label">Billing Day</span><span>{property.billingDay}</span></div>
          <div className="setting-row"><span className="setting-label">Currency</span><span>{property.currency}</span></div>
          <div className="setting-row"><span className="setting-label">Timezone</span><span>{property.timezone}</span></div>
        </div>
        <p className="settings-note">Changes take effect on the next billing cycle.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LEASES TAB
// ═══════════════════════════════════════════════════
function LeasesTab({ propertyId }: { propertyId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useGetLeasesQuery({ propertyId, status: statusFilter || undefined, limit: 50 });
  const leases = data?.data || [];

  const STATUS_COLORS: Record<string, string> = {
    draft: '#6c757d', pending_approval: '#f39c12', approved: '#3498db',
    active: '#27ae60', expired: '#95a5a6', terminated: '#e74c3c',
    renewed: '#8e44ad', cancelled: '#c0392b',
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3><Briefcase size={16} /> Leases</h3>
        <div className="section-header-actions">
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['draft','pending_approval','approved','active','expired','terminated','renewed'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <Link to="/admin/leases/new" className="btn-secondary" style={{ textDecoration: 'none' }}>
            <Plus size={14} /> New Lease
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-section">Loading leases…</div>
      ) : leases.length === 0 ? (
        <div className="empty-section"><Briefcase size={32} /><p>No leases found for this property</p></div>
      ) : (
        <div className="leases-table-wrap">
          <table className="leases-table">
            <thead>
              <tr>
                <th>Lease #</th>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Term</th>
                <th>Rent</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {leases.map(lease => (
                <tr key={lease.id}>
                  <td>
                    <Link to={`/admin/leases/${lease.id}`} className="lease-link">{lease.leaseNumber}</Link>
                  </td>
                  <td className="tenant-cell">
                    <span className="tenant-name">{lease.tenant.displayName}</span>
                    <span className="tenant-type">{lease.tenant.tenantType}</span>
                  </td>
                  <td>{lease.unit.unitNumber}</td>
                  <td>
                    <span className="status-badge" style={{ background: `${STATUS_COLORS[lease.status] || '#6c757d'}22`, color: STATUS_COLORS[lease.status] || '#6c757d' }}>
                      {lease.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>{lease.leaseTermMonths}mo</td>
                  <td><span className="rent-amount">{lease.currency} {Number(lease.rentAmount).toLocaleString()}</span></td>
                  <td>
                    <span className={`expiry-text ${lease.daysUntilExpiry <= 30 ? 'expiring-soon' : ''}`}>
                      {new Date(lease.endDate).toLocaleDateString()}
                      {lease.daysUntilExpiry > 0 && lease.daysUntilExpiry <= 90 && (
                        <span className="days-badge">{lease.daysUntilExpiry}d</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// DOCUMENTS TAB
// ═══════════════════════════════════════════════════
function DocumentsTab({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useGetDocumentsQuery({ entityType: 'property', entityId: propertyId, limit: '50' });
  const documents = data?.data || [];

  const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    contract: <Briefcase size={14} />, legal: <Shield size={14} />,
    financial: <DollarSign size={14} />, compliance: <CheckCircle size={14} />,
    photo: <Camera size={14} />, other: <FileText size={14} />,
  };

  const STATUS_COLORS: Record<string, string> = {
    active: '#27ae60', expired: '#e74c3c', archived: '#95a5a6', pending_review: '#f39c12',
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3><FileText size={16} /> Documents</h3>
        <Link to="/admin/documents" className="btn-secondary" style={{ textDecoration: 'none' }}>
          <Plus size={14} /> Manage Documents
        </Link>
      </div>

      {isLoading ? (
        <div className="empty-section">Loading documents…</div>
      ) : documents.length === 0 ? (
        <div className="empty-section"><FileText size={32} /><p>No documents linked to this property</p></div>
      ) : (
        <div className="documents-grid">
          {documents.map(doc => (
            <Link key={doc.id} to={`/admin/documents`} className="document-card" style={{ textDecoration: 'none' }}>
              <div className="doc-icon">
                {CATEGORY_ICONS[doc.category || 'other'] || <FileText size={14} />}
              </div>
              <div className="doc-info">
                <span className="doc-name">{doc.name}</span>
                <span className="doc-meta">
                  {doc.extension?.toUpperCase()} · {doc.fileSizeFormatted} · v{doc.currentVersion}
                </span>
              </div>
              <div className="doc-status">
                <span className="status-dot" style={{ background: STATUS_COLORS[doc.status] || '#95a5a6' }} />
                {doc.status.replace(/_/g, ' ')}
              </div>
              {doc.expiryDate && (
                <div className={`doc-expiry ${doc.daysUntilExpiry !== undefined && doc.daysUntilExpiry <= 30 ? 'expiring-soon' : ''}`}>
                  Expires {new Date(doc.expiryDate).toLocaleDateString()}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FINANCE TAB
// ═══════════════════════════════════════════════════
function FinanceTab({ property }: { property: any }) {
  const { data: invData, isLoading: invLoading } = useGetInvoicesQuery({ propertyId: property.id, limit: 10 });
  const { data: schedData } = useGetBillingSchedulesQuery({ propertyId: property.id, status: 'active', limit: 20 });
  const invoices = invData?.data || [];
  const schedules = schedData?.data || [];

  // Compute KPIs from invoice data
  const totalInvoiced = invoices.reduce((s, inv) => s + parseFloat(inv.totalAmount || '0'), 0);
  const totalPaid = invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount || '0'), 0);
  const totalOutstanding = invoices.reduce((s, inv) => s + (inv.outstandingAmount || 0), 0);
  const overdueCount = invoices.filter(inv => inv.status === 'overdue').length;
  const currency = property.currency || 'USD';

  const INV_STATUS_COLORS: Record<string, string> = {
    draft: '#6c757d', pending: '#f39c12', sent: '#3498db',
    partially_paid: '#e67e22', paid: '#27ae60', overdue: '#e74c3c',
    void: '#95a5a6', cancelled: '#c0392b',
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3><DollarSign size={16} /> Finance Overview</h3>
        <Link to="/admin/billing" className="btn-secondary" style={{ textDecoration: 'none' }}>
          <DollarSign size={14} /> Billing Dashboard
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="finance-cards">
        <div className="finance-card">
          <div className="fc-icon" style={{ background: 'rgba(108,92,231,.12)', color: '#6c5ce7' }}><DollarSign size={20} /></div>
          <div className="fc-body">
            <span className="fc-label">Total Invoiced</span>
            <span className="fc-value">{currency} {totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="finance-card">
          <div className="fc-icon" style={{ background: 'rgba(39,174,96,.12)', color: '#27ae60' }}><CheckCircle size={20} /></div>
          <div className="fc-body">
            <span className="fc-label">Total Paid</span>
            <span className="fc-value">{currency} {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="finance-card">
          <div className="fc-icon" style={{ background: 'rgba(243,156,18,.12)', color: '#f39c12' }}><AlertCircle size={20} /></div>
          <div className="fc-body">
            <span className="fc-label">Outstanding</span>
            <span className="fc-value">{currency} {totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="finance-card">
          <div className="fc-icon" style={{ background: 'rgba(231,76,60,.12)', color: '#e74c3c' }}><AlertCircle size={20} /></div>
          <div className="fc-body">
            <span className="fc-label">Overdue Invoices</span>
            <span className="fc-value">{overdueCount}</span>
          </div>
        </div>
      </div>

      {/* Billing Settings Summary */}
      <div className="finance-settings-row">
        <span><Calendar size={13} /> Billing: <strong className="capitalize">{property.billingCycle || 'monthly'}</strong> on day <strong>{property.billingDay || 1}</strong></span>
        <span><Clock size={13} /> Currency: <strong>{currency}</strong></span>
        <span><DollarSign size={13} /> Active Schedules: <strong>{schedules.length}</strong></span>
      </div>

      {/* Recent Invoices Table */}
      <h4 className="finance-sub-title">Recent Invoices</h4>
      {invLoading ? (
        <div className="empty-section">Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="empty-section"><DollarSign size={28} /><p>No invoices for this property yet</p></div>
      ) : (
        <div className="leases-table-wrap">
          <table className="leases-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <Link to={`/admin/billing/invoices/${inv.id}`} className="lease-link">{inv.invoiceNumber}</Link>
                  </td>
                  <td>{inv.tenant.companyName || [inv.tenant.firstName, inv.tenant.lastName].filter(Boolean).join(' ')}</td>
                  <td>
                    <span className="status-badge" style={{ background: `${INV_STATUS_COLORS[inv.status] || '#6c757d'}22`, color: INV_STATUS_COLORS[inv.status] || '#6c757d' }}>
                      {inv.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="rent-amount">{currency} {parseFloat(inv.totalAmount).toLocaleString()}</td>
                  <td>{currency} {parseFloat(inv.paidAmount).toLocaleString()}</td>
                  <td className={inv.outstandingAmount > 0 ? 'expiring-soon' : ''} style={{ fontWeight: inv.outstandingAmount > 0 ? 600 : 400 }}>
                    {currency} {inv.outstandingAmount.toLocaleString()}
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active Billing Schedules */}
      {schedules.length > 0 && (
        <>
          <h4 className="finance-sub-title">Active Billing Schedules</h4>
          <div className="documents-grid">
            {schedules.map(s => (
              <div key={s.id} className="document-card" style={{ cursor: 'default' }}>
                <div className="doc-icon">
                  <Calendar size={14} />
                </div>
                <div className="doc-info">
                  <span className="doc-name">{s.chargeType.name}</span>
                  <span className="doc-meta">
                    {s.tenant.companyName || [s.tenant.firstName, s.tenant.lastName].filter(Boolean).join(' ')}
                    {s.unit ? ` · Unit ${s.unit.unitNumber}` : ''}
                  </span>
                </div>
                <div className="doc-status">
                  <span className="rent-amount">{s.currency} {parseFloat(s.amount).toLocaleString()}</span>
                </div>
                <div className="doc-expiry">
                  {s.billingCycle} · Day {s.billingDay}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
