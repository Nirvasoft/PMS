import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetMeetingsQuery, useCreateMeetingMutation, useGetMeetingDetailQuery,
  useAddResolutionMutation, useUpdateMeetingStatusMutation,
  useCastVoteMutation, useSendMeetingNoticeMutation, usePublishMinutesMutation,
  useSubmitProxyMutation, useGetMeetingResultsQuery,
} from '../../store/api/condoApi';
import { useGetUnitsQuery } from '../../store/api/unitsApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import {
  Users, Plus, MapPin, Building2, Calendar, Vote, X, Send, FileText,
  CheckCircle, AlertCircle, ThumbsUp, ThumbsDown, MinusCircle, Loader2,
  Bell, Upload, Eye, UserCheck, Shield, BarChart3, PieChart,
} from 'lucide-react';

const STATUSES = ['planned', 'notice_sent', 'in_progress', 'completed', 'adjourned'];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  planned:      { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8' },
  notice_sent:  { bg: 'rgba(34,211,238,0.12)',  color: '#22d3ee' },
  in_progress:  { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
  completed:    { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  adjourned:    { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' },
};

export default function MeetingsPage() {

  const propertyId = useSelectedPropertyId();

  const { data: meetingsRes, isLoading } = useGetMeetingsQuery({ propertyId }, { skip: !propertyId });
  const meetings = meetingsRes?.data || [];

  // Units for voting
  const { data: unitsRes } = useGetUnitsQuery(
    { propertyId: propertyId || '', status: 'occupied', limit: 500 },
    { skip: !propertyId },
  );
  const units = unitsRes?.data || [];

  const [selectedId, setSelectedId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAddRes, setShowAddRes] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState<{ meetingId: string; resolutionId: string; resolutionTitle: string } | null>(null);
  const [showMinutesModal, setShowMinutesModal] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [noticeSending, setNoticeSending] = useState(false);

  const { data: detailRes } = useGetMeetingDetailQuery(selectedId, { skip: !selectedId });
  const detail = detailRes?.data;

  // Meeting results with quorum check
  const { data: resultsRes, isFetching: loadingResults } = useGetMeetingResultsQuery(
    selectedId,
    { skip: !selectedId || !showResults },
  );
  const results = resultsRes?.data;

  const [createMeeting] = useCreateMeetingMutation();
  const [addResolution] = useAddResolutionMutation();
  const [updateStatus] = useUpdateMeetingStatusMutation();
  const [castVote] = useCastVoteMutation();
  const [sendNotice] = useSendMeetingNoticeMutation();
  const [publishMinutes] = usePublishMinutesMutation();
  const [submitProxy] = useSubmitProxyMutation();

  const [meetingForm, setMeetingForm] = useState({
    meetingType: 'AGM', title: '', scheduledAt: '', venue: '',
    quorumPercentage: '30', noticeDaysRequired: '14', fiscalYear: String(new Date().getFullYear()),
  });
  const [resForm, setResForm] = useState({ resolutionNo: '1', title: '', description: '', resolutionType: 'ordinary' });
  const [voteForm, setVoteForm] = useState({ vote: 'for' as 'for' | 'against' | 'abstain', unitId: '' });
  const [minutesUrl, setMinutesUrl] = useState('');
  const [proxyForm, setProxyForm] = useState({ unitId: '', ownerName: '', proxyName: '', proxyIdNumber: '' });

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

  const handleCastVote = async () => {
    if (!showVoteModal || !voteForm.unitId) return;
    await castVote({
      meetingId: showVoteModal.meetingId,
      resolutionId: showVoteModal.resolutionId,
      data: { vote: voteForm.vote, unitId: voteForm.unitId, isProxy: false },
    });
    setShowVoteModal(null);
    setVoteForm({ vote: 'for', unitId: '' });
  };

  const handleSendNotice = async () => {
    if (!selectedId) return;
    setNoticeSending(true);
    try {
      await sendNotice(selectedId);
    } finally {
      setNoticeSending(false);
    }
  };

  const handlePublishMinutes = async () => {
    if (!selectedId || !minutesUrl.trim()) return;
    await publishMinutes({ id: selectedId, data: { minutesUrl: minutesUrl.trim() } });
    setShowMinutesModal(false);
    setMinutesUrl('');
  };

  const handleSubmitProxy = async () => {
    if (!selectedId || !proxyForm.unitId || !proxyForm.ownerName.trim() || !proxyForm.proxyName.trim()) return;
    await submitProxy({
      meetingId: selectedId,
      data: {
        unitId: proxyForm.unitId,
        ownerName: proxyForm.ownerName.trim(),
        proxyName: proxyForm.proxyName.trim(),
        proxyIdNumber: proxyForm.proxyIdNumber.trim() || undefined,
      },
    });
    setShowProxyModal(false);
    setProxyForm({ unitId: '', ownerName: '', proxyName: '', proxyIdNumber: '' });
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
            const sc = STATUS_COLORS[m.status] || STATUS_COLORS.planned;
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

                {/* ═══ Action Buttons ═══ */}
                <div style={actionBarStyle}>
                  {/* Send Notice — available when status is "planned" */}
                  {(detail.status === 'planned') && (
                    <button
                      style={noticeBtnStyle}
                      onClick={handleSendNotice}
                      disabled={noticeSending}
                    >
                      {noticeSending ? (
                        <><Loader2 size={14} className="spin" /> Sending...</>
                      ) : (
                        <><Bell size={14} /> Send Meeting Notice</>
                      )}
                    </button>
                  )}

                  {/* Publish Minutes — available when completed */}
                  {(detail.status === 'completed' || detail.status === 'adjourned') && (
                    <button
                      style={minutesBtnStyle}
                      onClick={() => setShowMinutesModal(true)}
                    >
                      <Upload size={14} /> Publish Minutes
                    </button>
                  )}

                  {/* Minutes link if already published */}
                  {detail.minutesUrl && (
                    <a href={detail.minutesUrl} target="_blank" rel="noopener noreferrer" style={minutesLinkStyle}>
                      <FileText size={14} /> View Minutes
                    </a>
                  )}

                  {/* View Results — available when in_progress, completed or adjourned */}
                  {(detail.status === 'in_progress' || detail.status === 'completed' || detail.status === 'adjourned') && (
                    <button
                      style={{
                        ...resultsBtnStyle,
                        ...(showResults ? { background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' } : {}),
                      }}
                      onClick={() => setShowResults(!showResults)}
                    >
                      <BarChart3 size={14} /> {showResults ? 'Hide Results' : 'View Results'}
                    </button>
                  )}
                </div>

                {/* Resolutions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 16 }}>
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

                    {/* Vote Bars */}
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

                    {/* ═══ Cast Vote Button ═══ */}
                    {(detail.status === 'in_progress' || detail.status === 'notice_sent') && !r.result && (
                      <div style={voteActionRowStyle}>
                        <button
                          style={castVoteBtnStyle}
                          onClick={() => setShowVoteModal({
                            meetingId: detail.id,
                            resolutionId: r.id,
                            resolutionTitle: r.title,
                          })}
                        >
                          <Vote size={14} /> Cast Vote
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* ═══ Proxies ═══ */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                    Proxy Forms ({detail.proxies?.length || 0})
                  </h4>
                  {(detail.status === 'planned' || detail.status === 'notice_sent') && (
                    <button style={proxyBtnStyle} onClick={() => setShowProxyModal(true)}>
                      <UserCheck size={14} /> Submit Proxy
                    </button>
                  )}
                </div>

                {detail.proxies?.length > 0 ? (
                  <div className="condo-table-wrap">
                    <table className="condo-table">
                      <thead><tr><th>Owner</th><th>Proxy</th><th>Unit</th><th>ID Number</th><th>Valid</th></tr></thead>
                      <tbody>
                        {detail.proxies.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.ownerName}</td>
                            <td>{p.proxyName}</td>
                            <td>{p.unitId?.slice(-4)}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{p.proxyIdNumber || '—'}</td>
                            <td>{p.isValid ? '✅' : '❌'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="condo-no-data" style={{ fontSize: 13 }}>No proxy forms submitted yet.</p>
                )}

                {/* ═══ Meeting Results Panel (Quorum Check) ═══ */}
                {showResults && (
                  <div style={resultsPanelStyle}>
                    <h4 style={{ margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
                      <PieChart size={16} color="#6366f1" /> Meeting Results & Quorum Check
                    </h4>

                    {loadingResults ? (
                      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                        <Loader2 size={20} className="spin" style={{ marginBottom: 8 }} />
                        <p style={{ margin: 0, fontSize: 13 }}>Loading results...</p>
                      </div>
                    ) : results ? (
                      <>
                        {/* Quorum Status */}
                        <div style={quorumCardStyle(results.quorumMet)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {results.quorumMet ? (
                              <CheckCircle size={20} color="#22c55e" />
                            ) : results.quorumMet === false ? (
                              <AlertCircle size={20} color="#ef4444" />
                            ) : (
                              <AlertCircle size={20} color="#f59e0b" />
                            )}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>
                                {results.quorumMet ? 'Quorum Met' : results.quorumMet === false ? 'Quorum NOT Met' : 'Quorum Pending'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                Attendees: {results.actualAttendees ?? '—'} / {results.totalUnits} units
                                {results.totalUnits > 0 && results.actualAttendees != null && (
                                  <> ({Math.round((results.actualAttendees / results.totalUnits) * 100)}% attendance)</>
                                )}
                              </div>
                            </div>
                          </div>
                          {results.totalUnits > 0 && results.actualAttendees != null && (
                            <div style={quorumBarWrapStyle}>
                              <div style={{
                                height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
                                width: `${Math.min((results.actualAttendees / results.totalUnits) * 100, 100)}%`,
                                background: results.quorumMet ? 'linear-gradient(90deg, #22c55e, #4ade80)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                              }} />
                            </div>
                          )}
                        </div>

                        {/* Resolution Results */}
                        {results.resolutions?.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <h5 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Resolution Results
                            </h5>
                            {results.resolutions.map((r: any) => {
                              const total = r.votesFor + r.votesAgainst + r.votesAbstain;
                              const forPct = total > 0 ? Math.round((r.votesFor / total) * 100) : 0;
                              const againstPct = total > 0 ? Math.round((r.votesAgainst / total) * 100) : 0;
                              const isPassed = r.result === 'passed';
                              const isFailed = r.result === 'rejected';

                              return (
                                <div key={r.id} style={resResultCardStyle}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                        Resolution #{r.resolutionNo}
                                      </span>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                                    </div>
                                    <span style={{
                                      padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                      background: isPassed ? 'rgba(34,197,94,0.12)' : isFailed ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                                      color: isPassed ? '#22c55e' : isFailed ? '#ef4444' : '#eab308',
                                    }}>
                                      {r.result ? r.result.toUpperCase() : 'PENDING'}
                                    </span>
                                  </div>
                                  {/* Mini vote bar */}
                                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                                    {forPct > 0 && <div style={{ width: `${forPct}%`, background: '#22c55e', transition: 'width 0.3s' }} />}
                                    {againstPct > 0 && <div style={{ width: `${againstPct}%`, background: '#ef4444', transition: 'width 0.3s' }} />}
                                    {(100 - forPct - againstPct) > 0 && <div style={{ flex: 1, background: '#6b728020' }} />}
                                  </div>
                                  <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <span style={{ color: '#22c55e' }}>✅ For: {r.votesFor}</span>
                                    <span style={{ color: '#ef4444' }}>❌ Against: {r.votesAgainst}</span>
                                    <span>➖ Abstain: {r.votesAbstain}</span>
                                    <span style={{ marginLeft: 'auto' }}>Total: {total}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="condo-no-data" style={{ fontSize: 13 }}>No results data available.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ═══ Create Meeting Modal ═══ */}
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

      {/* ═══ Add Resolution Modal ═══ */}
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

      {/* ═══ Cast Vote Modal ═══ */}
      {showVoteModal && createPortal(
        <div className="condo-modal-overlay" onClick={() => setShowVoteModal(null)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="condo-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Vote size={20} /> Cast Vote
              </h3>
              <button className="condo-modal-close" onClick={() => setShowVoteModal(null)}>×</button>
            </div>
            <div className="condo-modal-body">
              {/* Resolution info */}
              <div style={voteResInfoStyle}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Voting on:</span>
                <span style={{ fontWeight: 600 }}>{showVoteModal.resolutionTitle}</span>
              </div>

              {/* Unit selector */}
              <div style={{ marginBottom: 20 }}>
                <label style={voteLabelStyle}>Voting Unit *</label>
                <select
                  style={voteSelectStyle}
                  value={voteForm.unitId}
                  onChange={e => setVoteForm(f => ({ ...f, unitId: e.target.value }))}
                >
                  <option value="">— Select unit —</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.unitNumber} {u.tenant ? `(${u.tenant.firstName} ${u.tenant.lastName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vote selection */}
              <label style={voteLabelStyle}>Your Vote *</label>
              <div style={voteOptionsStyle}>
                <button
                  style={{
                    ...voteOptionBtnStyle,
                    ...(voteForm.vote === 'for' ? { border: '2px solid #22c55e', background: 'rgba(34,197,94,0.1)' } : {}),
                  }}
                  onClick={() => setVoteForm(f => ({ ...f, vote: 'for' }))}
                >
                  <ThumbsUp size={22} color="#22c55e" />
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>For</span>
                </button>
                <button
                  style={{
                    ...voteOptionBtnStyle,
                    ...(voteForm.vote === 'against' ? { border: '2px solid #ef4444', background: 'rgba(239,68,68,0.1)' } : {}),
                  }}
                  onClick={() => setVoteForm(f => ({ ...f, vote: 'against' }))}
                >
                  <ThumbsDown size={22} color="#ef4444" />
                  <span style={{ fontWeight: 600, color: '#ef4444' }}>Against</span>
                </button>
                <button
                  style={{
                    ...voteOptionBtnStyle,
                    ...(voteForm.vote === 'abstain' ? { border: '2px solid #6b7280', background: 'rgba(107,114,128,0.1)' } : {}),
                  }}
                  onClick={() => setVoteForm(f => ({ ...f, vote: 'abstain' }))}
                >
                  <MinusCircle size={22} color="#6b7280" />
                  <span style={{ fontWeight: 600, color: '#6b7280' }}>Abstain</span>
                </button>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowVoteModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCastVote}
                disabled={!voteForm.unitId}
                style={{ opacity: !voteForm.unitId ? 0.5 : 1 }}
              >
                <Vote size={14} style={{ marginRight: 4 }} /> Submit Vote
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══ Publish Minutes Modal ═══ */}
      {showMinutesModal && createPortal(
        <div className="condo-modal-overlay" onClick={() => setShowMinutesModal(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="condo-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} /> Publish Meeting Minutes
              </h3>
              <button className="condo-modal-close" onClick={() => setShowMinutesModal(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <label style={voteLabelStyle}>Minutes Document URL *</label>
              <input
                style={voteSelectStyle}
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                value={minutesUrl}
                onChange={e => setMinutesUrl(e.target.value)}
              />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                Provide a link to the uploaded meeting minutes document. This will be shared with all attendees.
              </p>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowMinutesModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handlePublishMinutes}
                disabled={!minutesUrl.trim()}
                style={{ opacity: !minutesUrl.trim() ? 0.5 : 1 }}
              >
                <Upload size={14} style={{ marginRight: 4 }} /> Publish
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══ Submit Proxy Modal ═══ */}
      {showProxyModal && createPortal(
        <div className="condo-modal-overlay" onClick={() => setShowProxyModal(false)}>
          <div className="condo-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="condo-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCheck size={20} /> Submit Proxy Form
              </h3>
              <button className="condo-modal-close" onClick={() => setShowProxyModal(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              {/* Info banner */}
              <div style={proxyInfoBannerStyle}>
                <Shield size={16} color="#f59e0b" />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  A proxy form authorizes another person to vote on behalf of a unit owner at the meeting.
                </span>
              </div>

              <div className="condo-form-grid">
                <label>Unit *
                  <select
                    value={proxyForm.unitId}
                    onChange={e => setProxyForm(f => ({ ...f, unitId: e.target.value }))}
                  >
                    <option value="">— Select unit —</option>
                    {units.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.unitNumber} {u.tenant ? `(${u.tenant.firstName} ${u.tenant.lastName})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Owner Name *
                  <input
                    value={proxyForm.ownerName}
                    onChange={e => setProxyForm(f => ({ ...f, ownerName: e.target.value }))}
                    placeholder="Full name of the unit owner"
                  />
                </label>
                <label>Proxy Name *
                  <input
                    value={proxyForm.proxyName}
                    onChange={e => setProxyForm(f => ({ ...f, proxyName: e.target.value }))}
                    placeholder="Full name of the authorized proxy"
                  />
                </label>
                <label>Proxy ID Number
                  <input
                    value={proxyForm.proxyIdNumber}
                    onChange={e => setProxyForm(f => ({ ...f, proxyIdNumber: e.target.value }))}
                    placeholder="NRC / Passport (optional)"
                  />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowProxyModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSubmitProxy}
                disabled={!proxyForm.unitId || !proxyForm.ownerName.trim() || !proxyForm.proxyName.trim()}
                style={{ opacity: (!proxyForm.unitId || !proxyForm.ownerName.trim() || !proxyForm.proxyName.trim()) ? 0.5 : 1 }}
              >
                <UserCheck size={14} style={{ marginRight: 4 }} /> Submit Proxy
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ─── Inline Styles ───────────────────────────────────────

const actionBarStyle: React.CSSProperties = {
  display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4,
  padding: '12px 0', borderBottom: '1px solid var(--border-color)',
};

const noticeBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
  border: 'none', background: 'linear-gradient(135deg, #06b6d4, #0891b2)', color: '#fff',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
};

const minutesBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
  border: '1px solid var(--border-color)', background: 'transparent',
  color: 'var(--text-primary)', fontWeight: 500, fontSize: 13, cursor: 'pointer',
};

const minutesLinkStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
  background: 'rgba(34,197,94,0.1)', color: '#22c55e',
  fontWeight: 600, fontSize: 13, textDecoration: 'none',
};

const voteActionRowStyle: React.CSSProperties = {
  marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border-color)',
  display: 'flex', justifyContent: 'flex-end',
};

const castVoteBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8,
  border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
  boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
};

const voteResInfoStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20,
  padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)',
  border: '1px solid rgba(99,102,241,0.15)',
};

const voteLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
  marginBottom: 6,
};

const voteSelectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box',
};

const voteOptionsStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
};

const voteOptionBtnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  padding: '18px 12px', borderRadius: 12,
  border: '2px solid var(--border-color)', background: 'transparent',
  cursor: 'pointer', transition: 'all 0.15s',
};

const proxyBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
  border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
  fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
};

const proxyInfoBannerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
  padding: '12px 14px', borderRadius: 10,
  background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
};

const resultsBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
  border: '1px solid var(--border-color)', background: 'transparent',
  color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  transition: 'all 0.15s',
};

const resultsPanelStyle: React.CSSProperties = {
  marginTop: 20, padding: '16px 18px', borderRadius: 12,
  border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.03)',
};

const quorumCardStyle = (met: boolean | null): React.CSSProperties => ({
  padding: '14px 16px', borderRadius: 10,
  border: `1px solid ${met ? 'rgba(34,197,94,0.2)' : met === false ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
  background: met ? 'rgba(34,197,94,0.04)' : met === false ? 'rgba(239,68,68,0.04)' : 'rgba(245,158,11,0.04)',
});

const quorumBarWrapStyle: React.CSSProperties = {
  height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)',
  marginTop: 10, overflow: 'hidden',
};

const resResultCardStyle: React.CSSProperties = {
  padding: '12px 14px', borderRadius: 10, marginBottom: 8,
  border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)',
};
