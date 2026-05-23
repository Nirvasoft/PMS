import React, { useState } from 'react';
import {
  useGetBylawsQuery, useCreateBylawMutation,
  useGetViolationsQuery, useCreateViolationMutation,
  useFineViolationMutation, useResolveViolationMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Gavel, Plus, BookOpen, AlertTriangle, CheckCircle, X } from 'lucide-react';

const CATEGORIES = ['noise', 'pets', 'parking', 'renovation', 'common_area'];
const SEVERITIES = ['warning', 'minor', 'major'];

export default function BylawsPage() {
  
  const propertyId = useSelectedPropertyId();

  const [activeTab, setActiveTab] = useState(0);
  const [showCreateBylaw, setShowCreateBylaw] = useState(false);
  const [showCreateViolation, setShowCreateViolation] = useState(false);
  const [showFine, setShowFine] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: bylawsRes, isLoading: loadingBylaws } = useGetBylawsQuery({ propertyId }, { skip: !propertyId });
  const bylaws = bylawsRes?.data || [];

  const { data: violationsRes, isLoading: loadingViolations } = useGetViolationsQuery(
    { propertyId, status: statusFilter || undefined }, { skip: !propertyId },
  );
  const violations = violationsRes?.data || [];

  const [createBylaw] = useCreateBylawMutation();
  const [createViolation] = useCreateViolationMutation();
  const [fineViolation] = useFineViolationMutation();
  const [resolveViolation] = useResolveViolationMutation();

  const [bylawForm, setBylawForm] = useState({ bylawNo: '', title: '', content: '', category: 'noise', effectiveDate: new Date().toISOString().slice(0, 10) });
  const [violationForm, setViolationForm] = useState({ bylawId: '', unitId: '', description: '', severity: 'warning' });
  const [fineForm, setFineForm] = useState({ fineAmount: '', notes: '' });

  const handleCreateBylaw = async () => {
    if (!bylawForm.bylawNo || !bylawForm.title || !bylawForm.content) return;
    await createBylaw({ propertyId, ...bylawForm });
    setShowCreateBylaw(false);
    setBylawForm({ bylawNo: '', title: '', content: '', category: 'noise', effectiveDate: new Date().toISOString().slice(0, 10) });
  };

  const handleCreateViolation = async () => {
    if (!violationForm.bylawId || !violationForm.unitId || !violationForm.description) return;
    await createViolation(violationForm);
    setShowCreateViolation(false);
    setViolationForm({ bylawId: '', unitId: '', description: '', severity: 'warning' });
  };

  const handleFine = async () => {
    if (!showFine || !fineForm.fineAmount) return;
    await fineViolation({ id: showFine, data: { fineAmount: Number(fineForm.fineAmount), notes: fineForm.notes } });
    setShowFine(null);
    setFineForm({ fineAmount: '', notes: '' });
  };

  if (!propertyId) return <div className="page-content"><div className="condo-empty-state"><Gavel size={40} /><h3>Select a Property</h3><p>Choose a property to manage by-laws</p></div></div>;

  return (
    <div className="page-content">
      <div className="condo-page-header">
        <div>
          <h1>By-Laws & Violations</h1>
          <p className="condo-page-subtitle">Property rules enforcement and violation management</p>
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
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateBylaw(true)}>
              <Plus size={14} style={{ marginRight: 4 }} />New By-Law
            </button>
          </div>
          {loadingBylaws ? (
            <div className="module-skeleton-grid"><div className="module-skeleton-card module-skeleton-wide" /></div>
          ) : (
            <div className="condo-table-wrap">
              <table className="condo-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Effective</th>
                    <th>Status</th>
                    <th>Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {bylaws.length === 0 ? (
                    <tr><td colSpan={6} className="condo-table-empty">No by-laws defined yet</td></tr>
                  ) : bylaws.map((b: any) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.bylawNo}</td>
                      <td>{b.title}</td>
                      <td><span className={`condo-category-tag condo-cat-${b.category}`}>{b.category || '—'}</span></td>
                      <td>{new Date(b.effectiveDate).toLocaleDateString()}</td>
                      <td><span className={`condo-status-badge condo-status-${b.isActive ? 'active' : 'completed'}`}>{b.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td>{b._count?.violations || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowCreateViolation(true)}>
              <Plus size={14} style={{ marginRight: 4 }} />Report Violation
            </button>
          </div>
          {loadingViolations ? (
            <div className="module-skeleton-grid"><div className="module-skeleton-card module-skeleton-wide" /></div>
          ) : (
            <div className="condo-table-wrap">
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
                    <th>Actions</th>
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
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(v.status === 'open' || v.status === 'warned') && (
                            <button className="condo-btn-sm" onClick={() => setShowFine(v.id)}>Fine</button>
                          )}
                          {(v.status !== 'resolved' && v.status !== 'closed') && (
                            <button className="condo-btn-sm" style={{ borderColor: '#10b981', color: '#10b981' }}
                              onClick={() => resolveViolation({ id: v.id, data: { resolutionNotes: 'Resolved by admin' } })}>Resolve</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create By-Law Modal */}
      {showCreateBylaw && (
        <div className="condo-modal-overlay" onClick={() => setShowCreateBylaw(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Create By-Law</h3>
              <button className="condo-modal-close" onClick={() => setShowCreateBylaw(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>By-Law No
                  <input value={bylawForm.bylawNo} onChange={e => setBylawForm(p => ({ ...p, bylawNo: e.target.value }))} placeholder="BL-2025-001" />
                </label>
                <label>Category
                  <select value={bylawForm.category} onChange={e => setBylawForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Title
                  <input value={bylawForm.title} onChange={e => setBylawForm(p => ({ ...p, title: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Content
                  <textarea rows={4} value={bylawForm.content} onChange={e => setBylawForm(p => ({ ...p, content: e.target.value }))} />
                </label>
                <label>Effective Date
                  <input type="date" value={bylawForm.effectiveDate} onChange={e => setBylawForm(p => ({ ...p, effectiveDate: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateBylaw(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateBylaw}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Report Violation Modal */}
      {showCreateViolation && (
        <div className="condo-modal-overlay" onClick={() => setShowCreateViolation(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Report Violation</h3>
              <button className="condo-modal-close" onClick={() => setShowCreateViolation(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>By-Law
                  <select value={violationForm.bylawId} onChange={e => setViolationForm(p => ({ ...p, bylawId: e.target.value }))}>
                    <option value="">Select by-law...</option>
                    {bylaws.map((b: any) => <option key={b.id} value={b.id}>{b.bylawNo} — {b.title}</option>)}
                  </select>
                </label>
                <label>Severity
                  <select value={violationForm.severity} onChange={e => setViolationForm(p => ({ ...p, severity: e.target.value }))}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>Unit ID
                  <input value={violationForm.unitId} onChange={e => setViolationForm(p => ({ ...p, unitId: e.target.value }))} placeholder="Unit UUID" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Description
                  <textarea rows={3} value={violationForm.description} onChange={e => setViolationForm(p => ({ ...p, description: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateViolation(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateViolation}>Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Fine Modal */}
      {showFine && (
        <div className="condo-modal-overlay" onClick={() => setShowFine(null)}>
          <div className="condo-modal condo-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Issue Fine</h3>
              <button className="condo-modal-close" onClick={() => setShowFine(null)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Fine Amount
                  <input type="number" value={fineForm.fineAmount} onChange={e => setFineForm(p => ({ ...p, fineAmount: e.target.value }))} />
                </label>
                <label>Notes
                  <textarea rows={2} value={fineForm.notes} onChange={e => setFineForm(p => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowFine(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleFine}>Issue Fine</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
