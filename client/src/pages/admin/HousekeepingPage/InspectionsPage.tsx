import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetHkInspectionsQuery, useCreateHkInspectionMutation,
  useGetHkZonesQuery,
} from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  ClipboardCheck, Plus, Loader2, Inbox, Star, XCircle,
  AlertTriangle, MapPin, Eye, Ticket, Search, Filter,
  Building2, Calendar, User,
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
  const propertyFilter = useSelectedPropertyFilter();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailInsp, setDetailInsp] = useState<any>(null);

  const { data: inspData, isLoading } = useGetHkInspectionsQuery({
    propertyId: propertyFilter || undefined,
  });
  const { data: zonesData } = useGetHkZonesQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createInspection, { isLoading: creating }] = useCreateHkInspectionMutation();

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

  const actionCount = inspections.filter((i: any) => i.actionRequired).length;

  // Score distribution
  const scoreDist = [0, 0, 0, 0, 0, 0]; // idx 1-5
  inspections.forEach((i: any) => { if (i.overallScore >= 1 && i.overallScore <= 5) scoreDist[i.overallScore]++; });

  // Filter
  const filtered = inspections.filter((i: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!(i.zone?.name || '').toLowerCase().includes(q) && !(i.property?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="maint-page">
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ClipboardCheck size={18} color="#fff" />
            </div>
            Inspections
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Quality inspections with per-item scoring and issue tracking
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ borderRadius: 10 }}>
          <Plus size={14} /> New Inspection
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardCheck size={13} /></div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#6366f1' }}>{inspections.length}</div>
        </div>

        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: `linear-gradient(135deg, ${SCORE_COLORS[Math.round(avgScore)] || '#10b981'}08, transparent)`,
          border: `1px solid ${SCORE_COLORS[Math.round(avgScore)] || '#10b981'}18`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${SCORE_COLORS[Math.round(avgScore)] || '#10b981'}15`, color: SCORE_COLORS[Math.round(avgScore)] || '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={13} /></div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg Score</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: SCORE_COLORS[Math.round(avgScore)] || '#10b981' }}>{avgScore.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 600 }}>/5</span></div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{SCORE_LABELS[Math.round(avgScore)] || '—'}</div>
        </div>

        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: actionCount > 0 ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))' : 'linear-gradient(135deg, rgba(16,185,129,0.06), transparent)',
          border: `1px solid ${actionCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: actionCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', color: actionCount > 0 ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={13} /></div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Action Req.</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: actionCount > 0 ? '#ef4444' : '#10b981' }}>{actionCount}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{actionCount === 0 ? 'all clear ✓' : 'need follow-up'}</div>
        </div>

        {/* Score distribution mini */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>Score Distribution</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 36 }}>
            {[1, 2, 3, 4, 5].map(s => {
              const pct = inspections.length > 0 ? (scoreDist[s] / inspections.length) * 100 : 0;
              return (
                <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', borderRadius: 3, minHeight: 4,
                    height: `${Math.max(pct, 8)}%`,
                    background: SCORE_COLORS[s],
                    opacity: scoreDist[s] > 0 ? 0.7 : 0.15,
                    transition: 'height 0.5s',
                  }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)' }}>{s}★</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search by zone or property..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)' }} />
          {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="filter-select" value={propertyFilter} disabled
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            {propertyFilter && (
              <option value={propertyFilter}>{properties.find((p: any) => p.id === propertyFilter)?.name || ''}</option>
            )}
          </select>
        </div>
      </div>

      {/* ── Inspection Cards ── */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading inspections...</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardCheck size={28} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {searchTerm ? 'No inspections match' : 'No inspections yet'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Record your first zone inspection</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map((insp: any) => {
            const checklist = Array.isArray(insp.checklist) ? insp.checklist : [];
            const issues = Array.isArray(insp.issuesFound) ? insp.issuesFound : [];
            const sc = SCORE_COLORS[insp.overallScore || 0] || 'var(--text-tertiary)';

            return (
              <div key={insp.id} style={{
                borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s',
                background: `${sc}06`, border: `1px solid ${sc}18`,
                borderLeft: `4px solid ${sc}`,
              }}
                onClick={() => setDetailInsp(insp)}>
                {/* Score + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <ScoreStars score={insp.overallScore || 0} size={13} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sc }}>
                      {SCORE_LABELS[insp.overallScore || 0]} <span style={{ fontWeight: 800 }}>({insp.overallScore}/5)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={10} />
                      {new Date(insp.inspectionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {insp.actionRequired && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <AlertTriangle size={9} /> Action Required
                      </span>
                    )}
                  </div>
                </div>

                {/* Zone / Property */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {insp.zone && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <MapPin size={9} /> {insp.zone.name}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: 'rgba(107,114,128,0.06)', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <Building2 size={9} /> {insp.property?.name || '—'}
                  </span>
                </div>

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: 8, borderTop: `1px solid ${sc}10`,
                  fontSize: 11, color: 'var(--text-tertiary)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={10} />
                    {insp.inspectedBy?.profile
                      ? `${insp.inspectedBy.profile.firstName} ${insp.inspectedBy.profile.lastName}`
                      : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {issues.length > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                        background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <AlertTriangle size={8} /> {issues.length}
                      </span>
                    )}
                    {checklist.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                        {checklist.length} items
                      </span>
                    )}
                    {insp.ticketId && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                        background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <Ticket size={8} /> Ticket
                      </span>
                    )}
                    <Eye size={11} style={{ opacity: 0.4 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailInsp && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '560px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${SCORE_COLORS[detailInsp.overallScore || 3]}, ${SCORE_COLORS[detailInsp.overallScore || 3]}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardCheck size={16} color="#fff" />
                </div>
                Inspection Detail
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailInsp(null)}><XCircle size={20} /></button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              {/* Score */}
              <div style={{
                textAlign: 'center', padding: '16px 0', borderRadius: 12,
                background: `${SCORE_COLORS[detailInsp.overallScore || 0]}08`,
                marginBottom: 16,
              }}>
                <ScoreStars score={detailInsp.overallScore || 0} size={22} />
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: SCORE_COLORS[detailInsp.overallScore || 0] }}>
                  {SCORE_LABELS[detailInsp.overallScore || 0]} ({detailInsp.overallScore}/5)
                </div>
              </div>

              {/* Meta */}
              <div className="pr-detail-meta">
                <div className="pr-meta-row"><span className="pr-meta-label">Property</span><span>{detailInsp.property?.name || '—'}</span></div>
                {detailInsp.zone && <div className="pr-meta-row"><span className="pr-meta-label">Zone</span><span>{detailInsp.zone.name}</span></div>}
                <div className="pr-meta-row"><span className="pr-meta-label">Date</span><span>{new Date(detailInsp.inspectionDate).toLocaleDateString()}</span></div>
                <div className="pr-meta-row"><span className="pr-meta-label">Inspector</span><span>{detailInsp.inspectedBy?.profile ? `${detailInsp.inspectedBy.profile.firstName} ${detailInsp.inspectedBy.profile.lastName}` : '—'}</span></div>
                <div className="pr-meta-row"><span className="pr-meta-label">Action Required</span><span>{detailInsp.actionRequired ? '⚠️ Yes' : '✅ No'}</span></div>
              </div>

              {/* Checklist */}
              {Array.isArray(detailInsp.checklist) && detailInsp.checklist.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Checklist ({detailInsp.checklist.length} items)</h4>
                  <div className="pr-items-table">
                    <div className="pr-items-header" style={{ gridTemplateColumns: '2fr 1fr 2fr' }}>
                      <span>Item</span><span>Score</span><span>Notes</span>
                    </div>
                    {detailInsp.checklist.map((c: any, i: number) => (
                      <div key={i} className="pr-items-row" style={{ gridTemplateColumns: '2fr 1fr 2fr' }}>
                        <span className="pr-item-name">{c.item}</span>
                        <span><ScoreStars score={c.score || 0} size={11} /></span>
                        <span className="cell-secondary" style={{ fontSize: 12 }}>{c.notes || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues */}
              {Array.isArray(detailInsp.issuesFound) && detailInsp.issuesFound.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={13} /> Issues Found ({detailInsp.issuesFound.length})
                  </h4>
                  <ul className="insp-issues-list">
                    {detailInsp.issuesFound.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '600px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardCheck size={16} color="#fff" />
                </div>
                New Inspection
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreate(false); resetForm(); }}><XCircle size={20} /></button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Property *</label>
                  <select value={formProperty} onChange={(e) => setFormProperty(e.target.value)} style={{ borderRadius: 10 }}>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Zone</label>
                  <select value={formZone} onChange={(e) => setFormZone(e.target.value)} style={{ borderRadius: 10 }}>
                    <option value="">All / General</option>
                    {zones.filter((z: any) => !formProperty || z.propertyId === formProperty)
                      .map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Inspection Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ borderRadius: 10 }} />
                </div>
                <div className="form-group"><label>Overall Score</label>
                  <div className="insp-score-picker">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button"
                        className={`insp-score-btn ${formOverall === s ? 'active' : ''}`}
                        style={{ '--score-color': SCORE_COLORS[s] } as any}
                        onClick={() => setFormOverall(s)}>
                        <Star size={16} fill={formOverall >= s ? SCORE_COLORS[s] : 'none'}
                          color={formOverall >= s ? SCORE_COLORS[s] : 'var(--text-tertiary)'}
                          strokeWidth={formOverall >= s ? 0 : 1.5} />
                        <span style={{ fontSize: 10 }}>{s}</span>
                      </button>
                    ))}
                    <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 8, color: SCORE_COLORS[formOverall] }}>
                      {SCORE_LABELS[formOverall]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checklist */}
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>Inspection Checklist</label>
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
                      <input className="insp-cl-notes" placeholder="Notes..." value={item.notes}
                        onChange={(e) => {
                          const updated = [...formChecklist];
                          updated[idx] = { ...updated[idx], notes: e.target.value };
                          setFormChecklist(updated);
                        }}
                        style={{ borderRadius: 8 }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Issues */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>Issues Found</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input placeholder="Describe an issue..." value={newIssue}
                    onChange={(e) => setNewIssue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())}
                    style={{ flex: 1, borderRadius: 10 }} />
                  <button className="btn btn-secondary btn-sm" type="button" onClick={addIssue}
                    disabled={!newIssue.trim()} style={{ borderRadius: 10 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {formIssues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {formIssues.map((issue, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
                      }}>
                        <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={11} style={{ color: '#f59e0b' }} /> {issue}
                        </span>
                        <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                          onClick={() => setFormIssues(formIssues.filter((_, j) => j !== i))}>
                          <XCircle size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Required */}
              <label className="insp-action-toggle" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={formAction} onChange={(e) => setFormAction(e.target.checked)} />
                <AlertTriangle size={14} />
                <span>Action required — auto-creates a maintenance ticket</span>
              </label>
            </div>

            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating} style={{ borderRadius: 10 }}>
                {creating ? <Loader2 size={14} className="spin" /> : <ClipboardCheck size={14} />} Record Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
