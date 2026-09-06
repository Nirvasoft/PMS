import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetTicketQuery, useAssignTicketMutation, useAutoAssignTicketMutation,
  useEscalateTicketMutation, useCancelTicketMutation, useRateTicketMutation,
  useStartWorkOrderMutation, useCompleteWorkOrderMutation,
  useOnHoldWorkOrderMutation, useResumeWorkOrderMutation,
  useGetTechniciansQuery, useUploadTicketPhotosMutation,
} from '../../../store/api/maintenanceApi';
import {
  Wrench, ArrowLeft, Clock, AlertTriangle, User, MapPin, Star,
  Play, CheckCircle2, PauseCircle, XCircle, UserPlus, Zap,
  Loader2, Camera, Package, ChevronDown, ChevronUp, Upload, ImagePlus, X,
} from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const PRIORITIES: Record<string, { label: string; color: string }> = {
  P1: { label: 'P1 — Emergency', color: '#ef4444' },
  P2: { label: 'P2 — Urgent', color: '#f97316' },
  P3: { label: 'P3 — Normal', color: '#3b82f6' },
  P4: { label: 'P4 — Low', color: '#94a3b8' },
};

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

const WO_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#94a3b8' },
  accepted: { label: 'Accepted', color: '#8b5cf6' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  on_hold: { label: 'On Hold', color: '#f97316' },
  completed: { label: 'Completed', color: '#22c55e' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: resp, isLoading, refetch } = useGetTicketQuery(id!);
  const ticket = resp?.data;

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [expandedWo, setExpandedWo] = useState<string | null>(null);

  const [autoAssign, { isLoading: isAutoAssigning }] = useAutoAssignTicketMutation();
  const [startWo] = useStartWorkOrderMutation();
  const [completeWo] = useCompleteWorkOrderMutation();
  const [holdWo] = useOnHoldWorkOrderMutation();
  const [resumeWo] = useResumeWorkOrderMutation();
  const [uploadPhotos, { isLoading: isUploading }] = useUploadTicketPhotosMutation();

  // Photo upload state
  const [photoType, setPhotoType] = useState<'before' | 'during' | 'after'>('before');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <div className="loading-state"><Loader2 size={24} className="spinner" /> Loading...</div>;
  if (!ticket) return <div className="empty-state">Ticket not found</div>;

  const priority = PRIORITIES[ticket.priority] || PRIORITIES.P3;
  const status = STATUS_LABELS[ticket.status] || STATUS_LABELS.open;

  // SLA progress
  const slaProgress = (() => {
    if (!ticket.slaResolveDueAt) return null;
    const now = Date.now();
    const created = new Date(ticket.createdAt).getTime();
    const due = new Date(ticket.slaResolveDueAt).getTime();
    const total = due - created;
    const elapsed = now - created;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const remaining = (due - now) / 3600000;
    return { pct, remaining, breached: remaining <= 0 };
  })();

  const handleAutoAssign = async () => {
    try {
      await autoAssign(ticket.id).unwrap();
      toast.success('Ticket auto-assigned');
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Auto-assign failed');
    }
  };

  const handleWoAction = async (action: string, woId: string, payload?: any) => {
    try {
      switch (action) {
        case 'start': await startWo({ id: woId }).unwrap(); break;
        case 'complete': await completeWo({ id: woId, data: payload || {} }).unwrap(); break;
        case 'hold': await holdWo({ id: woId, reason: payload }).unwrap(); break;
        case 'resume': await resumeWo(woId).unwrap(); break;
      }
      toast.success(`Work order ${action}ed`);
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || `Failed to ${action}`);
    }
  };

  // ── Photo upload handlers ──────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Only image files are allowed');
      return;
    }
    setPendingFiles((prev) => [...prev, ...imageFiles].slice(0, 10));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUploadPhotos = async () => {
    if (pendingFiles.length === 0 || !ticket) return;
    const formData = new FormData();
    pendingFiles.forEach((f) => formData.append('photos', f));
    formData.append('photoType', photoType);
    try {
      await uploadPhotos({ ticketId: ticket.id, formData }).unwrap();
      toast.success(`${pendingFiles.length} photo(s) uploaded`);
      setPendingFiles([]);
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Upload failed');
    }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header-row">
        <div className="page-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/maintenance')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div className="ticket-detail-title">
              <span className="font-mono">{ticket.ticketNumber}</span>
              <span className="priority-badge" style={{ '--badge-color': priority.color } as React.CSSProperties}>
                {ticket.priority}
              </span>
              <span className="status-badge" style={{ '--badge-color': status.color } as React.CSSProperties}>
                {status.label}
              </span>
              {ticket.isUrgent && <AlertTriangle size={16} className="urgent-icon" />}
            </div>
            <h1 style={{ fontSize: '1.25rem', marginTop: 4 }}>{ticket.title}</h1>
          </div>
        </div>
        <PermissionGuard permission="maintenance-tickets.write">
          <div className="page-header-right">
            {ticket.status === 'open' && (
              <>
                <button className="btn btn-secondary" onClick={() => setShowAssignModal(true)}>
                  <UserPlus size={16} /> Assign
                </button>
                <button className="btn btn-accent" onClick={handleAutoAssign} disabled={isAutoAssigning}>
                  {isAutoAssigning ? <Loader2 size={16} className="spinner" /> : <Zap size={16} />}
                  Auto-Assign
                </button>
              </>
            )}
            {!['completed', 'closed', 'cancelled'].includes(ticket.status) && (
              <>
                <button className="btn btn-warning" onClick={() => setShowEscalateModal(true)}>Escalate</button>
                <button className="btn btn-danger" onClick={() => setShowCancelModal(true)}>Cancel</button>
              </>
            )}
            {ticket.status === 'completed' && !ticket.rating && (
              <button className="btn btn-secondary" onClick={() => setShowRateModal(true)}>
                <Star size={16} /> Rate
              </button>
            )}
          </div>
        </PermissionGuard>
      </div>

      {/* SLA Bar */}
      {slaProgress && (
        <div className={`sla-progress-bar ${slaProgress.breached ? 'sla-breached' : ''}`}>
          <div className="sla-progress-track">
            <div className="sla-progress-fill" style={{ width: `${slaProgress.pct}%` }} />
          </div>
          <div className="sla-progress-info">
            <Clock size={14} />
            {slaProgress.breached
              ? `SLA breached ${Math.abs(Math.round(slaProgress.remaining))}h ago`
              : `${Math.round(slaProgress.remaining * 10) / 10}h remaining`}
          </div>
        </div>
      )}

      <div className="detail-grid">
        {/* Left Column: Info + Work Orders */}
        <div className="detail-main">
          {/* Description */}
          <div className="detail-card">
            <h3>Description</h3>
            <p className="detail-description">{ticket.description || 'No description provided'}</p>
          </div>

          {/* Info Grid */}
          <div className="detail-card">
            <h3>Details</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Category</span>
                <span className="info-value">{ticket.category.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Property</span>
                <span className="info-value">{ticket.property.name}</span>
              </div>
              {ticket.unit && (
                <div className="info-item">
                  <span className="info-label">Unit</span>
                  <span className="info-value">{ticket.unit.unitNumber}</span>
                </div>
              )}
              {ticket.locationDetail && (
                <div className="info-item">
                  <span className="info-label">Location</span>
                  <span className="info-value"><MapPin size={12} /> {ticket.locationDetail}</span>
                </div>
              )}
              <div className="info-item">
                <span className="info-label">Source</span>
                <span className="info-value capitalize">{ticket.source}</span>
              </div>
              {ticket.reportedByUser && (
                <div className="info-item">
                  <span className="info-label">Reported By</span>
                  <span className="info-value">
                    {ticket.reportedByUser.profile
                      ? `${ticket.reportedByUser.profile.firstName} ${ticket.reportedByUser.profile.lastName}`
                      : ticket.reportedByUser.email}
                  </span>
                </div>
              )}
              {ticket.estimatedCost && (
                <div className="info-item">
                  <span className="info-label">Est. Cost</span>
                  <span className="info-value">${Number(ticket.estimatedCost).toLocaleString()}</span>
                </div>
              )}
              {ticket.actualCost && (
                <div className="info-item">
                  <span className="info-label">Actual Cost</span>
                  <span className="info-value">${Number(ticket.actualCost).toLocaleString()}</span>
                </div>
              )}
              <div className="info-item">
                <span className="info-label">Created</span>
                <span className="info-value">{new Date(ticket.createdAt).toLocaleString()}</span>
              </div>
              {ticket.resolvedAt && (
                <div className="info-item">
                  <span className="info-label">Resolved</span>
                  <span className="info-value">{new Date(ticket.resolvedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rating */}
          {ticket.rating && (
            <div className="detail-card rating-card">
              <h3>Tenant Rating</h3>
              <div className="rating-display">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={20} className={i < ticket.rating! ? 'star-filled' : 'star-empty'} />
                ))}
                <span className="rating-value">{ticket.rating}/5</span>
              </div>
              {ticket.ratingComment && <p className="rating-comment">"{ticket.ratingComment}"</p>}
            </div>
          )}

          {/* Photos */}
          <div className="detail-card">
            <div className="photo-section-header">
              <h3><Camera size={16} /> Photos ({ticket.photos.length})</h3>
            </div>

            {/* Existing Photos Gallery */}
            {ticket.photos.length > 0 && (
              <div className="photo-gallery">
                {ticket.photos.map((photo) => (
                  <div key={photo.id} className="photo-item">
                    <img src={photo.url} alt={photo.caption || 'Ticket photo'} />
                    <span className="photo-type-badge">{photo.photoType}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Zone — show on non-closed/cancelled tickets */}
            {!['closed', 'cancelled'].includes(ticket.status) && (
              <div className="photo-upload-section">
                <div
                  className={`photo-drop-zone ${isDragging ? 'dragging' : ''} ${pendingFiles.length > 0 ? 'has-files' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                  />
                  {pendingFiles.length === 0 ? (
                    <>
                      <ImagePlus size={28} className="drop-zone-icon" />
                      <span className="drop-zone-text">Drop photos here or click to browse</span>
                      <span className="drop-zone-hint">Up to 10 images, 10MB each</span>
                    </>
                  ) : (
                    <div className="pending-photos-grid">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="pending-photo-thumb">
                          <img src={URL.createObjectURL(f)} alt={f.name} />
                          <button
                            className="pending-photo-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingFiles((prev) => prev.filter((_, j) => j !== i));
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <div className="pending-photo-add">
                        <ImagePlus size={20} />
                        <span>Add more</span>
                      </div>
                    </div>
                  )}
                </div>

                {pendingFiles.length > 0 && (
                  <div className="photo-upload-controls">
                    <div className="photo-type-selector">
                      <label>Photo type:</label>
                      {(['before', 'during', 'after'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`photo-type-btn ${photoType === t ? 'active' : ''}`}
                          onClick={() => setPhotoType(t)}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleUploadPhotos}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 size={14} className="spinner" /> : <Upload size={14} />}
                      Upload {pendingFiles.length} photo{pendingFiles.length > 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Work Orders */}
          <div className="detail-card">
            <h3><Wrench size={16} /> Work Orders ({ticket.workOrders.length})</h3>
            {ticket.workOrders.length === 0 ? (
              <p className="empty-state-inline">No work orders yet</p>
            ) : ticket.workOrders.map((wo) => {
              const woStatus = WO_STATUS_LABELS[wo.status] || WO_STATUS_LABELS.pending;
              const isExpanded = expandedWo === wo.id;

              return (
                <div key={wo.id} className="wo-card">
                  <div className="wo-card-header" onClick={() => setExpandedWo(isExpanded ? null : wo.id)}>
                    <div className="wo-card-info">
                      <span className="font-mono">{wo.woNumber}</span>
                      <span className="status-badge" style={{ '--badge-color': woStatus.color } as React.CSSProperties}>
                        {woStatus.label}
                      </span>
                    </div>
                    <div className="wo-card-actions">
                      <PermissionGuard permission="maintenance-tickets.write">
                        {wo.status === 'pending' && (
                          <button className="btn btn-sm btn-accent" onClick={(e) => { e.stopPropagation(); handleWoAction('start', wo.id); }}>
                            <Play size={14} /> Start
                          </button>
                        )}
                        {wo.status === 'in_progress' && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleWoAction('complete', wo.id); }}>
                              <CheckCircle2 size={14} /> Complete
                            </button>
                            <button className="btn btn-sm btn-warning" onClick={(e) => {
                              e.stopPropagation();
                              const reason = window.prompt('Why is this on hold?');
                              if (reason) handleWoAction('hold', wo.id, reason);
                            }}>
                              <PauseCircle size={14} /> Hold
                            </button>
                          </>
                        )}
                        {wo.status === 'on_hold' && (
                          <button className="btn btn-sm btn-accent" onClick={(e) => { e.stopPropagation(); handleWoAction('resume', wo.id); }}>
                            <Play size={14} /> Resume
                          </button>
                        )}
                      </PermissionGuard>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="wo-card-body">
                      <div className="info-grid">
                        <div className="info-item">
                          <span className="info-label">Assigned To</span>
                          <span className="info-value">{
                            wo.assignedTo.profile
                              ? `${wo.assignedTo.profile.firstName} ${wo.assignedTo.profile.lastName}`
                              : wo.assignedTo.email
                          }</span>
                        </div>
                        {wo.scheduledStart && (
                          <div className="info-item">
                            <span className="info-label">Scheduled</span>
                            <span className="info-value">{new Date(wo.scheduledStart).toLocaleString()}</span>
                          </div>
                        )}
                        {wo.actualStart && (
                          <div className="info-item">
                            <span className="info-label">Started</span>
                            <span className="info-value">{new Date(wo.actualStart).toLocaleString()}</span>
                          </div>
                        )}
                        {wo.actualEnd && (
                          <div className="info-item">
                            <span className="info-label">Completed</span>
                            <span className="info-value">{new Date(wo.actualEnd).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="info-item">
                          <span className="info-label">Labor Cost</span>
                          <span className="info-value">${Number(wo.laborCost || 0).toLocaleString()}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Materials</span>
                          <span className="info-value">${Number(wo.materialsCost).toLocaleString()}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Total Cost</span>
                          <span className="info-value font-bold">${Number(wo.totalCost).toLocaleString()}</span>
                        </div>
                      </div>

                      {wo.materials.length > 0 && (
                        <div className="materials-table">
                          <h4><Package size={14} /> Materials Used</h4>
                          <table className="data-table compact">
                            <thead>
                              <tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr>
                            </thead>
                            <tbody>
                              {wo.materials.map((m) => (
                                <tr key={m.id}>
                                  <td>{m.itemName}</td>
                                  <td>{Number(m.quantity)}</td>
                                  <td>${Number(m.unitCost).toFixed(2)}</td>
                                  <td>${Number(m.totalCost).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {wo.completionNotes && (
                        <div className="wo-notes">
                          <h4>Completion Notes</h4>
                          <p>{wo.completionNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SLA Breaches */}
          {ticket.slaBreachEvents.length > 0 && (
            <div className="detail-card breach-card">
              <h3><AlertTriangle size={16} /> SLA Breaches</h3>
              {ticket.slaBreachEvents.map((b) => (
                <div key={b.id} className="breach-item">
                  <span className="breach-type">{b.breachType === 'response' ? 'Response SLA' : 'Resolution SLA'}</span>
                  <span className="breach-time">{new Date(b.breachedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Assignment Panel */}
        <div className="detail-sidebar">
          <div className="detail-card">
            <h3><User size={16} /> Assignment</h3>
            {ticket.assignedTo ? (
              <div className="assignee-card">
                <div className="assignee-avatar">
                  {ticket.assignedTo.profile
                    ? `${ticket.assignedTo.profile.firstName[0]}${ticket.assignedTo.profile.lastName[0]}`
                    : ticket.assignedTo.email[0].toUpperCase()}
                </div>
                <div>
                  <div className="assignee-name">
                    {ticket.assignedTo.profile
                      ? `${ticket.assignedTo.profile.firstName} ${ticket.assignedTo.profile.lastName}`
                      : ticket.assignedTo.email}
                  </div>
                  {ticket.assignedTo.technicianProfile?.skills.length ? (
                    <div className="assignee-skills">
                      {ticket.assignedTo.technicianProfile.skills.slice(0, 3).map((s) => (
                        <span key={s} className="skill-tag">{s}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="empty-state-inline">Not assigned yet</p>
            )}
          </div>

          {ticket.escalationLevel > 0 && (
            <div className="detail-card escalation-card">
              <h3>Escalation Level {ticket.escalationLevel}</h3>
              {ticket.escalatedTo && (
                <p>Escalated to: {ticket.escalatedTo.profile
                  ? `${ticket.escalatedTo.profile.firstName} ${ticket.escalatedTo.profile.lastName}`
                  : ticket.escalatedTo.email}</p>
              )}
            </div>
          )}

          {/* SLA Info */}
          <div className="detail-card">
            <h3><Clock size={16} /> SLA Status</h3>
            <div className="sla-info">
              {ticket.slaResponseDueAt && (
                <div className="sla-item">
                  <span className="sla-item-label">Response</span>
                  <span className={`sla-item-value ${ticket.slaResponseMet === true ? 'sla-met' : ticket.slaResponseMet === false ? 'sla-breached-text' : ''}`}>
                    {ticket.slaResponseMet === true ? '✓ Met' : ticket.slaResponseMet === false ? '✗ Breached' : 'Pending'}
                  </span>
                </div>
              )}
              {ticket.slaResolveDueAt && (
                <div className="sla-item">
                  <span className="sla-item-label">Resolution</span>
                  <span className={`sla-item-value ${ticket.slaResolveMet === true ? 'sla-met' : ticket.slaResolveMet === false ? 'sla-breached-text' : ''}`}>
                    {ticket.slaResolveMet === true ? '✓ Met' : ticket.slaResolveMet === false ? '✗ Breached' : 'Pending'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="detail-card">
            <h3><Clock size={16} /> Activity Timeline</h3>
            <ActivityTimeline ticket={ticket} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAssignModal && <AssignModal ticketId={ticket.id} propertyId={ticket.property.id} onClose={() => { setShowAssignModal(false); refetch(); }} />}
      {showEscalateModal && <EscalateModal ticketId={ticket.id} onClose={() => { setShowEscalateModal(false); refetch(); }} />}
      {showCancelModal && <CancelModal ticketId={ticket.id} onClose={() => { setShowCancelModal(false); refetch(); }} />}
      {showRateModal && <RateModal ticketId={ticket.id} onClose={() => { setShowRateModal(false); refetch(); }} />}
    </div>
  );
}

// ── Activity Timeline ───────────────────────

interface TimelineEvent {
  time: Date;
  icon: React.ReactNode;
  color: string;
  title: string;
  detail?: string;
}

function ActivityTimeline({ ticket }: { ticket: any }) {
  const events: TimelineEvent[] = [];

  // Created
  events.push({
    time: new Date(ticket.createdAt),
    icon: <Wrench size={12} />,
    color: '#3b82f6',
    title: 'Ticket created',
    detail: `${ticket.priority} — ${ticket.source}`,
  });

  // Assigned
  if (ticket.assignedAt) {
    const assignee = ticket.assignedTo?.profile
      ? `${ticket.assignedTo.profile.firstName} ${ticket.assignedTo.profile.lastName}`
      : ticket.assignedTo?.email || 'Unknown';
    events.push({
      time: new Date(ticket.assignedAt),
      icon: <UserPlus size={12} />,
      color: '#8b5cf6',
      title: 'Assigned',
      detail: `to ${assignee}`,
    });
  }

  // First response
  if (ticket.firstResponseAt) {
    events.push({
      time: new Date(ticket.firstResponseAt),
      icon: <CheckCircle2 size={12} />,
      color: '#22c55e',
      title: 'First response',
      detail: ticket.slaResponseMet === true ? 'SLA met ✓' : ticket.slaResponseMet === false ? 'SLA breached ✗' : undefined,
    });
  }

  // Work order events
  ticket.workOrders?.forEach((wo: any) => {
    if (wo.actualStart) {
      events.push({
        time: new Date(wo.actualStart),
        icon: <Play size={12} />,
        color: '#f59e0b',
        title: `WO ${wo.woNumber} started`,
        detail: wo.assignedTo?.profile ? `${wo.assignedTo.profile.firstName} ${wo.assignedTo.profile.lastName}` : undefined,
      });
    }
    if (wo.actualEnd) {
      events.push({
        time: new Date(wo.actualEnd),
        icon: <CheckCircle2 size={12} />,
        color: '#22c55e',
        title: `WO ${wo.woNumber} completed`,
        detail: wo.totalCost ? `Cost: $${Number(wo.totalCost).toLocaleString()}` : undefined,
      });
    }
  });

  // SLA breaches
  ticket.slaBreachEvents?.forEach((b: any) => {
    events.push({
      time: new Date(b.breachedAt),
      icon: <AlertTriangle size={12} />,
      color: '#ef4444',
      title: `${b.breachType === 'response' ? 'Response' : 'Resolution'} SLA breached`,
    });
  });

  // Escalation
  if (ticket.escalatedAt) {
    const target = ticket.escalatedTo?.profile
      ? `${ticket.escalatedTo.profile.firstName} ${ticket.escalatedTo.profile.lastName}`
      : ticket.escalatedTo?.email;
    events.push({
      time: new Date(ticket.escalatedAt),
      icon: <AlertTriangle size={12} />,
      color: '#f97316',
      title: `Escalated to level ${ticket.escalationLevel}`,
      detail: target ? `→ ${target}` : undefined,
    });
  }

  // Resolved
  if (ticket.resolvedAt) {
    events.push({
      time: new Date(ticket.resolvedAt),
      icon: <CheckCircle2 size={12} />,
      color: '#22c55e',
      title: 'Resolved',
      detail: ticket.slaResolveMet === true ? 'SLA met ✓' : ticket.slaResolveMet === false ? 'SLA breached ✗' : undefined,
    });
  }

  // Rated
  if (ticket.ratedAt) {
    events.push({
      time: new Date(ticket.ratedAt),
      icon: <Star size={12} />,
      color: '#f59e0b',
      title: `Rated ${ticket.rating}/5`,
      detail: ticket.ratingComment && !ticket.ratingComment.startsWith('__') ? `"${ticket.ratingComment}"` : undefined,
    });
  }

  // Sort chronologically
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  const formatTime = (d: Date) => {
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="activity-timeline">
      {events.map((ev, i) => (
        <div key={i} className="tl-item">
          <div className="tl-line-wrap">
            <div className="tl-dot" style={{ backgroundColor: ev.color }}>{ev.icon}</div>
            {i < events.length - 1 && <div className="tl-line" />}
          </div>
          <div className="tl-content">
            <div className="tl-title">{ev.title}</div>
            {ev.detail && <div className="tl-detail">{ev.detail}</div>}
            <div className="tl-time">{formatTime(ev.time)}</div>
          </div>
        </div>
      ))}
      {events.length === 0 && <p className="empty-state-inline">No activity yet</p>}
    </div>
  );
}

// ── Sub-Modals ──────────────────────────────

function AssignModal({ ticketId, propertyId, onClose }: { ticketId: string; propertyId: string; onClose: () => void }) {
  const [assignTicket, { isLoading }] = useAssignTicketMutation();
  const { data: techData } = useGetTechniciansQuery({ propertyId, isAvailable: 'true' });
  const techs = techData?.data || [];
  const [form, setForm] = useState({ technicianId: '', scheduledStart: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assignTicket({ id: ticketId, data: form }).unwrap();
      toast.success('Ticket assigned');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Assignment failed');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Assign Ticket</h2><button className="btn-icon" onClick={onClose}><XCircle size={20} /></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Technician *</label>
              <select required value={form.technicianId} onChange={(e) => setForm((f) => ({ ...f, technicianId: e.target.value }))}>
                <option value="">Select technician</option>
                {techs.map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {t.fullName} ({t.openJobs}/{t.maxConcurrentJobs} jobs)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Scheduled Start *</label>
              <input type="datetime-local" required value={form.scheduledStart} onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spinner" /> : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EscalateModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [escalate, { isLoading }] = useEscalateTicketMutation();
  const [form, setForm] = useState({ escalateTo: '', reason: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await escalate({ id: ticketId, data: form }).unwrap();
      toast.success('Ticket escalated');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Escalation failed');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Escalate Ticket</h2><button className="btn-icon" onClick={onClose}><XCircle size={20} /></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Reason *</label>
              <textarea rows={3} required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this being escalated?" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-warning" disabled={isLoading}>Escalate</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CancelModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [cancelTicket, { isLoading }] = useCancelTicketMutation();
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await cancelTicket({ id: ticketId, reason }).unwrap();
      toast.success('Ticket cancelled');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Cancellation failed');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Cancel Ticket</h2><button className="btn-icon" onClick={onClose}><XCircle size={20} /></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Reason *</label>
              <textarea rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this ticket being cancelled?" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={isLoading}>Confirm Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RateModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [rateTicket, { isLoading }] = useRateTicketMutation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { toast.error('Please select a rating'); return; }
    try {
      await rateTicket({ id: ticketId, rating, comment }).unwrap();
      toast.success('Rating submitted');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Rating failed');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Rate Service</h2><button className="btn-icon" onClick={onClose}><XCircle size={20} /></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="rating-selector">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`rating-star-btn ${rating >= n ? 'active' : ''}`} onClick={() => setRating(n)}>
                  <Star size={28} />
                </button>
              ))}
            </div>
            <div className="form-group">
              <label>Comment (optional)</label>
              <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Any feedback?" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Skip</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>Submit Rating</button>
          </div>
        </form>
      </div>
    </div>
  );
}
