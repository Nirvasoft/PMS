import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetBylawsQuery, useCreateBylawMutation, useUpdateBylawMutation,
  useGetViolationsQuery, useCreateViolationMutation,
  useFineViolationMutation, useResolveViolationMutation,
  useAppealViolationMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Gavel, Plus, Edit, MessageCircle, Shield } from 'lucide-react';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../components/TableScrollWrapper';

const CATEGORIES = ['noise', 'pets', 'parking', 'renovation', 'common_area'];
const SEVERITIES = ['warning', 'minor', 'major'];

export default function BylawsPage() {
  
  const propertyId = useSelectedPropertyId();

  const [activeTab, setActiveTab] = useState(0);
  const [showCreateBylaw, setShowCreateBylaw] = useState(false);
  const [bylawSubmitted, setBylawSubmitted] = useState(false);
  const [showCreateViolation, setShowCreateViolation] = useState(false);
  const [violationSubmitted, setViolationSubmitted] = useState(false);
  const [showFine, setShowFine] = useState<string | null>(null);
  const [fineSubmitted, setFineSubmitted] = useState(false);
  const [showAppeal, setShowAppeal] = useState<string | null>(null);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [showEditBylaw, setShowEditBylaw] = useState<any | null>(null);
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: bylawsRes, isLoading: loadingBylaws } = useGetBylawsQuery({ propertyId }, { skip: !propertyId });
  const bylaws = bylawsRes?.data || [];

  const { data: violationsRes, isLoading: loadingViolations } = useGetViolationsQuery(
    { propertyId, status: statusFilter || undefined }, { skip: !propertyId },
  );
  const violations = violationsRes?.data || [];

  const [createBylaw] = useCreateBylawMutation();
  const [updateBylaw] = useUpdateBylawMutation();
  const [createViolation] = useCreateViolationMutation();
  const [fineViolation] = useFineViolationMutation();
  const [resolveViolation] = useResolveViolationMutation();
  const [appealViolation] = useAppealViolationMutation();

  const [bylawForm, setBylawForm] = useState({ bylawNo: '', title: '', content: '', category: 'noise', effectiveDate: new Date().toISOString().slice(0, 10) });
  const [violationForm, setViolationForm] = useState({ bylawId: '', unitId: '', description: '', severity: 'warning' });
  const [fineForm, setFineForm] = useState({ fineAmount: '', notes: '' });
  const [appealNotes, setAppealNotes] = useState('');
  const [editBylawForm, setEditBylawForm] = useState({ title: '', content: '', category: 'noise', effectiveDate: '', isActive: true });

  const handleCreateBylaw = async () => {
    setBylawSubmitted(true);
    if (!bylawForm.bylawNo.trim() || !bylawForm.title.trim() || !bylawForm.content.trim()) return;
    await createBylaw({ propertyId, ...bylawForm });
    setShowCreateBylaw(false);
    setBylawSubmitted(false);
    setBylawForm({ bylawNo: '', title: '', content: '', category: 'noise', effectiveDate: new Date().toISOString().slice(0, 10) });
  };

  const handleCreateViolation = async () => {
    setViolationSubmitted(true);
    if (!violationForm.bylawId || !violationForm.unitId.trim() || !violationForm.description.trim()) return;
    await createViolation(violationForm);
    setShowCreateViolation(false);
    setViolationSubmitted(false);
    setViolationForm({ bylawId: '', unitId: '', description: '', severity: 'warning' });
  };

  const handleFine = async () => {
    setFineSubmitted(true);
    if (!showFine || !fineForm.fineAmount) return;
    await fineViolation({ id: showFine, data: { fineAmount: Number(fineForm.fineAmount), notes: fineForm.notes } });
    setShowFine(null);
    setFineSubmitted(false);
    setFineForm({ fineAmount: '', notes: '' });
  };

  const handleAppeal = async () => {
    setAppealSubmitted(true);
    if (!showAppeal || !appealNotes.trim()) return;
    await appealViolation({ id: showAppeal, data: { appealNotes: appealNotes.trim() } });
    setShowAppeal(null);
    setAppealSubmitted(false);
    setAppealNotes('');
  };

  const openEditBylaw = (bylaw: any) => {
    setEditBylawForm({
      title: bylaw.title || '',
      content: bylaw.content || '',
      category: bylaw.category || 'noise',
      effectiveDate: bylaw.effectiveDate ? new Date(bylaw.effectiveDate).toISOString().slice(0, 10) : '',
      isActive: bylaw.isActive ?? true,
    });
    setEditSubmitted(false);
    setShowEditBylaw(bylaw);
  };

  const handleEditBylaw = async () => {
    setEditSubmitted(true);
    if (!showEditBylaw || !editBylawForm.title.trim() || !editBylawForm.content.trim()) return;
    await updateBylaw({ id: showEditBylaw.id, data: editBylawForm });
    setShowEditBylaw(null);
    setEditSubmitted(false);
  };

  if (!propertyId) return <div className="page-content"><div className="condo-empty-state"><Gavel size={40} /><h3>Select a Property</h3><p>Choose a property to manage by-laws</p></div></div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Gavel size={22} /></div>
          <div>
            <h1>By-Laws & Violations</h1>
            <p>{bylaws.length} total by-laws · {violations.length} total violations</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="condo-tabs">
        {['By-Laws', 'Violations'].map((label, i) => (
          <button key={i} className={`condo-tab ${activeTab === i ? 'condo-tab-active' : ''}`} onClick={() => setActiveTab(i)}>
            {label}
          </button>
        ))}
      </div>

      {/* By-Laws Tab */}
      {activeTab === 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <PermissionGuard permission="condo-bylaws.write">
              <button className="btn btn-primary btn-sm" onClick={() => { setBylawSubmitted(false); setShowCreateBylaw(true); }}>
                <Plus size={14} style={{ marginRight: 4 }} />New By-Law
              </button>
            </PermissionGuard>
          </div>
          {loadingBylaws ? (
            <div className="module-skeleton-grid"><div className="module-skeleton-card module-skeleton-wide" /></div>
          ) : (
            <div className="condo-table-wrap">
              <TableScrollWrapper>
                <table className="condo-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Effective</th>
                      <th>Status</th>
                      <th>Violations</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bylaws.length === 0 ? (
                      <tr><td colSpan={7} className="condo-table-empty">No by-laws defined yet</td></tr>
                    ) : bylaws.map((b: any) => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{b.bylawNo}</td>
                        <td>{b.title}</td>
                        <td><span className={`condo-category-tag condo-cat-${b.category}`}>{b.category || '—'}</span></td>
                        <td>{new Date(b.effectiveDate).toLocaleDateString()}</td>
                        <td><span className={`condo-status-badge condo-status-${b.isActive ? 'active' : 'completed'}`}>{b.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>{b._count?.violations || 0}</td>
                        <td>
                          <PermissionGuard permission="condo-bylaws.write">
                            <button className="condo-btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => openEditBylaw(b)}>
                              <Edit size={12} /> Edit
                            </button>
                          </PermissionGuard>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrapper>
            </div>
          )}
        </>
      )}

      {/* Violations Tab */}
      {activeTab === 1 && (
        <>
          <div className="condo-filter-bar">
            <button className={`condo-filter-chip ${!statusFilter ? 'active' : ''}`} onClick={() => setStatusFilter('')}>All</button>
            {['open', 'warned', 'fined', 'appealing', 'resolved', 'closed'].map(s => (
              <button key={s} className={`condo-filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>
            ))}
            <PermissionGuard permission="condo-bylaws.write">
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setViolationSubmitted(false); setShowCreateViolation(true); }}>
                <Plus size={14} style={{ marginRight: 4 }} />Report Violation
              </button>
            </PermissionGuard>
          </div>
          {loadingViolations ? (
            <div className="module-skeleton-grid"><div className="module-skeleton-card module-skeleton-wide" /></div>
          ) : (
            <div className="condo-table-wrap">
              <TableScrollWrapper>
                <table className="condo-table">
                  <thead>
                    <tr>
                      <th>Violation #</th>
                      <th>By-Law</th>
                      <th>Unit</th>
                      <th>Resident</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Fine</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.length === 0 ? (
                      <tr><td colSpan={9} className="condo-table-empty">No violations recorded</td></tr>
                    ) : violations.map((v: any) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.violationNo}</td>
                        <td>{v.bylaw?.title || v.bylaw?.bylawNo || '—'}</td>
                        <td>{v.unit?.unitNumber || '—'}</td>
                        <td>{v.resident ? `${v.resident.firstName} ${v.resident.lastName}` : '—'}</td>
                        <td><span className={`condo-severity condo-severity-${v.severity}`}>{v.severity}</span></td>
                        <td><span className={`condo-status-badge condo-status-${v.status}`}>{v.status}</span></td>
                        <td>{Number(v.fineAmount) > 0 ? `$${Number(v.fineAmount).toFixed(2)}` : '—'}</td>
                        <td>{new Date(v.createdAt).toLocaleDateString()}</td>
                        <td>
                          <PermissionGuard permission="condo-bylaws.write">
                            <div style={{ display: 'flex', gap: 4 }}>
                              {(v.status === 'open' || v.status === 'warned') && (
                                <button className="condo-btn-sm" onClick={() => { setFineSubmitted(false); setShowFine(v.id); }}>Fine</button>
                              )}
                              {(v.status === 'fined' || v.status === 'warned' || v.status === 'open') && (
                                <button className="condo-btn-sm"
                                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                                  onClick={() => { setAppealNotes(''); setAppealSubmitted(false); setShowAppeal(v.id); }}>
                                  Appeal
                                </button>
                              )}
                              {(v.status !== 'resolved' && v.status !== 'closed') && (
                                <button className="condo-btn-sm" style={{ borderColor: '#10b981', color: '#10b981' }}
                                  onClick={() => resolveViolation({ id: v.id, data: { resolutionNotes: 'Resolved by admin' } })}>Resolve</button>
                              )}
                            </div>
                          </PermissionGuard>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrapper>
            </div>
          )}
        </>
      )}

      {/* Create By-Law Modal */}
      {showCreateBylaw && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Create By-Law</h3>
              <button className="condo-modal-close" onClick={() => { setShowCreateBylaw(false); setBylawSubmitted(false); }}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>By-Law No *
                  <input
                    value={bylawForm.bylawNo}
                    className={bylawSubmitted && !bylawForm.bylawNo.trim() ? 'mall-input-error' : ''}
                    onChange={e => setBylawForm(p => ({ ...p, bylawNo: e.target.value }))}
                    placeholder="BL-2025-001"
                  />
                  {bylawSubmitted && !bylawForm.bylawNo.trim() && <span className="mall-error-text">By-law number is required</span>}
                </label>
                <label>Category
                  <select value={bylawForm.category} onChange={e => setBylawForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Title *
                  <input
                    value={bylawForm.title}
                    className={bylawSubmitted && !bylawForm.title.trim() ? 'mall-input-error' : ''}
                    onChange={e => setBylawForm(p => ({ ...p, title: e.target.value }))}
                  />
                  {bylawSubmitted && !bylawForm.title.trim() && <span className="mall-error-text">Title is required</span>}
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Content *
                  <textarea
                    rows={4}
                    value={bylawForm.content}
                    className={bylawSubmitted && !bylawForm.content.trim() ? 'mall-input-error' : ''}
                    onChange={e => setBylawForm(p => ({ ...p, content: e.target.value }))}
                  />
                  {bylawSubmitted && !bylawForm.content.trim() && <span className="mall-error-text">Content is required</span>}
                </label>
                <label>Effective Date
                  <input type="date" value={bylawForm.effectiveDate} onChange={e => setBylawForm(p => ({ ...p, effectiveDate: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowCreateBylaw(false); setBylawSubmitted(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateBylaw}>Create</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Report Violation Modal */}
      {showCreateViolation && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Report Violation</h3>
              <button className="condo-modal-close" onClick={() => { setShowCreateViolation(false); setViolationSubmitted(false); }}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>By-Law *
                  <select
                    value={violationForm.bylawId}
                    className={violationSubmitted && !violationForm.bylawId ? 'mall-input-error' : ''}
                    onChange={e => setViolationForm(p => ({ ...p, bylawId: e.target.value }))}
                  >
                    <option value="">Select by-law...</option>
                    {bylaws.map((b: any) => <option key={b.id} value={b.id}>{b.bylawNo} — {b.title}</option>)}
                  </select>
                  {violationSubmitted && !violationForm.bylawId && <span className="mall-error-text">By-law is required</span>}
                </label>
                <label>Severity
                  <select value={violationForm.severity} onChange={e => setViolationForm(p => ({ ...p, severity: e.target.value }))}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>Unit ID *
                  <input
                    value={violationForm.unitId}
                    className={violationSubmitted && !violationForm.unitId.trim() ? 'mall-input-error' : ''}
                    onChange={e => setViolationForm(p => ({ ...p, unitId: e.target.value }))}
                    placeholder="Unit UUID"
                  />
                  {violationSubmitted && !violationForm.unitId.trim() && <span className="mall-error-text">Unit ID is required</span>}
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Description *
                  <textarea
                    rows={3}
                    value={violationForm.description}
                    className={violationSubmitted && !violationForm.description.trim() ? 'mall-input-error' : ''}
                    onChange={e => setViolationForm(p => ({ ...p, description: e.target.value }))}
                  />
                  {violationSubmitted && !violationForm.description.trim() && <span className="mall-error-text">Description is required</span>}
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowCreateViolation(false); setViolationSubmitted(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateViolation}>Report</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Fine Modal */}
      {showFine && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal condo-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Issue Fine</h3>
              <button className="condo-modal-close" onClick={() => { setShowFine(null); setFineSubmitted(false); }}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Fine Amount *
                  <input
                    type="number"
                    value={fineForm.fineAmount}
                    className={fineSubmitted && !fineForm.fineAmount ? 'mall-input-error' : ''}
                    onChange={e => setFineForm(p => ({ ...p, fineAmount: e.target.value }))}
                  />
                  {fineSubmitted && !fineForm.fineAmount && <span className="mall-error-text">Fine amount is required</span>}
                </label>
                <label>Notes
                  <textarea rows={2} value={fineForm.notes} onChange={e => setFineForm(p => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowFine(null); setFineSubmitted(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleFine}>Issue Fine</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══ Appeal Violation Modal ═══ */}
      {showAppeal && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal condo-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={18} /> Appeal Violation
              </h3>
              <button className="condo-modal-close" onClick={() => { setShowAppeal(null); setAppealSubmitted(false); }}>×</button>
            </div>
            <div className="condo-modal-body">
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
              }}>
                <Shield size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Submit an appeal to contest this violation. The appeal will be reviewed and the violation status will be updated to "appealing".
                </span>
              </div>
              <div className="condo-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Appeal Notes *
                  <textarea
                    rows={4}
                    value={appealNotes}
                    className={appealSubmitted && !appealNotes.trim() ? 'mall-input-error' : ''}
                    onChange={e => setAppealNotes(e.target.value)}
                    placeholder="Explain why this violation should be reconsidered..."
                  />
                  {appealSubmitted && !appealNotes.trim() && <span className="mall-error-text">Appeal notes are required</span>}
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowAppeal(null); setAppealSubmitted(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAppeal}>
                <MessageCircle size={14} style={{ marginRight: 4 }} /> Submit Appeal
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══ Edit By-Law Modal ═══ */}
      {showEditBylaw && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} /> Edit By-Law: {showEditBylaw.bylawNo}
              </h3>
              <button className="condo-modal-close" onClick={() => { setShowEditBylaw(null); setEditSubmitted(false); }}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>Title *
                  <input
                    value={editBylawForm.title}
                    className={editSubmitted && !editBylawForm.title.trim() ? 'mall-input-error' : ''}
                    onChange={e => setEditBylawForm(f => ({ ...f, title: e.target.value }))}
                  />
                  {editSubmitted && !editBylawForm.title.trim() && <span className="mall-error-text">Title is required</span>}
                </label>
                <label>Category
                  <select value={editBylawForm.category}
                    onChange={e => setEditBylawForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label>Effective Date
                  <input type="date" value={editBylawForm.effectiveDate}
                    onChange={e => setEditBylawForm(f => ({ ...f, effectiveDate: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Content *
                  <textarea
                    rows={5}
                    value={editBylawForm.content}
                    className={editSubmitted && !editBylawForm.content.trim() ? 'mall-input-error' : ''}
                    onChange={e => setEditBylawForm(f => ({ ...f, content: e.target.value }))}
                  />
                  {editSubmitted && !editBylawForm.content.trim() && <span className="mall-error-text">Content is required</span>}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editBylawForm.isActive}
                    onChange={e => setEditBylawForm(f => ({ ...f, isActive: e.target.checked }))} 
                    style={{ width: 16, height: 16 }} />
                  Active
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowEditBylaw(null); setEditSubmitted(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditBylaw}>
                <Edit size={14} style={{ marginRight: 4 }} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
