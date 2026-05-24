import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetMeetingsQuery, useCreateMeetingMutation, useGetMeetingDetailQuery,
  useAddResolutionMutation, useUpdateMeetingStatusMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Users, Plus, MapPin, Building2, Calendar, Vote, X } from 'lucide-react';

const STATUSES = ['planned', 'notice_sent', 'in_progress', 'completed', 'adjourned'];

export default function MeetingsPage() {
  
  const propertyId = useSelectedPropertyId();

  const { data: meetingsRes, isLoading } = useGetMeetingsQuery({ propertyId }, { skip: !propertyId });
  const meetings = meetingsRes?.data || [];

  const [selectedId, setSelectedId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAddRes, setShowAddRes] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: detailRes } = useGetMeetingDetailQuery(selectedId, { skip: !selectedId });
  const detail = detailRes?.data;

  const [createMeeting] = useCreateMeetingMutation();
  const [addResolution] = useAddResolutionMutation();
  const [updateStatus] = useUpdateMeetingStatusMutation();

  const [meetingForm, setMeetingForm] = useState({
    meetingType: 'AGM', title: '', scheduledAt: '', venue: '',
    quorumPercentage: '30', noticeDaysRequired: '14', fiscalYear: String(new Date().getFullYear()),
  });
  const [resForm, setResForm] = useState({ resolutionNo: '1', title: '', description: '', resolutionType: 'ordinary' });

  const filteredMeetings = statusFilter ? meetings.filter((m: any) => m.status === statusFilter) : meetings;

  const handleCreateMeeting = async () => {
    if (!meetingForm.title || !meetingForm.scheduledAt) return;
    await createMeeting({
      propertyId, ...meetingForm,
      quorumPercentage: Number(meetingForm.quorumPercentage),
      noticeDaysRequired: Number(meetingForm.noticeDaysRequired),
      fiscalYear: Number(meetingForm.fiscalYear),
      agenda: [],
    });
    setShowCreate(false);
  };

  const handleAddResolution = async () => {
    if (!resForm.title) return;
    await addResolution({ meetingId: selectedId, data: { ...resForm, resolutionNo: Number(resForm.resolutionNo) } });
    setShowAddRes(false);
    setResForm({ resolutionNo: '1', title: '', description: '', resolutionType: 'ordinary' });
  };

  if (!propertyId) return <div className="page-content"><div className="condo-empty-state"><Users size={40} /><h3>Select a Property</h3><p>Choose a property to manage meetings</p></div></div>;

  return (
    <div className="page-content">
      <div className="condo-page-header">
        <div>
          <h1>General Meetings</h1>
          <p className="condo-page-subtitle">AGM / EGM management with digital voting</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} style={{ marginRight: 4 }} />New Meeting
        </button>
      </div>

      {/* Status Filters */}
      <div className="condo-filter-bar">
        <button className={`condo-filter-chip ${!statusFilter ? 'active' : ''}`} onClick={() => setStatusFilter('')}>All</button>
        {STATUSES.map(s => (
          <button key={s} className={`condo-filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}>{s.replace('_', ' ')}</button>
        ))}
        <span className="condo-filter-count">{filteredMeetings.length} meetings</span>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
      ) : (
      <div className="condo-meetings-layout">
        {/* Meeting Cards */}
        <div className="condo-meetings-list">
          {filteredMeetings.length === 0 ? (
            <div className="condo-empty-state">
              <Calendar size={40} strokeWidth={1} />
              <h3>No Meetings</h3>
              <p>Schedule an AGM or EGM to get started.</p>
            </div>
          ) : filteredMeetings.map((m: any) => {
            const d = new Date(m.scheduledAt);
            return (
              <div key={m.id}
                className={`condo-meeting-card ${selectedId === m.id ? 'condo-meeting-selected' : ''}`}
                onClick={() => setSelectedId(m.id)}>
                <div className="condo-meeting-card-header">
                  <div className="condo-meeting-date-badge">
                    <span className="condo-meeting-day">{d.getDate()}</span>
                    <span className="condo-meeting-month">{d.toLocaleString('en', { month: 'short' })}</span>
                  </div>
                  <span className={`condo-status-badge condo-status-${m.status}`}>{m.status.replace('_', ' ')}</span>
                </div>
                <h4 className="condo-meeting-title">{m.title}</h4>
                <div className="condo-meeting-meta">
                  <span><MapPin size={12} style={{ marginRight: 4 }} />{m.venue || 'TBD'}</span>
                  <span><Building2 size={12} style={{ marginRight: 4 }} />{m.meetingType}</span>
                </div>
                <div className="condo-meeting-footer">
                  <span>{m._count?.resolutions || 0} resolutions</span>
                  <span>{m._count?.proxies || 0} proxies</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Meeting Detail Panel */}
        {detail && (
          <div className="condo-meeting-detail">
            <div className="condo-card">
              <div className="condo-card-header">
                <h3>{detail.title}</h3>
                <select className="condo-filter-select" value={detail.status}
                  onChange={e => updateStatus({ id: detail.id, data: { status: e.target.value } })}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="condo-card-body">
                <div className="condo-detail-row" style={{ marginBottom: 16 }}>
                  <span>📅 {new Date(detail.scheduledAt).toLocaleString()}</span>
                  <span>📍 {detail.venue || 'TBD'}</span>
                  <span>🏛 {detail.meetingType}</span>
                  <span>👥 Quorum: {Number(detail.quorumPercentage)}%</span>
                  {detail.quorumMet !== null && (
                    <span className={detail.quorumMet ? 'text-success' : 'text-danger'}>
                      {detail.quorumMet ? '✅ Quorum Met' : '❌ No Quorum'}
                    </span>
                  )}
                </div>

                {/* Resolutions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Resolutions</h4>
                  <button className="condo-btn-sm" onClick={() => setShowAddRes(true)}>+ Add Resolution</button>
                </div>

                {detail.resolutions?.length === 0 ? (
                  <p className="condo-no-data">No resolutions added yet.</p>
                ) : detail.resolutions?.map((r: any) => (
                  <div key={r.id} className="condo-resolution-card">
                    <div className="condo-resolution-header">
                      <span className="condo-resolution-no">Resolution #{r.resolutionNo}</span>
                      <span className={`condo-status-badge condo-status-${r.result || 'pending'}`}>{r.result || 'pending'}</span>
                    </div>
                    <h5 className="condo-resolution-title">{r.title}</h5>
                    {r.description && <p className="condo-resolution-desc">{r.description}</p>}
                    <div className="condo-vote-bars">
                      <div className="condo-vote-bar">
                        <span className="condo-vote-label">For</span>
                        <div className="condo-vote-bar-fill" style={{ width: r.totalVotes ? `${(r.votesFor / r.totalVotes) * 100}%` : '0%', background: '#10b981' }}></div>
                        <span className="condo-vote-count">{r.votesFor}</span>
                      </div>
                      <div className="condo-vote-bar">
                        <span className="condo-vote-label">Against</span>
                        <div className="condo-vote-bar-fill" style={{ width: r.totalVotes ? `${(r.votesAgainst / r.totalVotes) * 100}%` : '0%', background: '#ef4444' }}></div>
                        <span className="condo-vote-count">{r.votesAgainst}</span>
                      </div>
                      <div className="condo-vote-bar">
                        <span className="condo-vote-label">Abstain</span>
                        <div className="condo-vote-bar-fill" style={{ width: r.totalVotes ? `${(r.votesAbstain / r.totalVotes) * 100}%` : '0%', background: '#6b7280' }}></div>
                        <span className="condo-vote-count">{r.votesAbstain}</span>
                      </div>
                    </div>
                    <div className="condo-resolution-footer">
                      <span>Total votes: {r.totalVotes}</span>
                      <span className="condo-resolution-type">{r.resolutionType}</span>
                    </div>
                  </div>
                ))}

                {/* Proxies */}
                {detail.proxies?.length > 0 && (
                  <>
                    <h4 style={{ margin: '16px 0 8px', color: 'var(--text-primary)' }}>Proxy Forms ({detail.proxies.length})</h4>
                    <div className="condo-table-wrap">
                      <table className="condo-table">
                        <thead><tr><th>Owner</th><th>Proxy</th><th>Unit</th><th>Valid</th></tr></thead>
                        <tbody>
                          {detail.proxies.map((p: any) => (
                            <tr key={p.id}>
                              <td>{p.ownerName}</td>
                              <td>{p.proxyName}</td>
                              <td>{p.unitId?.slice(-4)}</td>
                              <td>{p.isValid ? '✅' : '❌'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Create Meeting Modal */}
      {showCreate && createPortal(
        <div className="condo-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Schedule Meeting</h3>
              <button className="condo-modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>Meeting Type
                  <select value={meetingForm.meetingType} onChange={e => setMeetingForm(p => ({ ...p, meetingType: e.target.value }))}>
                    <option value="AGM">AGM</option><option value="EGM">EGM</option>
                  </select>
                </label>
                <label>Fiscal Year
                  <input type="number" value={meetingForm.fiscalYear} onChange={e => setMeetingForm(p => ({ ...p, fiscalYear: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Title
                  <input value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))} placeholder="Annual General Meeting 2025" />
                </label>
                <label>Scheduled Date/Time
                  <input type="datetime-local" value={meetingForm.scheduledAt} onChange={e => setMeetingForm(p => ({ ...p, scheduledAt: e.target.value }))} />
                </label>
                <label>Venue
                  <input value={meetingForm.venue} onChange={e => setMeetingForm(p => ({ ...p, venue: e.target.value }))} />
                </label>
                <label>Quorum %
                  <input type="number" value={meetingForm.quorumPercentage} onChange={e => setMeetingForm(p => ({ ...p, quorumPercentage: e.target.value }))} />
                </label>
                <label>Notice Days
                  <input type="number" value={meetingForm.noticeDaysRequired} onChange={e => setMeetingForm(p => ({ ...p, noticeDaysRequired: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateMeeting}>Schedule</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Add Resolution Modal */}
      {showAddRes && createPortal(
        <div className="condo-modal-overlay" onClick={() => setShowAddRes(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Add Resolution</h3>
              <button className="condo-modal-close" onClick={() => setShowAddRes(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>Resolution #
                  <input type="number" value={resForm.resolutionNo} onChange={e => setResForm(p => ({ ...p, resolutionNo: e.target.value }))} />
                </label>
                <label>Type
                  <select value={resForm.resolutionType} onChange={e => setResForm(p => ({ ...p, resolutionType: e.target.value }))}>
                    <option value="ordinary">Ordinary</option><option value="special">Special</option><option value="unanimous">Unanimous</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Title
                  <input value={resForm.title} onChange={e => setResForm(p => ({ ...p, title: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Description
                  <textarea rows={3} value={resForm.description} onChange={e => setResForm(p => ({ ...p, description: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddRes(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddResolution}>Add Resolution</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
