import { useState } from 'react';
import {
  useGetPropertiesQuery, useCreatePropertyMutation, useDeletePropertyMutation,
  useGetPropertyStatsQuery, useGetBranchesQuery,
} from '../../../store/api/organizationApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import toast from 'react-hot-toast';

const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential', icon: '🏠' },
  { value: 'commercial', label: 'Commercial', icon: '🏢' },
  { value: 'retail', label: 'Retail', icon: '🏬' },
  { value: 'mixed', label: 'Mixed Use', icon: '🏗️' },
  { value: 'industrial', label: 'Industrial', icon: '🏭' },
];

export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const params: Record<string, string> = { page: String(page), limit: '12' };
  if (search) params.search = search;
  if (typeFilter) params.propertyType = typeFilter;

  const { data, isLoading } = useGetPropertiesQuery(params);
  const { data: statsData } = useGetPropertyStatsQuery();
  const [deleteProperty] = useDeletePropertyMutation();

  const properties = data?.data ?? [];
  const meta = data?.meta;
  const stats = statsData?.data;

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Archive property "${name}"? It can be restored later.`)) return;
    try {
      await deleteProperty(id).unwrap();
      toast.success('Property archived');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="page-content" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>🏠 Properties</h1>
        <p className="text-secondary">Manage your property portfolio</p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="prop-stats-row">
          <div className="prop-stat">
            <span className="prop-stat-num">{stats.total}</span>
            <span className="prop-stat-label">Total</span>
          </div>
          {stats.byType.map((t) => {
            const icon = PROPERTY_TYPES.find((pt) => pt.value === t.type)?.icon || '🏠';
            return (
              <div key={t.type} className="prop-stat">
                <span className="prop-stat-num">{icon} {t.count}</span>
                <span className="prop-stat-label">{t.type}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div className="search-box">
            <input
              type="text"
              placeholder="Search properties..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-full"
            />
          </div>
          <select
            className="input-full"
            style={{ maxWidth: 180 }}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Types</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
        <PermissionGuard permission="properties.create">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Property</button>
        </PermissionGuard>
      </div>

      {/* Properties Grid */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading properties...</div>
      ) : (
        <div className="properties-grid">
          {properties.map((p) => {
            const typeInfo = PROPERTY_TYPES.find((t) => t.value === p.propertyType);
            return (
              <div key={p.id} className="property-card">
                <div className="property-card-header">
                  <div className="property-type-badge" data-type={p.propertyType}>
                    {typeInfo?.icon || '🏠'}
                  </div>
                  <div className="property-card-title">
                    <h3>{p.name}</h3>
                    {p.code && <span className="dept-code">{p.code}</span>}
                  </div>
                  <span className={`status-badge ${p.status === 'active' ? 'active' : 'inactive'}`}>
                    {p.status}
                  </span>
                </div>

                <div className="property-card-body">
                  <div className="property-detail-row">
                    <span className="text-muted">📌</span>
                    <span>{[p.addressLine1, p.city, p.country].filter(Boolean).join(', ') || 'No address'}</span>
                  </div>
                  <div className="property-detail-row">
                    <span className="text-muted">📐</span>
                    <span>{p.totalAreaSqft ? `${Number(p.totalAreaSqft).toLocaleString()} sq ft` : '—'}</span>
                  </div>
                  {p.yearBuilt && (
                    <div className="property-detail-row">
                      <span className="text-muted">🗓️</span>
                      <span>Built {p.yearBuilt}</span>
                    </div>
                  )}
                  {p.branch && (
                    <div className="property-detail-row">
                      <span className="text-muted">📍</span>
                      <span>{p.branch.name}</span>
                    </div>
                  )}
                  {p.regions.length > 0 && (
                    <div className="property-regions">
                      {p.regions.map((r) => (
                        <span key={r.id} className="role-chip">{r.name}</span>
                      ))}
                    </div>
                  )}
                </div>

                {p.description && (
                  <p className="property-desc text-muted text-small">{p.description}</p>
                )}

                <div className="property-card-footer">
                  <span className="role-chip">{typeInfo?.label || p.propertyType}</span>
                  <PermissionGuard permission="properties.delete">
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id, p.name)}>
                      Archive
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            );
          })}
          {properties.length === 0 && (
            <div className="info-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60 }}>
              <p className="text-muted">No properties found. Create your first property to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-secondary">Page {meta.page} of {meta.totalPages} ({meta.total} properties)</span>
          <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {showCreate && <CreatePropertyModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreatePropertyModal({ onClose }: { onClose: () => void }) {
  const [createProperty, { isLoading }] = useCreatePropertyMutation();
  const { data: branchesData } = useGetBranchesQuery();

  const [form, setForm] = useState({
    name: '', code: '', propertyType: 'residential',
    branchId: '', addressLine1: '', city: '', country: '',
    totalAreaSqft: '', yearBuilt: '', description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: Record<string, unknown> = { ...form };
      if (form.totalAreaSqft) data.totalAreaSqft = Number(form.totalAreaSqft);
      if (form.yearBuilt) data.yearBuilt = Number(form.yearBuilt);
      if (!form.branchId) delete data.branchId;
      if (!form.code) delete data.code;
      await createProperty(data).unwrap();
      toast.success('Property created');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed to create property');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Property</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row-2">
            <div className="form-group">
              <label>Property Name *</label>
              <input className="input-full" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Code</label>
              <input className="input-full" value={form.code} placeholder="e.g. MBR-001"
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Property Type *</label>
              <select className="input-full" value={form.propertyType}
                onChange={(e) => setForm({ ...form, propertyType: e.target.value })}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Branch</label>
              <select className="input-full" value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">— None —</option>
                {branchesData?.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <input className="input-full" value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>City</label>
              <input className="input-full" value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Country</label>
              <input className="input-full" value={form.country} maxLength={2} placeholder="SG"
                onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Total Area (sq ft)</label>
              <input className="input-full" type="number" value={form.totalAreaSqft}
                onChange={(e) => setForm({ ...form, totalAreaSqft: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Year Built</label>
              <input className="input-full" type="number" value={form.yearBuilt} placeholder="2020"
                onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input className="input-full" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
