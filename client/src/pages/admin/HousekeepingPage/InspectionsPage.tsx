import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetHkInspectionsQuery, useCreateHkInspectionMutation,
  useGetHkZonesQuery,
} from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  ClipboardCheck, Plus, Loader2, Inbox, Star, XCircle,
  AlertTriangle, MapPin, Eye, Ticket,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SCORE_COLORS = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'];
const SCORE_LABELS = ['', 'Poor', 'Below Avg', 'Average', 'Good', 'Excellent'];

const DEFAULT_CHECKLIST = [
  { item: 'Floor cleanliness', score: 5, notes: '' },
  { item: 'Wall & ceiling condition', score: 5, notes: '' },
  { item: 'Glass & mirrors', score: 5, notes: '' },
  { item: 'Waste bins emptied', score: 5, notes: '' },
  { item: 'Odour control', score: 5, notes: '' },
  { item: 'Fixtures & fittings', score: 5, notes: '' },
];

function ScoreStars({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <span className="insp-stars">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} size={size}
          fill={s <= score ? SCORE_COLORS[score] : 'none'}
          color={s <= score ? SCORE_COLORS[score] : 'var(--text-tertiary)'}
          strokeWidth={s <= score ? 0 : 1.5}
        />
      ))}
    </span>
  );
}

export default function InspectionsPage() {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailInsp, setDetailInsp] = useState<any>(null);

  const { data: inspData, isLoading } = useGetHkInspectionsQuery({
    propertyId: propertyFilter || undefined,
  });
  const { data: zonesData } = useGetHkZonesQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createInspection] = useCreateHkInspectionMutation();

  const inspections = inspData?.data || [];
  const zones = zonesData?.data || [];
  const properties = propsData?.data || [];

  // Create form state
  const [formProperty, setFormProperty] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formOverall, setFormOverall] = useState(4);
  const [formChecklist, setFormChecklist] = useState(DEFAULT_CHECKLIST.map(c => ({ ...c })));
  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [newIssue, setNewIssue] = useState('');
  const [formAction, setFormAction] = useState(false);

  const resetForm = () => {
    setFormProperty(''); setFormZone('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormOverall(4);
    setFormChecklist(DEFAULT_CHECKLIST.map(c => ({ ...c })));
    setFormIssues([]); setNewIssue(''); setFormAction(false);
  };

  const handleCreate = async () => {
    if (!formProperty) return toast.error('Select a property');
    try {
      await createInspection({
        propertyId: formProperty,
        zoneId: formZone || undefined,
        inspectionDate: formDate,
        overallScore: formOverall,
        checklist: formChecklist,
        issuesFound: formIssues,
        actionRequired: formAction,
      }).unwrap();
      toast.success('Inspection recorded');
      setShowCreate(false);
      resetForm();
    } catch { toast.error('Failed to create inspection'); }
  };

  const addIssue = () => {
    if (newIssue.trim()) {
      setFormIssues([...formIssues, newIssue.trim()]);
      setNewIssue('');
    }
  };

  const avgScore = inspections.length > 0
    ? (inspections.reduce((sum: number, i: any) => sum + (i.overallScore || 0), 0) / inspections.length)
    : 0;

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><ClipboardCheck size={22} /></div>
          <div>
            <h1>Housekeeping Inspections</h1>
            <p>Quality inspections with per-item scoring and issue tracking</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Inspection
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><ClipboardCheck size={18} /></div>
          <span className="msc-value">{inspections.length}</span>
          <span className="msc-label">Total Inspections</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><Star size={18} /></div>
          <span className="msc-value">{avgScore.toFixed(1)}</span>
          <span className="msc-label">Avg Score</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><AlertTriangle size={18} /></div>
          <span className="msc-value">{inspections.filter((i: any) => i.actionRequired).length}</span>
          <span className="msc-label">Action Required</span>
        </div>
      </div>

      {/* Filter */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading inspections...</div>
      ) : inspections.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No inspections yet</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Click "New Inspection" to record your first zone inspection
          </p>
        </div>
      ) : (
        <div className="insp-grid">
          {inspections.map((insp: any) => {
            const checklist = Array.isArray(insp.checklist) ? insp.checklist : [];
            const issues = Array.isArray(insp.issuesFound) ? insp.issuesFound : [];
            return (
              <div key={insp.id} className="insp-card" onClick={() => setDetailInsp(insp)}>
                <div className="insp-card-top">
                  <div className="insp-card-score">
                    <ScoreStars score={insp.overallScore || 0} />
                    <span className="insp-score-label" style={{ color: SCORE_COLORS[insp.overallScore || 0] }}>
                      {SCORE_LABELS[insp.overallScore || 0]}
                    </span>
                  </div>
                  <span className="cell-secondary" style={{ fontSize: '12px' }}>
                    {new Date(insp.inspectionDate).toLocaleDateString()}
                  </span>
                </div>

                <div className="insp-card-body">
                  {insp.zone && (
                    <div className="insp-zone-tag">
                      <MapPin size={12} /> {insp.zone.name}
                    </div>
                  )}
                  <span className="insp-property">{insp.property?.name}</span>
                </div>

                <div className="insp-card-footer">
                  <span className="cell-secondary" style={{ fontSize: '11px' }}>
                    By {insp.inspectedBy?.profile
                      ? `${insp.inspectedBy.profile.firstName} ${insp.inspectedBy.profile.lastName}`
                      : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {issues.length > 0 && (
                      <span className="insp-issue-badge">
                        <AlertTriangle size={10} /> {issues.length}
                      </span>
                    )}
                    {insp.actionRequired && (
                      <span className="maint-status cancelled" style={{ fontSize: '10px' }}>Action</span>
                    )}
                    {insp.ticketId && (
                      <span className="maint-status in_progress" style={{ fontSize: '10px' }}>
                        <Ticket size={10} /> Ticket
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detailInsp && (
        <div className="maint-modal-backdrop" onClick={() => setDetailInsp(null)}>
          <div className="maint-modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><ClipboardCheck size={18} /></span> Inspection Detail</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailInsp(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              {/* Score */}
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <ScoreStars score={detailInsp.overallScore || 0} size={22} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: SCORE_COLORS[detailInsp.overallScore || 0] }}>
                  {SCORE_LABELS[detailInsp.overallScore || 0]} ({detailInsp.overallScore}/5)
                </div>
              </div>

              {/* Meta */}
              <div className="pr-detail-meta">
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Property</span>
                  <span>{detailInsp.property?.name || '—'}</span>
                </div>
                {detailInsp.zone && (
                  <div className="pr-meta-row">
                    <span className="pr-meta-label">Zone</span>
                    <span>{detailInsp.zone.name}</span>
                  </div>
                )}
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Date</span>
                  <span>{new Date(detailInsp.inspectionDate).toLocaleDateString()}</span>
                </div>
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Inspector</span>
                  <span>
                    {detailInsp.inspectedBy?.profile
                      ? `${detailInsp.inspectedBy.profile.firstName} ${detailInsp.inspectedBy.profile.lastName}`
                      : '—'}
                  </span>
                </div>
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Action Required</span>
                  <span>{detailInsp.actionRequired ? '⚠️ Yes' : '✅ No'}</span>
                </div>
              </div>

              {/* Checklist Scores */}
              {Array.isArray(detailInsp.checklist) && detailInsp.checklist.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                    Checklist ({detailInsp.checklist.length} items)
                  </h4>
                  <div className="pr-items-table">
                    <div className="pr-items-header" style={{ gridTemplateColumns: '2fr 1fr 2fr' }}>
                      <span>Item</span><span>Score</span><span>Notes</span>
                    </div>
                    {detailInsp.checklist.map((c: any, i: number) => (
                      <div key={i} className="pr-items-row" style={{ gridTemplateColumns: '2fr 1fr 2fr' }}>
                        <span className="pr-item-name">{c.item}</span>
                        <span>
                          <ScoreStars score={c.score || 0} size={11} />
                        </span>
                        <span className="cell-secondary" style={{ fontSize: '12px' }}>{c.notes || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues */}
              {Array.isArray(detailInsp.issuesFound) && detailInsp.issuesFound.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#f59e0b' }}>
                    <AlertTriangle size={13} /> Issues Found ({detailInsp.issuesFound.length})
                  </h4>
                  <ul className="insp-issues-list">
                    {detailInsp.issuesFound.map((issue: string, i: number) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Inspection Modal */}
      {showCreate && (
        <div className="maint-modal-backdrop" onClick={() => { setShowCreate(false); resetForm(); }}>
          <div className="maint-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><ClipboardCheck size={18} /></span> New Inspection</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreate(false); resetForm(); }}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              {/* Property + Zone + Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Property *</label>
                  <select value={formProperty} onChange={(e) => setFormProperty(e.target.value)}>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Zone</label>
                  <select value={formZone} onChange={(e) => setFormZone(e.target.value)}>
                    <option value="">All / General</option>
                    {zones.filter((z: any) => !formProperty || z.propertyId === formProperty)
                      .map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Inspection Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Overall Score</label>
                  <div className="insp-score-picker">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button"
                        className={`insp-score-btn ${formOverall === s ? 'active' : ''}`}
                        style={{ '--score-color': SCORE_COLORS[s] } as any}
                        onClick={() => setFormOverall(s)}>
                        <Star size={16} fill={formOverall >= s ? SCORE_COLORS[s] : 'none'}
                          color={formOverall >= s ? SCORE_COLORS[s] : 'var(--text-tertiary)'}
                          strokeWidth={formOverall >= s ? 0 : 1.5} />
                        <span style={{ fontSize: '10px' }}>{s}</span>
                      </button>
                    ))}
                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '8px', color: SCORE_COLORS[formOverall] }}>
                      {SCORE_LABELS[formOverall]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                  Inspection Checklist
                </label>
                <div className="insp-checklist-form">
                  {formChecklist.map((item, idx) => (
                    <div key={idx} className="insp-checklist-row">
                      <span className="insp-cl-name">{item.item}</span>
                      <div className="insp-cl-score">
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} type="button"
                            className={`insp-cl-star ${item.score >= s ? 'filled' : ''}`}
                            onClick={() => {
                              const updated = [...formChecklist];
                              updated[idx] = { ...updated[idx], score: s };
                              setFormChecklist(updated);
                            }}>
                            <Star size={13}
                              fill={item.score >= s ? SCORE_COLORS[item.score] : 'none'}
                              color={item.score >= s ? SCORE_COLORS[item.score] : 'var(--text-tertiary)'}
                              strokeWidth={item.score >= s ? 0 : 1.5} />
                          </button>
                        ))}
                      </div>
                      <input className="insp-cl-notes" placeholder="Notes..."
                        value={item.notes}
                        onChange={(e) => {
                          const updated = [...formChecklist];
                          updated[idx] = { ...updated[idx], notes: e.target.value };
                          setFormChecklist(updated);
                        }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Issues Found */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                  Issues Found
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input placeholder="Describe an issue..."
                    value={newIssue} onChange={(e) => setNewIssue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())}
                    style={{ flex: 1 }} />
                  <button className="btn btn-secondary btn-sm" type="button" onClick={addIssue}
                    disabled={!newIssue.trim()}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {formIssues.length > 0 && (
                  <ul className="insp-issues-list">
                    {formIssues.map((issue, i) => (
                      <li key={i}>
                        {issue}
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: '#ef4444' }}
                          onClick={() => setFormIssues(formIssues.filter((_, j) => j !== i))}>
                          <XCircle size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Action Required */}
              <label className="insp-action-toggle" style={{ marginTop: '12px' }}>
                <input type="checkbox" checked={formAction}
                  onChange={(e) => setFormAction(e.target.checked)} />
                <AlertTriangle size={14} />
                <span>Action required — auto-creates a maintenance ticket</span>
              </label>
            </div>

            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>
                <ClipboardCheck size={16} /> Record Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
