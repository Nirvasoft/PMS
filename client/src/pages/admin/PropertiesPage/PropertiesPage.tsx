import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetPropertiesQuery, useDeletePropertyMutation, useGetPropertyStatsQuery,
  useUpdatePropertyMutation, useGetPropertyTypesQuery,
  useGetPhotosQuery, useUploadPhotosMutation, useDeletePhotoMutation,
} from '../../../store/api/propertiesApi';
import type { PropertyListItem } from '../../../store/api/propertiesApi';
import { useGetBranchesQuery } from '../../../store/api/organizationApi';
import { useAppSelector, useAppDispatch } from '../../../store';
import { setListView, setListFilter, resetFilters } from '../../../store/slices/propertiesSlice';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Plus, LayoutGrid, List, Search, Filter, X, MapPin,
  Building2, Wrench, MoreVertical, Trash2, Eye, BarChart2, Home, Edit3, Save, Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { CURRENCIES } from '../../../constants/currencies';
import './PropertiesPage.css';

const STATUS_COLORS: Record<string, string> = {
  active: '#2ecc71',
  under_renovation: '#f39c12',
  decommissioned: '#e74c3c',
};

/** Returns bar colour + gradient based on occupancy % thresholds */
function occupancyColor(rate: number): { color: string; gradient: string; glow: string } {
  if (rate >= 90) return {
    color: '#2ecc71',
    gradient: 'linear-gradient(90deg, #27ae60, #2ecc71)',
    glow: 'rgba(46,204,113,.25)',
  };
  if (rate >= 70) return {
    color: '#f39c12',
    gradient: 'linear-gradient(90deg, #e67e22, #f1c40f)',
    glow: 'rgba(243,156,18,.25)',
  };
  if (rate >= 40) return {
    color: '#e74c3c',
    gradient: 'linear-gradient(90deg, #e74c3c, #f39c12)',
    glow: 'rgba(231,76,60,.2)',
  };
  return {
    color: '#e74c3c',
    gradient: 'linear-gradient(90deg, #c0392b, #e74c3c)',
    glow: 'rgba(231,76,60,.3)',
  };
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  residential: <Home size={14} />,
  commercial: <Building2 size={14} />,
  retail: <BarChart2 size={14} />,
  mixed_use: <Building2 size={14} />,
  industrial: <Wrench size={14} />,
  hospitality: <Building2 size={14} />,
  warehouse: <Building2 size={14} />,
};

const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Asia/Bangkok','Asia/Yangon','Asia/Dubai','Australia/Sydney'];
const COUNTRIES  = ['US','SG','GB','TH','MM','JP','AE','AU','DE','FR','IN','CN'];
const SQM_TO_SQFT = 10.7639;

interface EditForm {
  name: string; code: string; propertyType: string; legalName: string;
  registrationNo: string; description: string;
  addressLine1: string; addressLine2: string; city: string; state: string;
  postalCode: string; country: string; geoLat: string; geoLng: string; branchId: string;
  yearBuilt: string; totalFloors: string; totalAreaSqm: string; totalAreaSqft: string;
  billingCycle: string; billingDay: string; currency: string; timezone: string;
}

function buildEditForm(p: PropertyListItem): EditForm {
  const pd = p as any; // PropertyListItem + extra detail fields
  return {
    name:           p.name || '',
    code:           p.code || '',
    propertyType:   p.propertyType || '',
    legalName:      pd.legalName || '',
    registrationNo: pd.registrationNo || '',
    description:    pd.description || '',
    addressLine1:   pd.addressLine1 || '',
    addressLine2:   pd.addressLine2 || '',
    city:           p.city || '',
    state:          pd.state || '',
    postalCode:     pd.postalCode || '',
    country:        p.country || '',
    geoLat:         p.geoLat != null ? String(p.geoLat) : '',
    geoLng:         p.geoLng != null ? String(p.geoLng) : '',
    branchId:       pd.branchId || pd.branch?.id || '',
    yearBuilt:      pd.yearBuilt != null ? String(pd.yearBuilt) : '',
    totalFloors:    p.totalFloors != null ? String(p.totalFloors) : '',
    totalAreaSqm:   pd.totalAreaSqm != null ? String(pd.totalAreaSqm) : '',
    totalAreaSqft:  pd.totalAreaSqft != null ? String(pd.totalAreaSqft) : '',
    billingCycle:   pd.billingCycle || 'monthly',
    billingDay:     pd.billingDay != null ? String(pd.billingDay) : '1',
    currency:       pd.currency || 'USD',
    timezone:       pd.timezone || 'UTC',
  };
}

// ─── Edit Drawer ──────────────────────────────
function EditDrawer({ property, onClose }: { property: PropertyListItem; onClose: () => void }) {
  const [form, setForm] = useState<EditForm>(() => buildEditForm(property));
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();
  const { data: typesData } = useGetPropertyTypesQuery();
  const { data: branchesData } = useGetBranchesQuery();
  const types    = typesData?.data || [];
  const branches = branchesData?.data || [];

  // Photos
  const { data: photosData } = useGetPhotosQuery(property.id);
  const photos = photosData?.data || [];
  const [uploadPhotos, { isLoading: uploading }] = useUploadPhotosMutation();
  const [deletePhoto] = useDeletePhotoMutation();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('photos', f));
    try {
      await uploadPhotos({ propertyId: property.id, formData: fd }).unwrap();
      toast.success('Photos uploaded');
    } catch {
      toast.error('Failed to upload photos');
    }
    e.target.value = '';
  };

  const handleDeletePhoto = async (photoId: string) => {
    try { await deletePhoto({ propertyId: property.id, photoId }).unwrap(); }
    catch { toast.error('Failed to delete photo'); }
  };

  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setArea = (v: string) => setForm(f => ({
    ...f, totalAreaSqm: v, totalAreaSqft: v ? (Number(v) * SQM_TO_SQFT).toFixed(2) : '',
  }));
  const setAreaSqft = (v: string) => setForm(f => ({
    ...f, totalAreaSqft: v, totalAreaSqm: v ? (Number(v) / SQM_TO_SQFT).toFixed(2) : '',
  }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Property name is required'); return; }
    if (!form.propertyType) { toast.error('Property type is required'); return; }
    const day = Number(form.billingDay);
    if (isNaN(day) || day < 1 || day > 28) { toast.error('Billing day must be between 1 and 28'); return; }
    try {
      await updateProperty({
        id: property.id,
        data: {
          name:           form.name.trim(),
          code:           form.code.trim()          || undefined,
          propertyType:   form.propertyType,
          legalName:      form.legalName.trim()     || undefined,
          registrationNo: form.registrationNo.trim()|| undefined,
          description:    form.description.trim()   || undefined,
          addressLine1:   form.addressLine1.trim()  || undefined,
          addressLine2:   form.addressLine2.trim()  || undefined,
          city:           form.city.trim()          || undefined,
          state:          form.state.trim()         || undefined,
          postalCode:     form.postalCode.trim()    || undefined,
          country:        form.country              || undefined,
          geoLat:         form.geoLat  ? Number(form.geoLat)  : undefined,
          geoLng:         form.geoLng  ? Number(form.geoLng)  : undefined,
          branchId:       form.branchId             || undefined,
          yearBuilt:      form.yearBuilt   ? Number(form.yearBuilt)   : undefined,
          totalFloors:    form.totalFloors ? Number(form.totalFloors) : undefined,
          totalAreaSqm:   form.totalAreaSqm  ? Number(form.totalAreaSqm)  : undefined,
          totalAreaSqft:  form.totalAreaSqft ? Number(form.totalAreaSqft) : undefined,
          billingCycle:   form.billingCycle,
          billingDay:     day,
          currency:       form.currency,
          timezone:       form.timezone,
        },
      }).unwrap();
      toast.success(`"${form.name}" updated`);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to update property');
    }
  };

  return (
    <div className="edit-drawer-overlay">
      <div className="edit-drawer">
        {/* Header */}
        <div className="edit-drawer-header">
          <div className="edit-drawer-title">
            <Edit3 size={18} />
            <span>Edit Property</span>
          </div>
          <button className="edit-drawer-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div className="edit-drawer-body">

          {/* ── Basic Info ── */}
          <div className="edit-section">
            <div className="edit-section-title">Basic Information</div>
            <div className="edit-grid">
              <div className="edit-field full">
                <label>Property Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Marina Bay Residences" />
              </div>
              <div className="edit-field">
                <label>Code</label>
                <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. MBR-001" />
              </div>
              <div className="edit-field">
                <label>Property Type *</label>
                <select value={form.propertyType} onChange={e => set('propertyType', e.target.value)}>
                  <option value="">Select type…</option>
                  {types.length > 0
                    ? types.map(t => <option key={t.id} value={t.code}>{t.name}</option>)
                    : ['residential','commercial','mixed_use','industrial','retail','hospitality','warehouse'].map(t =>
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="edit-field">
                <label>Legal Name</label>
                <input value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="Official legal name" />
              </div>
              <div className="edit-field">
                <label>Registration No.</label>
                <input value={form.registrationNo} onChange={e => set('registrationNo', e.target.value)} placeholder="e.g. BCA-2024-12345" />
              </div>
              <div className="edit-field full">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" />
              </div>
            </div>
          </div>

          {/* ── Address ── */}
          <div className="edit-section">
            <div className="edit-section-title"><MapPin size={13} /> Address &amp; Location</div>
            <div className="edit-grid">
              <div className="edit-field full">
                <label>Address Line 1</label>
                <input value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} placeholder="Street address" />
              </div>
              <div className="edit-field full">
                <label>Address Line 2</label>
                <input value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} placeholder="Floor, unit, block" />
              </div>
              <div className="edit-field">
                <label>City</label>
                <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Singapore" />
              </div>
              <div className="edit-field">
                <label>State / Province</label>
                <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="e.g. Central Region" />
              </div>
              <div className="edit-field">
                <label>Postal Code</label>
                <input value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="e.g. 018956" />
              </div>
              <div className="edit-field">
                <label>Country</label>
                <select value={form.country} onChange={e => set('country', e.target.value)}>
                  <option value="">Select country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="edit-field">
                <label>Branch</label>
                <select value={form.branchId} onChange={e => set('branchId', e.target.value)}>
                  <option value="">— No Branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="edit-field">
                <label>Latitude</label>
                <input type="number" step="any" value={form.geoLat} onChange={e => set('geoLat', e.target.value)} placeholder="e.g. 1.2839" />
              </div>
              <div className="edit-field">
                <label>Longitude</label>
                <input type="number" step="any" value={form.geoLng} onChange={e => set('geoLng', e.target.value)} placeholder="e.g. 103.8607" />
              </div>
            </div>
          </div>

          {/* ── Property Details ── */}
          <div className="edit-section">
            <div className="edit-section-title"><Building2 size={13} /> Property Details</div>
            <div className="edit-grid">
              <div className="edit-field">
                <label>Year Built</label>
                <input type="number" min={1800} max={new Date().getFullYear() + 5} value={form.yearBuilt} onChange={e => set('yearBuilt', e.target.value)} placeholder="e.g. 2018" />
              </div>
              <div className="edit-field">
                <label>Total Floors</label>
                <input type="number" min={1} value={form.totalFloors} onChange={e => set('totalFloors', e.target.value)} placeholder="e.g. 32" />
              </div>
              <div className="edit-field">
                <label>Total Area (sqm)</label>
                <input type="number" min={0} value={form.totalAreaSqm} onChange={e => setArea(e.target.value)} placeholder="e.g. 12500" />
              </div>
              <div className="edit-field">
                <label>Total Area (sqft)</label>
                <input type="number" min={0} value={form.totalAreaSqft} onChange={e => setAreaSqft(e.target.value)} placeholder="e.g. 134549" />
              </div>
            </div>
          </div>

          {/* ── Billing ── */}
          <div className="edit-section">
            <div className="edit-section-title">Billing &amp; Financial</div>
            <div className="edit-grid">
              <div className="edit-field">
                <label>Currency</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="edit-field">
                <label>Billing Cycle</label>
                <select value={form.billingCycle} onChange={e => set('billingCycle', e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="edit-field">
                <label>Billing Day (1–28)</label>
                <input type="number" min={1} max={28} value={form.billingDay} onChange={e => set('billingDay', e.target.value)} />
              </div>
              <div className="edit-field">
                <label>Timezone</label>
                <select value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Images ── */}
          <div className="edit-section">
            <div className="edit-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Images</span>
              <label className="btn-upload-photo" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontWeight: 500 }}>
                <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload Photos'}
                <input type="file" accept="image/*" multiple hidden onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {photos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0' }}>No photos yet. Upload some above.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {photos.map((photo: any) => (
                  <div key={photo.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3', background: 'var(--bg-tertiary)' }}>
                    <img
                      src={photo.url}
                      alt={photo.caption || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', bottom: 0, insetInline: 0, padding: '4px 6px', background: 'rgba(0,0,0,0.5)' }}>
                      <button
                        title="Delete photo"
                        onClick={() => handleDeletePhoto(photo.id)}
                        style={{ width: '100%', fontSize: 11, padding: '2px 0', borderRadius: 4, border: 'none', background: 'rgba(231,76,60,0.85)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}
                      >
                        <Trash2 size={10} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="edit-drawer-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <PermissionGuard permission="properties.update">
            <button className="btn-primary" onClick={handleSave} disabled={isLoading}>
              <Save size={14} /> {isLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </PermissionGuard>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────
export default function PropertiesPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { listView, listFilters } = useAppSelector((s) => s.properties);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingProperty, setEditingProperty] = useState<PropertyListItem | null>(null);

  // When the sidebar's Active Property is a specific property (not "All Properties"),
  // the list narrows to just that one property instead of the full portfolio.
  const activePropertyFilter = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter]);

  const { data, isLoading } = useGetPropertiesQuery({
    search: listFilters.search || undefined,
    status: listFilters.status || undefined,
    propertyType: listFilters.propertyType || undefined,
    regionId: listFilters.regionId || undefined,
    page: activePropertyFilter ? 1 : page,
    limit: activePropertyFilter ? 100 : 12,
  });

  const [deleteProperty] = useDeletePropertyMutation();
  const confirmDialog = useConfirm();
  const allProperties = data?.data || [];
  const properties = activePropertyFilter
    ? allProperties.filter((p) => p.id === activePropertyFilter)
    : allProperties;
  const meta = activePropertyFilter
    ? { ...(data?.meta ?? { total: 0, page: 1, limit: 100, totalPages: 1 }), total: properties.length, totalPages: 1 }
    : data?.meta;

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete "${name}"? This cannot be undone.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteProperty(id).unwrap();
      toast.success(`"${name}" deleted`);
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="properties-page">
      <div className="properties-header">
        <div className="header-left">
          <Building2 size={24} className="header-icon" />
          <div>
            <h1>Properties</h1>
            <p className="subtitle">{meta?.total ?? 0} properties in portfolio</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={15} /> Filters{(listFilters.status || listFilters.propertyType) ? ' •' : ''}
          </button>
          <div className="view-toggle">
            <button className={listView === 'grid' ? 'active' : ''} onClick={() => dispatch(setListView('grid'))}><LayoutGrid size={16} /></button>
            <button className={listView === 'list' ? 'active' : ''} onClick={() => dispatch(setListView('list'))}><List size={16} /></button>
          </div>
          <PermissionGuard permission="properties.create">
            <button className="btn-primary" onClick={() => navigate('/admin/properties/create')}>
              <Plus size={16} /> Add Property
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="properties-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            type="text" placeholder="Search properties..."
            value={listFilters.search}
            onChange={(e) => { dispatch(setListFilter({ search: e.target.value })); setPage(1); }}
          />
          {listFilters.search && <button onClick={() => dispatch(setListFilter({ search: '' }))}><X size={14} /></button>}
        </div>
        {showFilters && (
          <div className="filter-bar">
            <select value={listFilters.status || ''} onChange={(e) => { dispatch(setListFilter({ status: e.target.value || null })); setPage(1); }}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="under_renovation">Under Renovation</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
            <select value={listFilters.propertyType || ''} onChange={(e) => { dispatch(setListFilter({ propertyType: e.target.value || null })); setPage(1); }}>
              <option value="">All Types</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="retail">Retail</option>
              <option value="mixed_use">Mixed-Use</option>
              <option value="industrial">Industrial</option>
              <option value="hospitality">Hospitality</option>
              <option value="warehouse">Warehouse</option>
            </select>
            <button className="btn-ghost" onClick={() => { dispatch(resetFilters()); setPage(1); }}>
              <X size={14} /> Reset
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className={listView === 'grid' ? 'property-grid' : 'property-list'}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="property-skeleton" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="empty-state">
          <Building2 size={48} />
          <h3>No properties found</h3>
          <p>Add your first property to get started</p>
          <PermissionGuard permission="properties.create">
            <button className="btn-primary" onClick={() => navigate('/admin/properties/create')}>
              <Plus size={16} /> Add Property
            </button>
          </PermissionGuard>
        </div>
      ) : listView === 'grid' ? (
        <div className="property-grid">
          {properties.map((p) => (
            <PropertyCard
              key={p.id} property={p}
              menuOpen={menuOpen === p.id}
              onMenuOpen={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
              onView={() => navigate(`/admin/properties/${p.id}`)}
              onEdit={() => { setMenuOpen(null); setEditingProperty(p); }}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          ))}
        </div>
      ) : (
        <div className="property-list-table">
          <div className="list-header">
            <span>Name</span><span>Type</span><span>Status</span><span>Units</span><span>City</span><span></span>
          </div>
          {properties.map((p) => (
            <PropertyRow key={p.id} property={p}
              onView={() => navigate(`/admin/properties/${p.id}`)}
              onEdit={() => setEditingProperty(p)}
              onDelete={() => handleDelete(p.id, p.name)} />
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>{page} / {meta.totalPages}</span>
          <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {/* Edit Drawer */}
      {editingProperty && (
        <EditDrawer
          property={editingProperty}
          onClose={() => setEditingProperty(null)}
        />
      )}
    </div>
  );
}

// ─── Property Card ────────────────────────────
function PropertyCard({ property: p, menuOpen, onMenuOpen, onView, onEdit, onDelete }: {
  property: PropertyListItem; menuOpen: boolean;
  onMenuOpen: () => void; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { data: statsData } = useGetPropertyStatsQuery(p.id);
  const stats = statsData?.data;
  const rate  = stats?.occupancyRate ?? 0;
  const occupied = stats?.occupiedUnits ?? 0;
  const total    = stats?.totalUnits ?? p.totalUnits;
  const barStyle = occupancyColor(rate);

  return (
    <div className="property-card" onClick={onView}>
      <div className="card-image">
        {p.coverImageUrl
          ? <img src={p.coverImageUrl} alt={p.name} loading="lazy" />
          : <div className="image-placeholder"><Building2 size={40} /></div>}
        <div className="status-badge" style={{ '--status-color': STATUS_COLORS[p.status] } as any}>
          <span className="status-dot" />{p.status.replace(/_/g, ' ')}
        </div>
        <button className="card-menu-btn" onClick={(e) => { e.stopPropagation(); onMenuOpen(); }}><MoreVertical size={16} /></button>
        {menuOpen && (
          <div className="card-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={onView}><Eye size={14} /> View Details</button>
            <PermissionGuard permission="properties.update">
              <button onClick={onEdit}><Edit3 size={14} /> Edit</button>
            </PermissionGuard>
            <PermissionGuard permission="properties.delete">
              <button onClick={onDelete} className="danger"><Trash2 size={14} /> Delete</button>
            </PermissionGuard>
          </div>
        )}
      </div>
      <div className="card-content">
        <div className="card-type-row">
          {TYPE_ICONS[p.propertyType] || <Building2 size={14} />}
          <span>{p.propertyType.replace(/_/g, ' ')}</span>
        </div>
        <h3 className="card-name">{p.name}</h3>
        {p.code && <span className="card-code">{p.code}</span>}
        {(p.city || p.country) && (
          <div className="card-location"><MapPin size={12} /><span>{[p.city, p.country].filter(Boolean).join(', ')}</span></div>
        )}
        <div
          className="occupancy-bar"
          title={total > 0 ? `${occupied} / ${total} units occupied` : `${total} units`}
        >
          <div
            className="bar-fill"
            style={{
              width: `${rate}%`,
              background: barStyle.gradient,
              boxShadow: rate > 0 ? `0 0 8px ${barStyle.glow}` : 'none',
            }}
          />
        </div>
        <div className="card-stats">
          <span>{occupied}/{total} units</span>
          <span className="occupancy-pct" style={{ color: total > 0 ? barStyle.color : undefined }}>
            {rate}% occupied
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Property Row (List view) ─────────────────
function PropertyRow({ property: p, onView, onEdit, onDelete }: {
  property: PropertyListItem; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="list-row" onClick={onView}>
      <div className="row-name">
        <div className="row-avatar">
          {p.coverImageUrl ? <img src={p.coverImageUrl} alt={p.name} /> : <Building2 size={16} />}
        </div>
        <div><span className="name">{p.name}</span>{p.code && <span className="code"> {p.code}</span>}</div>
      </div>
      <span className="row-type">{p.propertyType.replace(/_/g, ' ')}</span>
      <span className="row-status" style={{ color: STATUS_COLORS[p.status] }}>{p.status.replace(/_/g, ' ')}</span>
      <span>{p.totalUnits}</span>
      <span>{p.city || '—'}</span>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button title="View" onClick={onView}><Eye size={15} /></button>
        <PermissionGuard permission="properties.update">
          <button title="Edit" onClick={onEdit}><Edit3 size={15} /></button>
        </PermissionGuard>
        <PermissionGuard permission="properties.delete">
          <button title="Delete" onClick={onDelete} className="danger"><Trash2 size={15} /></button>
        </PermissionGuard>
      </div>
    </div>
  );
}
