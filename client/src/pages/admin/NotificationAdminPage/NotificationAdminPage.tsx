import { useState, useMemo } from 'react';
import {
  useGetNotificationLogsQuery, useRetryNotificationMutation,
  useGetNotificationTemplatesQuery,
  useCreateTemplateMutation, useUpdateTemplateMutation, useDeleteTemplateMutation,
  type NotificationLogItem, type NotificationTemplate,
} from '../../../store/api/notificationsApi';
import { FileText, RotateCw, Loader2, Mail, Bell, Smartphone, MessageSquare, Plus, Trash2, Save, X, Eye, Code } from 'lucide-react';
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

const EMPTY_TEMPLATE: Partial<NotificationTemplate> = {
  code: '', name: '', description: '', channels: ['in_app'],
  subject: '', bodyText: '', bodyHtml: '', bodyPush: '',
  variables: [], isCritical: false, isActive: true,
};

const ALL_CHANNELS = ['in_app', 'email', 'sms', 'push'];

function TemplatesTab() {
  const { data, isLoading } = useGetNotificationTemplatesQuery();
  const [createTemplate, { isLoading: creating }] = useCreateTemplateMutation();
  const [updateTemplate, { isLoading: updating }] = useUpdateTemplateMutation();
  const [deleteTemplate] = useDeleteTemplateMutation();

  const templates = data?.data || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<NotificationTemplate>>(EMPTY_TEMPLATE);
  const [previewMode, setPreviewMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const selectedTemplate = templates.find(t => t.id === selectedId);
  const isNew = !selectedId && editing;
  const saving = creating || updating;

  const startCreate = () => {
    setSelectedId(null);
    setForm({ ...EMPTY_TEMPLATE });
    setEditing(true);
    setPreviewMode(false);
  };

  const startEdit = (t: NotificationTemplate) => {
    setSelectedId(t.id);
    setForm({
      code: t.code, name: t.name, description: t.description || '',
      channels: [...t.channels], subject: t.subject || '',
      bodyText: t.bodyText, bodyHtml: t.bodyHtml || '', bodyPush: t.bodyPush || '',
      variables: t.variables ? [...t.variables] : [], isCritical: t.isCritical,
      isActive: t.isActive,
    });
    setEditing(true);
    setPreviewMode(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(EMPTY_TEMPLATE);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.bodyText) {
      toast.error('Code, name, and body text are required');
      return;
    }
    try {
      if (isNew) {
        await createTemplate(form).unwrap();
        toast.success('Template created');
      } else if (selectedId) {
        await updateTemplate({ id: selectedId, data: form }).unwrap();
        toast.success('Template updated');
      }
      setEditing(false);
    } catch {
      toast.error('Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id).unwrap();
      toast.success('Template deleted');
      setDeleteConfirm(null);
      if (selectedId === id) { setSelectedId(null); setEditing(false); }
    } catch {
      toast.error('Delete failed');
    }
  };

  const toggleChannel = (ch: string) => {
    const current = form.channels || [];
    setForm({
      ...form,
      channels: current.includes(ch) ? current.filter(c => c !== ch) : [...current, ch],
    });
  };

  // Simple Handlebars preview
  const renderPreview = (template: string, vars: { name: string }[]) => {
    let result = template;
    for (const v of vars) {
      result = result.replace(new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`, 'g'), `<span style="background:#fef3c7;padding:0 4px;border-radius:3px;font-weight:600">${v.name}</span>`);
    }
    return result;
  };

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading templates...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      {/* Left: Template List */}
      <div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <span className="text-secondary">{templates.length} template(s)</span>
          <button className="btn btn-sm btn-primary" onClick={startCreate}>
            <Plus size={14} /> New
          </button>
        </div>
        {templates.length === 0 && !isNew ? (
          <div className="info-card" style={{ textAlign: 'center', padding: 32 }}>
            <p className="text-muted">No templates yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {templates.map((t: NotificationTemplate) => (
              <div key={t.id}
                onClick={() => { if (!editing) { setSelectedId(selectedId === t.id ? null : t.id); } else { startEdit(t); } }}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: selectedId === t.id ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                  border: `1px solid ${selectedId === t.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  position: 'relative',
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
                {/* Delete button on hover */}
                {deleteConfirm === t.id ? (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>Confirm Delete</button>
                    <button className="btn btn-sm" style={{ fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-sm"
                    style={{ position: 'absolute', top: 8, right: 8, opacity: 0.4, padding: '2px 4px' }}
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(t.id); }}
                    title="Delete template">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Editor / Detail */}
      <div>
        {editing ? (
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{isNew ? '✨ New Template' : '✏️ Edit Template'}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setPreviewMode(!previewMode)}>
                  {previewMode ? <><Code size={14} /> Editor</> : <><Eye size={14} /> Preview</>}
                </button>
                <button className="btn btn-sm" onClick={cancelEdit}><X size={14} /> Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={saving} onClick={handleSave}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save
                </button>
              </div>
            </div>

            {previewMode ? (
              /* Preview Mode */
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label className="text-small text-muted">Subject Preview</label>
                  <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, fontSize: 14, fontWeight: 500 }}
                    dangerouslySetInnerHTML={{ __html: renderPreview(form.subject || '(no subject)', form.variables || []) }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="text-small text-muted">Body Preview</label>
                  <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: renderPreview(form.bodyText || '', form.variables || []) }} />
                </div>
                {form.bodyPush && (
                  <div>
                    <label className="text-small text-muted">Push Preview ({form.bodyPush.length}/240 chars)</label>
                    <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 8, fontSize: 12 }}
                      dangerouslySetInnerHTML={{ __html: renderPreview(form.bodyPush, form.variables || []) }} />
                  </div>
                )}
              </div>
            ) : (
              /* Editor Mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="text-small text-muted">Code *</label>
                    <input className="input-full" value={form.code || ''} placeholder="e.g. lease_approved"
                      disabled={!isNew}
                      onChange={e => setForm({ ...form, code: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-small text-muted">Name *</label>
                    <input className="input-full" value={form.name || ''} placeholder="e.g. Lease Approved"
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="text-small text-muted">Description</label>
                  <input className="input-full" value={form.description || ''} placeholder="Brief description of when this template is used"
                    onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="text-small text-muted">Channels</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {ALL_CHANNELS.map(ch => (
                        <button key={ch}
                          className={`btn btn-sm ${(form.channels || []).includes(ch) ? 'btn-primary' : ''}`}
                          onClick={() => toggleChannel(ch)}
                          style={{ fontSize: 12 }}>
                          {CHANNEL_ICONS[ch]} {ch}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.isCritical || false}
                        onChange={e => setForm({ ...form, isCritical: e.target.checked })} />
                      ⚠ Critical (bypasses quiet hours)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.isActive !== false}
                        onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                      Active
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-small text-muted">Subject (Handlebars)</label>
                  <input className="input-full" value={form.subject || ''} placeholder="e.g. Lease Approved — Unit {{unitCode}}"
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                    onChange={e => setForm({ ...form, subject: e.target.value })} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="text-small text-muted">Body Text * (Handlebars)</label>
                    {(form.variables || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(form.variables || []).map(v => (
                          <button key={v.name} className="btn btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                            title={`Insert {{${v.name}}}`}
                            onClick={() => setForm({ ...form, bodyText: (form.bodyText || '') + `{{${v.name}}}` })}>
                            {`{{${v.name}}}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea className="input-full" rows={6} value={form.bodyText || ''}
                    placeholder="Dear {{tenantName}}, your lease for Unit {{unitCode}} has been approved."
                    style={{ fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
                    onChange={e => setForm({ ...form, bodyText: e.target.value })} />
                </div>

                <div>
                  <label className="text-small text-muted">Push Body (max 240 chars, optional)</label>
                  <input className="input-full" value={form.bodyPush || ''} maxLength={240}
                    placeholder="Short push notification text"
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                    onChange={e => setForm({ ...form, bodyPush: e.target.value })} />
                  {form.bodyPush && <span className="text-small text-muted">{form.bodyPush.length}/240</span>}
                </div>

                {/* Variables editor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="text-small text-muted">Template Variables</label>
                    <button className="btn btn-sm" style={{ fontSize: 11 }}
                      onClick={() => setForm({
                        ...form,
                        variables: [...(form.variables || []), { name: '', type: 'string', required: false }],
                      })}>
                      <Plus size={12} /> Add Variable
                    </button>
                  </div>
                  {(form.variables || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {(form.variables || []).map((v, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input className="input-full" style={{ flex: 1, fontSize: 12 }} value={v.name} placeholder="variableName"
                            onChange={e => {
                              const vars = [...(form.variables || [])];
                              vars[i] = { ...vars[i], name: e.target.value };
                              setForm({ ...form, variables: vars });
                            }} />
                          <select className="input-full" style={{ width: 90, fontSize: 12 }} value={v.type}
                            onChange={e => {
                              const vars = [...(form.variables || [])];
                              vars[i] = { ...vars[i], type: e.target.value };
                              setForm({ ...form, variables: vars });
                            }}>
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="date">date</option>
                            <option value="boolean">boolean</option>
                          </select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={v.required}
                              onChange={e => {
                                const vars = [...(form.variables || [])];
                                vars[i] = { ...vars[i], required: e.target.checked };
                                setForm({ ...form, variables: vars });
                              }} />
                            Req
                          </label>
                          <button className="btn btn-sm" style={{ padding: '2px 4px' }}
                            onClick={() => {
                              const vars = [...(form.variables || [])];
                              vars.splice(i, 1);
                              setForm({ ...form, variables: vars });
                            }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : selectedTemplate ? (
          /* Read-only detail */
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ marginTop: 0 }}><FileText size={16} /> {selectedTemplate.name}</h3>
              <button className="btn btn-sm btn-primary" onClick={() => startEdit(selectedTemplate)}>
                ✏️ Edit
              </button>
            </div>
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
            <p className="text-muted">Select a template to view details, or click <strong>+ New</strong> to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
