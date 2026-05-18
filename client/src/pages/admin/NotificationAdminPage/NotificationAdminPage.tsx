import { useState } from 'react';
import {
  useGetNotificationLogsQuery, useRetryNotificationMutation,
  useGetNotificationTemplatesQuery,
  type NotificationLogItem, type NotificationTemplate,
} from '../../../store/api/notificationsApi';
import { FileText, RotateCw, Loader2, Mail, Bell, Smartphone, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

type Tab = 'logs' | 'templates';

export default function NotificationAdminPage() {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Bell size={24} /> Notification Admin</h1>
        <p className="text-muted">Monitor notification delivery and manage templates</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
          📋 Delivery Logs
        </button>
        <button className={`tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          📝 Templates
        </button>
      </div>

      <div className="tab-content">
        {tab === 'logs' && <LogsTab />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  );
}

/* ─── Logs Tab ─────────────────────────────── */

const CHANNEL_ICONS: Record<string, JSX.Element> = {
  email: <Mail size={14} />, in_app: <Bell size={14} />,
  sms: <Smartphone size={14} />, push: <MessageSquare size={14} />,
};

function LogsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (statusFilter) params.status = statusFilter;
  if (channelFilter) params.channel = channelFilter;

  const { data, isLoading } = useGetNotificationLogsQuery(params);
  const [retryNotif] = useRetryNotificationMutation();
  const logs = data?.data || [];
  const meta = data?.meta;

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading logs...</div>;

  return (
    <>
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="input-full" style={{ maxWidth: 140 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <select className="input-full" style={{ maxWidth: 140 }} value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value); setPage(1); }}>
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="in_app">In-App</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </select>
        </div>
        <span className="text-secondary">{meta?.total ?? 0} log(s)</span>
      </div>

      {logs.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">No notification logs found.</p>
        </div>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Channel</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Sent At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: NotificationLogItem) => (
                <tr key={log.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {log.recipient?.profile ? `${log.recipient.profile.firstName} ${log.recipient.profile.lastName}` : 'Unknown'}
                      </span>
                      <span className="text-muted text-small">{log.recipient?.email || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {CHANNEL_ICONS[log.channel] || null}
                      {log.channel}
                    </span>
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.subject || log.templateCode || '—'}
                  </td>
                  <td>
                    <span className={`status-badge ${log.status === 'sent' ? 'active' : log.status === 'failed' ? 'danger' : 'pending'}`}>
                      {log.status}
                    </span>
                    {log.errorMessage && (
                      <div className="text-small" style={{ color: 'var(--danger)', marginTop: 2 }}>{log.errorMessage}</div>
                    )}
                  </td>
                  <td className="text-small">{log.sentAt ? new Date(log.sentAt).toLocaleString() : new Date(log.createdAt).toLocaleString()}</td>
                  <td>
                    {log.status === 'failed' && (
                      <button className="btn btn-sm" title="Retry" onClick={async () => {
                        try { await retryNotif(log.id).unwrap(); toast.success('Retrying...'); }
                        catch { toast.error('Retry failed'); }
                      }}>
                        <RotateCw size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-secondary">Page {meta.page} of {meta.totalPages}</span>
          <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </>
  );
}

/* ─── Templates Tab ────────────────────────── */

function TemplatesTab() {
  const { data, isLoading } = useGetNotificationTemplatesQuery();
  const templates = data?.data || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTemplate = templates.find(t => t.id === selectedId);

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading templates...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Left: Template List */}
      <div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <span className="text-secondary">{templates.length} template(s)</span>
        </div>
        {templates.length === 0 ? (
          <div className="info-card" style={{ textAlign: 'center', padding: 32 }}>
            <p className="text-muted">No templates defined yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {templates.map((t: NotificationTemplate) => (
              <div key={t.id}
                onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: selectedId === t.id ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                  border: `1px solid ${selectedId === t.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{t.name}</strong>
                  <span className={`status-badge ${t.isActive ? 'active' : 'inactive'}`} style={{ fontSize: 10 }}>
                    {t.isActive ? 'active' : 'inactive'}
                  </span>
                </div>
                <div className="text-small text-muted" style={{ marginTop: 2 }}>
                  <code>{t.code}</code> · {t.channels.join(', ')}
                  {t.isCritical && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>⚠ critical</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Template Detail */}
      <div>
        {selectedTemplate ? (
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}><FileText size={16} /> {selectedTemplate.name}</h3>
            {selectedTemplate.description && <p className="text-muted text-small">{selectedTemplate.description}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="text-small text-muted">Code</label>
                <div><code>{selectedTemplate.code}</code></div>
              </div>
              <div>
                <label className="text-small text-muted">Channels</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedTemplate.channels.map(c => (
                    <span key={c} className="role-chip" style={{ fontSize: 11 }}>
                      {CHANNEL_ICONS[c] || null} {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {selectedTemplate.subject && (
              <div style={{ marginBottom: 12 }}>
                <label className="text-small text-muted">Subject</label>
                <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}>
                  {selectedTemplate.subject}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label className="text-small text-muted">Body (Text)</label>
              <pre style={{
                background: 'var(--surface)', padding: 12, borderRadius: 8,
                fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap',
                maxHeight: 200, overflow: 'auto', margin: 0,
              }}>
                {selectedTemplate.bodyText}
              </pre>
            </div>

            {selectedTemplate.variables.length > 0 && (
              <div>
                <label className="text-small text-muted">Variables</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {selectedTemplate.variables.map(v => (
                    <span key={v.name} className="role-chip" style={{ fontSize: 11 }}>
                      {'{{'}  {v.name} {'}}'}
                      <span className="text-muted" style={{ marginLeft: 4 }}>{v.type}{v.required ? '*' : ''}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="info-card" style={{ textAlign: 'center', padding: 40 }}>
            <FileText size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p className="text-muted">Select a template to view its details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
