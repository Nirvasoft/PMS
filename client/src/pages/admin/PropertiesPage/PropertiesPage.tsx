import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetPropertiesQuery, useDeletePropertyMutation, useGetPropertyStatsQuery,
} from '../../../store/api/propertiesApi';
import type { PropertyListItem } from '../../../store/api/propertiesApi';
import { useAppSelector, useAppDispatch } from '../../../store';
import { setListView, setListFilter, resetFilters } from '../../../store/slices/propertiesSlice';
import {
  Plus, LayoutGrid, List, Search, Filter, X, MapPin,
  Building2, Wrench, MoreVertical, Trash2, Eye, BarChart2, Home,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
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

export default function PropertiesPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { listView, listFilters } = useAppSelector((s) => s.properties);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const { data, isLoading } = useGetPropertiesQuery({
    search: listFilters.search || undefined,
    status: listFilters.status || undefined,
    propertyType: listFilters.propertyType || undefined,
    regionId: listFilters.regionId || undefined,
    page,
    limit: 12,
  });

  const [deleteProperty] = useDeletePropertyMutation();
  const confirmDialog = useConfirm();
  const properties = data?.data || [];
  const meta = data?.meta;

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
          <button className="btn-primary" onClick={() => navigate('/admin/properties/create')}>
            <Plus size={16} /> Add Property
          </button>
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
          <button className="btn-primary" onClick={() => navigate('/admin/properties/create')}>
            <Plus size={16} /> Add Property
          </button>
        </div>
      ) : listView === 'grid' ? (
        <div className="property-grid">
          {properties.map((p) => (
            <PropertyCard
              key={p.id} property={p}
              menuOpen={menuOpen === p.id}
              onMenuOpen={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
              onView={() => navigate(`/admin/properties/${p.id}`)}
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
    </div>
  );
}

function PropertyCard({ property: p, menuOpen, onMenuOpen, onView, onDelete }: {
  property: PropertyListItem; menuOpen: boolean;
  onMenuOpen: () => void; onView: () => void; onDelete: () => void;
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
            <button onClick={onDelete} className="danger"><Trash2 size={14} /> Delete</button>
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

function PropertyRow({ property: p, onView, onDelete }: {
  property: PropertyListItem; onView: () => void; onDelete: () => void;
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
        <button onClick={onView}><Eye size={15} /></button>
        <button onClick={onDelete} className="danger"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}
