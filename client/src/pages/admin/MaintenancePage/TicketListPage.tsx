import './MaintenancePage.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../../store';
import {
  useGetTicketsQuery, useCreateTicketMutation, useGetCategoriesQuery,
  useGetMaintenanceStatsQuery, useUploadTicketPhotosMutation,
} from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Wrench, Plus, Search, LayoutGrid, List, AlertTriangle,
  Clock, CheckCircle2, XCircle, Loader2,
  Inbox, TrendingUp, ShieldAlert, Star, AlertOctagon, ImagePlus, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useMaintenanceSocket } from '../../../hooks/useMaintenanceSocket';
import { setTicketFilters, setViewMode as setViewModeAction } from '../../../store/slices/maintenanceSlice';

const PRIORITIES = [
  { value: 'P1', label: 'P1 — Emergency', color: '#ef4444' },
  { value: 'P2', label: 'P2 — Urgent', color: '#f97316' },
  { value: 'P3', label: 'P3 — Normal', color: '#3b82f6' },
  { value: 'P4', label: 'P4 — Low', color: '#94a3b8' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#3b82f6' },
  assigned: { label: 'Assigned', color: '#8b5cf6' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  pending_parts: { label: 'Pending Parts', color: '#f97316' },
  completed: { label: 'Completed', color: '#22c55e' },
  closed: { label: 'Closed', color: '#64748b' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
  reopened: { label: 'Reopened', color: '#e11d48' },
};

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`maint-priority ${priority.toLowerCase()}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status];
  return <span className={`maint-status ${status}`}>{s?.label || status}</span>;
}

function SlaChip({ slaStatus, hoursUntilSla }: { slaStatus: string | null; hoursUntilSla: number | null }) {
  if (!slaStatus || slaStatus === 'met') return null;

  const formatTime = (h: number | null) => {
    if (h === null) return '';
    if (h <= 0) return `OVERDUE ${Math.abs(Math.round(h))}h`;
    if (h < 1) return `${Math.round(h * 60)}m left`;
    return `${Math.round(h * 10) / 10}h left`;
  };

  return (
    <span className={`sla-chip ${slaStatus}`}>
      <Clock size={11} />
      {formatTime(hoursUntilSla)}
    </span>
  );
}

export default function TicketListPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  useMaintenanceSocket();
  const viewMode = useAppSelector((s) => s.maintenance.viewMode);
  const filters = useAppSelector((s) => s.maintenance.ticketFilters);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const selectedProperty = useSelectedPropertyFilter();

  // Keep the ticket filter's propertyId in sync with the sidebar's Active Property —
  // it's no longer independently choosable via the filter dropdown below.
  useEffect(() => {
    if (filters.propertyId !== selectedProperty) {
      dispatch(setTicketFilters({ propertyId: selectedProperty, page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty]);

  const { data: ticketsData, isLoading } = useGetTicketsQuery({
    ...filters,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    categoryId: filters.categoryId || undefined,
    search: filters.search || undefined,
    propertyId: selectedProperty || undefined,
  });
  const { data: statsData } = useGetMaintenanceStatsQuery({
    propertyId: selectedProperty || undefined,
  });
  const { data: categoriesData } = useGetCategoriesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });

  const tickets = ticketsData?.data || [];
  const meta = ticketsData?.meta;
  const stats = statsData?.data;
  const categories = categoriesData?.data || [];
  const properties = propertiesData?.data || [];

  // Kanban columns
  const kanbanColumns = useMemo(() => {
    const cols = ['open', 'assigned', 'in_progress', 'pending_parts'];
    return cols.map((status) => ({
      status,
      ...STATUS_LABELS[status],
      tickets: tickets.filter((t) => t.status === status),
    }));
  }, [tickets]);

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Wrench size={22} />
          </div>
          <div>
            <h1>Maintenance Tickets</h1>
            <p>
              {stats
                ? `${stats.ticketSummary.total} total · ${stats.ticketSummary.overdue} overdue`
                : 'Manage maintenance requests and work orders'}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => dispatch(setViewModeAction('table'))}>
              <List size={16} />
            </button>
            <button className={`toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => dispatch(setViewModeAction('kanban'))}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>Create Ticket</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="maint-stats-row">
          <div className="maint-stat-card blue">
            <div className="msc-icon"><Inbox size={18} /></div>
            <span className="msc-value">{stats.ticketSummary.open}</span>
            <span className="msc-label">Open</span>
          </div>
          <div className="maint-stat-card purple">
            <div className="msc-icon"><TrendingUp size={18} /></div>
            <span className="msc-value">{stats.ticketSummary.inProgress}</span>
            <span className="msc-label">In Progress</span>
          </div>
          <div className="maint-stat-card red">
            <div className="msc-icon"><AlertOctagon size={18} /></div>
            <span className="msc-value">{stats.ticketSummary.overdue}</span>
            <span className="msc-label">Overdue</span>
          </div>
          <div className="maint-stat-card green">
            <div className="msc-icon"><ShieldAlert size={18} /></div>
            <span className="msc-value">{stats.slaCompliance.resolutionRate}%</span>
            <span className="msc-label">SLA Met</span>
          </div>
          <div className="maint-stat-card amber">
            <div className="msc-icon"><Star size={18} /></div>
            <span className="msc-value">{stats.avgRating ? `${stats.avgRating} ★` : '—'}</span>
            <span className="msc-label">Avg Rating</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="maint-filters">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text" placeholder="Search tickets..."
            value={filters.search}
            onChange={(e) => dispatch(setTicketFilters({ search: e.target.value, page: 1 }))}
          />
        </div>
        {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select className="filter-select" value={selectedProperty} disabled>
          {selectedProperty && (
            <option value={selectedProperty}>{properties.find((p: any) => p.id === selectedProperty)?.name || ''}</option>
          )}
        </select>
        <select className="filter-select" value={filters.status} onChange={(e) => dispatch(setTicketFilters({ status: e.target.value, page: 1 }))}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="filter-select" value={filters.priority} onChange={(e) => dispatch(setTicketFilters({ priority: e.target.value, page: 1 }))}>
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="filter-select" value={filters.categoryId} onChange={(e) => dispatch(setTicketFilters({ categoryId: e.target.value, page: 1 }))}>
          <option value="">All Categories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading tickets...</div>
      ) : viewMode === 'table' ? (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Assigned To</th>
                  <th>Property</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="maint-empty">
                        <div className="empty-icon"><Inbox size={28} /></div>
                        <p>No tickets found</p>
                      </div>
                    </td>
                  </tr>
                ) : tickets.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/admin/maintenance/tickets/${t.id}`)}>
                    <td><span className="cell-mono">{t.ticketNumber}</span></td>
                    <td>
                      <div className="ticket-title-cell">
                        {t.isUrgent && <AlertTriangle size={14} className="urgent-icon" />}
                        <span className="title-text">{t.title}</span>
                      </div>
                    </td>
                    <td><span className="cell-secondary">{t.category.name}</span></td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td><SlaChip slaStatus={t.slaStatus} hoursUntilSla={t.hoursUntilSla} /></td>
                    <td>
                      <span className="cell-secondary">
                        {t.assignedTo ? (
                          t.assignedTo.profile
                            ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}`
                            : t.assignedTo.email
                        ) : '—'}
                      </span>
                    </td>
                    <td><span className="cell-secondary">{t.property.name}</span></td>
                    <td><span className="cell-secondary">{new Date(t.createdAt).toLocaleDateString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">Page {meta.page} of {meta.totalPages} ({meta.total} tickets)</span>
              <div className="page-btns">
                <button disabled={filters.page <= 1} onClick={() => dispatch(setTicketFilters({ page: filters.page - 1 }))}>Previous</button>
                <button disabled={filters.page >= meta.totalPages} onClick={() => dispatch(setTicketFilters({ page: filters.page + 1 }))}>Next</button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Kanban View */
        <div className="kanban-board">
          {kanbanColumns.map((col) => (
            <div key={col.status} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-dot" style={{ backgroundColor: col.color }} />
                <span className="kanban-column-title">{col.label}</span>
                <span className="kanban-column-count">{col.tickets.length}</span>
              </div>
              <div className="kanban-column-body">
                {col.tickets.length === 0 && (
                  <div className="maint-empty" style={{ padding: '24px 0' }}>
                    <p>No tickets</p>
                  </div>
                )}
                {col.tickets.map((t) => (
                  <div key={t.id} className="kanban-card" onClick={() => navigate(`/admin/maintenance/tickets/${t.id}`)}>
                    <div className="kanban-card-header">
                      <span className="cell-mono">{t.ticketNumber}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="kanban-card-title">{t.title}</p>
                    <div className="kanban-card-meta">
                      {t.category.name}
                      {t.unit && ` · ${t.unit.unitNumber}`}
                    </div>
                    <div className="kanban-card-footer">
                      <SlaChip slaStatus={t.slaStatus} hoursUntilSla={t.hoursUntilSla} />
                      {t.assignedTo?.profile && (
                        <span className="kanban-assignee">
                          {t.assignedTo.profile.firstName[0]}{t.assignedTo.profile.lastName[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal
          categories={categories}
          properties={properties}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ── Create Ticket Modal ──────────────────────

function CreateTicketModal({ categories, properties, onClose }: {
  categories: any[]; properties: any[]; onClose: () => void;
}) {
  const [createTicket, { isLoading }] = useCreateTicketMutation();
  const [uploadPhotos] = useUploadTicketPhotosMutation();
  const [form, setForm] = useState({
    propertyId: '', unitId: '', title: '', description: '', categoryId: '',
    priority: 'P3', source: 'staff', locationDetail: '', isUrgent: false,
  });
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPendingPhotos((prev) => [...prev, ...imageFiles].slice(0, 10));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createTicket(form).unwrap();
      const ticketId = result?.data?.id;

      // Upload photos if any were selected
      if (ticketId && pendingPhotos.length > 0) {
        const formData = new FormData();
        pendingPhotos.forEach((f) => formData.append('photos', f));
        formData.append('photoType', 'before');
        try {
          await uploadPhotos({ ticketId, formData }).unwrap();
        } catch {
          toast.error('Ticket created but photo upload failed');
        }
      }

      toast.success('Ticket created successfully');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create ticket');
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><Plus size={18} /></span>
            Create Maintenance Ticket
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Category <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Title <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Brief description of the issue" />
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Detailed description of the issue..." />
            </div>
          </div>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Priority</label>
              <div className="priority-selector">
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button"
                    className={`priority-option ${p.value.toLowerCase()} ${form.priority === p.value ? 'active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                  >
                    {p.value}
                  </button>
                ))}
              </div>
            </div>
            <div className="maint-field">
              <label>Source</label>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
                <option value="staff">Staff</option>
                <option value="tenant">Tenant</option>
                <option value="inspection">Inspection</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Location Detail</label>
              <input type="text" value={form.locationDetail} onChange={(e) => setForm((f) => ({ ...f, locationDetail: e.target.value }))} placeholder="e.g., Master bathroom near light fixture" />
            </div>
          </div>

          {/* Photo Upload Zone */}
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Photos (optional)</label>
              <div
                className={`photo-drop-zone compact ${pendingPhotos.length > 0 ? 'has-files' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
                {pendingPhotos.length === 0 ? (
                  <>
                    <ImagePlus size={22} className="drop-zone-icon" />
                    <span className="drop-zone-text">Add photos of the issue</span>
                  </>
                ) : (
                  <div className="pending-photos-grid">
                    {pendingPhotos.map((f, i) => (
                      <div key={i} className="pending-photo-thumb">
                        <img src={URL.createObjectURL(f)} alt={f.name} />
                        <button
                          className="pending-photo-remove"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingPhotos((prev) => prev.filter((_, j) => j !== i));
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="pending-photo-add">
                      <ImagePlus size={16} />
                      <span>Add</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.isUrgent} onChange={(e) => setForm((f) => ({ ...f, isUrgent: e.target.checked }))} />
              Mark as urgent
            </label>
          </div>
          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Create Ticket{pendingPhotos.length > 0 ? ` + ${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
