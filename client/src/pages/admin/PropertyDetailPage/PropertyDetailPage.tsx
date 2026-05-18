import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetPropertyQuery, useGetStatusHistoryQuery,
  useUpdatePropertyStatusMutation, useGetPhotosQuery,
  useGetFacilitiesQuery, useGetContactsQuery,
  useSetCoverPhotoMutation, useDeletePhotoMutation,
  useAddFacilityMutation, useRemoveFacilityMutation,
  useAddContactMutation, useRemoveContactMutation,
  useGetFacilityTypesQuery, useUploadPhotosMutation,
} from '../../../store/api/propertiesApi';
import {
  ArrowLeft, Building2, MapPin, Calendar, Users, Phone, Mail,
  Settings2, Globe, Clock, Star, Trash2, Plus, Upload, CheckCircle,
  AlertCircle, Wrench, ChevronRight, X, Camera, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './PropertyDetailPage.css';

type Tab = 'overview' | 'facilities' | 'contacts' | 'photos' | 'history' | 'settings';

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
        {(['overview', 'facilities', 'contacts', 'photos', 'history', 'settings'] as Tab[]).map((tab) => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="detail-content">
        {activeTab === 'overview' && <OverviewTab property={property} />}
        {activeTab === 'facilities' && <FacilitiesTab propertyId={id!} />}
        {activeTab === 'contacts' && <ContactsTab propertyId={id!} />}
        {activeTab === 'photos' && <PhotosTab propertyId={id!} />}
        {activeTab === 'history' && <HistoryTab propertyId={id!} />}
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

// ─── Facilities Tab ───────────────────────────
function FacilitiesTab({ propertyId }: { propertyId: string }) {
  const { data } = useGetFacilitiesQuery(propertyId);
  const { data: typesData } = useGetFacilityTypesQuery();
  const [addFacility] = useAddFacilityMutation();
  const [removeFacility] = useRemoveFacilityMutation();
  const [adding, setAdding] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const facilities = data?.data || [];
  const facilityTypes = typesData?.data || [];
  const assigned = new Set(facilities.map((f) => f.facilityTypeId));

  const handleAdd = async () => {
    if (!selectedTypeId) return;
    try {
      await addFacility({ propertyId, data: { facilityTypeId: selectedTypeId } }).unwrap();
      toast.success('Facility added');
      setAdding(false);
      setSelectedTypeId('');
    } catch { toast.error('Failed to add facility'); }
  };

  const handleRemove = async (facilityId: string) => {
    try { await removeFacility({ propertyId, facilityId }).unwrap(); toast.success('Removed'); }
    catch { toast.error('Failed to remove'); }
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Facilities & Amenities</h3>
        <button className="btn-secondary" onClick={() => setAdding(!adding)}><Plus size={14} /> Add Facility</button>
      </div>

      {adding && (
        <div className="add-facility-form">
          <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
            <option value="">Select facility type...</option>
            {facilityTypes.filter((t) => !assigned.has(t.id)).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={handleAdd}>Add</button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {facilities.length === 0 ? (
        <div className="empty-section">No facilities configured yet</div>
      ) : (
        <div className="facilities-grid">
          {facilities.map((f) => (
            <div key={f.id} className="facility-card">
              <div className="facility-icon"><Wrench size={18} /></div>
              <div className="facility-info">
                <span className="facility-name">{f.name || f.facilityType.name}</span>
                <span className="facility-category">{f.facilityType.category}</span>
                {f.floor && <span className="facility-floor">Floor: {f.floor}</span>}
                {f.isBookable && <span className="facility-bookable"><CheckCircle size={11} /> Bookable</span>}
              </div>
              <button className="remove-btn" onClick={() => handleRemove(f.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contacts Tab ─────────────────────────────
function ContactsTab({ propertyId }: { propertyId: string }) {
  const { data } = useGetContactsQuery(propertyId);
  const [addContact] = useAddContactMutation();
  const [removeContact] = useRemoveContactMutation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ role: 'building_manager', name: '', phone: '', mobile: '', email: '', isPrimary: false });

  const contacts = data?.data || [];

  const handleAdd = async () => {
    if (!form.name) return;
    try {
      await addContact({ propertyId, data: form }).unwrap();
      toast.success('Contact added');
      setShowForm(false);
      setForm({ role: 'building_manager', name: '', phone: '', mobile: '', email: '', isPrimary: false });
    } catch { toast.error('Failed to add contact'); }
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Key Contacts</h3>
        <button className="btn-secondary" onClick={() => setShowForm(!showForm)}><Plus size={14} /> Add Contact</button>
      </div>

      {showForm && (
        <div className="contact-form">
          <div className="form-row">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="building_manager">Building Manager</option>
              <option value="security">Security</option>
              <option value="maintenance">Maintenance</option>
              <option value="emergency">Emergency</option>
            </select>
            <input placeholder="Full Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleAdd}>Save Contact</button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {contacts.length === 0
        ? <div className="empty-section">No contacts added yet</div>
        : <div className="contacts-list">
            {contacts.map((c) => (
              <div key={c.id} className="contact-card">
                {c.isPrimary && <span className="primary-badge"><Star size={11} /> Primary</span>}
                <div className="contact-role">{c.role.replace(/_/g, ' ')}</div>
                <div className="contact-name">{c.name}</div>
                <div className="contact-details">
                  {c.phone && <span><Phone size={12} /> {c.phone}</span>}
                  {c.email && <span><Mail size={12} /> {c.email}</span>}
                </div>
                <button className="remove-btn" onClick={async () => {
                  try { await removeContact({ propertyId, contactId: c.id }).unwrap(); toast.success('Removed'); }
                  catch { toast.error('Failed'); }
                }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ─── Photos Tab ───────────────────────────────
function PhotosTab({ propertyId }: { propertyId: string }) {
  const { data } = useGetPhotosQuery(propertyId);
  const [uploadPhotos] = useUploadPhotosMutation();
  const [setCover] = useSetCoverPhotoMutation();
  const [deletePhoto] = useDeletePhotoMutation();
  const [lightbox, setLightbox] = useState<string | null>(null);

  const photos = data?.data || [];

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

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3>Photo Gallery</h3>
        <label className="btn-secondary upload-label">
          <Upload size={14} /> Upload Photos
          <input type="file" multiple accept="image/*" hidden onChange={handleUpload} />
        </label>
      </div>

      {photos.length === 0
        ? <div className="empty-section"><Camera size={32} /><p>No photos uploaded yet</p></div>
        : <div className="photos-grid">
            {photos.map((photo) => (
              <div key={photo.id} className={`photo-card ${photo.isCover ? 'is-cover' : ''}`}>
                <img src={photo.url} alt="" loading="lazy" onClick={() => setLightbox(photo.url)} />
                {photo.isCover && <div className="cover-badge"><Star size={12} /> Cover</div>}
                <div className="photo-actions">
                  {!photo.isCover && (
                    <button title="Set as cover" onClick={async () => {
                      try { await setCover({ propertyId, photoId: photo.id }).unwrap(); toast.success('Cover updated'); }
                      catch { toast.error('Failed'); }
                    }}><Star size={14} /></button>
                  )}
                  <button className="danger" title="Delete" onClick={async () => {
                    if (!confirm('Delete this photo?')) return;
                    try { await deletePhoto({ propertyId, photoId: photo.id }).unwrap(); toast.success('Deleted'); }
                    catch { toast.error('Failed'); }
                  }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
      }

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full size" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}><X size={24} /></button>
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
function SettingsTab({ property }: { property: any }) {
  return (
    <div className="tab-section settings-tab">
      <h3>Property Settings</h3>
      <div className="settings-grid">
        <div className="setting-row"><span className="setting-label">Billing Cycle</span><span className="capitalize">{property.billingCycle}</span></div>
        <div className="setting-row"><span className="setting-label">Billing Day</span><span>{property.billingDay}</span></div>
        <div className="setting-row"><span className="setting-label">Currency</span><span>{property.currency}</span></div>
        <div className="setting-row"><span className="setting-label">Timezone</span><span>{property.timezone}</span></div>
      </div>
      <p className="settings-note">Full settings editor coming in Phase 2.3</p>
    </div>
  );
}
