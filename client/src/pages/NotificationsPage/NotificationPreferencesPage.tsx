import { useState, useEffect, useMemo } from 'react';
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  type NotificationPref,
} from '../../store/api/notificationsApi';
import {
  Bell, Mail, MessageSquare, Smartphone, Monitor,
  Moon, Sun, Save, CheckCircle, Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Group templates by category prefix (e.g. "invoice_" → "Invoices")
function guessCategory(code: string): string {
  const map: Record<string, string> = {
    invoice: 'Billing & Invoices',
    payment: 'Billing & Invoices',
    receipt: 'Billing & Invoices',
    lease: 'Lease & Contracts',
    tenant: 'Tenant Management',
    resident: 'Resident Management',
    maintenance: 'Maintenance',
    ticket: 'Maintenance',
    booking: 'Facility Booking',
    visitor: 'Visitor Management',
    announcement: 'Community',
    security: 'Security & Access',
    system: 'System',
  };
  const prefix = code.split('_')[0];
  return map[prefix] || 'General';
}

const CHANNEL_INFO = [
  { key: 'emailEnabled' as const, label: 'Email', icon: <Mail size={16} />, channelKey: 'email' },
  { key: 'smsEnabled' as const, label: 'SMS', icon: <MessageSquare size={16} />, channelKey: 'sms' },
  { key: 'pushEnabled' as const, label: 'Push', icon: <Smartphone size={16} />, channelKey: 'push' },
  { key: 'inAppEnabled' as const, label: 'In-App', icon: <Monitor size={16} />, channelKey: 'in_app' },
];

export default function NotificationPreferencesPage() {
  const { data, isLoading } = useGetPreferencesQuery();
  const [updatePrefs, { isLoading: saving }] = useUpdatePreferencesMutation();
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data?.data) {
      setPrefs(data.data.preferences);
      setQuietStart(data.data.quietHoursStart || '');
      setQuietEnd(data.data.quietHoursEnd || '');
      setHasChanges(false);
    }
  }, [data]);

  const toggle = (code: string, field: keyof NotificationPref) => {
    setPrefs(prev => prev.map(p =>
      p.templateCode === code ? { ...p, [field]: !p[field] } : p
    ));
    setHasChanges(true);
  };

  // Toggle all for a channel
  const toggleAllChannel = (field: keyof NotificationPref, enabled: boolean) => {
    setPrefs(prev => prev.map(p => ({ ...p, [field]: enabled })));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updatePrefs({
        preferences: prefs.map(p => ({
          templateCode: p.templateCode,
          emailEnabled: p.emailEnabled,
          smsEnabled: p.smsEnabled,
          pushEnabled: p.pushEnabled,
          inAppEnabled: p.inAppEnabled,
        })),
        quietHoursStart: quietStart || undefined,
        quietHoursEnd: quietEnd || undefined,
      }).unwrap();
      toast.success('Preferences saved');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save');
    }
  };

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, NotificationPref[]> = {};
    prefs.forEach(p => {
      const cat = guessCategory(p.templateCode);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [prefs]);

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-inline"><div className="loading-spinner" /> Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1><Bell size={24} /> Notification Preferences</h1>
          <p className="text-muted">Choose how and when you receive notifications for each category</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {saving ? <div className="loading-spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Master Channel Controls */}
      <div className="info-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem', opacity: 0.7, marginRight: 8 }}>
          <Shield size={14} style={{ marginRight: 4 }} /> Master Controls:
        </span>
        {CHANNEL_INFO.map(ch => {
          const allEnabled = prefs.every(p => p[ch.key]);
          return (
            <button
              key={ch.key}
              className={`btn btn-sm ${allEnabled ? 'btn-primary' : ''}`}
              onClick={() => toggleAllChannel(ch.key, !allEnabled)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              title={`${allEnabled ? 'Disable' : 'Enable'} all ${ch.label}`}
            >
              {ch.icon} {ch.label}: {allEnabled ? 'All On' : 'Mixed'}
            </button>
          );
        })}
      </div>

      {/* Grouped Preferences */}
      {grouped.map(([category, items]) => (
        <div key={category} className="info-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color, rgba(128,128,128,0.1))',
            background: 'var(--bg-secondary, rgba(128,128,128,0.03))',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Bell size={16} style={{ opacity: 0.5 }} />
            {category}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, opacity: 0.4, marginLeft: 4 }}>
              ({items.length} {items.length === 1 ? 'template' : 'templates'})
            </span>
          </div>

          <div className="data-table-wrapper" style={{ margin: 0 }}>
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Notification</th>
                  {CHANNEL_INFO.map(ch => (
                    <th key={ch.key} style={{ textAlign: 'center', width: '15%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {ch.icon} {ch.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(p => (
                  <tr key={p.templateCode}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.4, fontFamily: 'monospace' }}>{p.templateCode}</div>
                    </td>
                    {CHANNEL_INFO.map(ch => {
                      const supported = p.channels.includes(ch.channelKey);
                      const enabled = p[ch.key] as boolean;
                      return (
                        <td key={ch.key} style={{ textAlign: 'center' }}>
                          {supported ? (
                            <label className="toggle-switch" title={`${enabled ? 'Disable' : 'Enable'} ${ch.label}`}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => toggle(p.templateCode, ch.key)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          ) : (
                            <span style={{ fontSize: '0.75rem', opacity: 0.25 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {prefs.length === 0 && (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Bell size={32} />
          <p>No notification templates configured yet</p>
        </div>
      )}

      {/* Quiet Hours */}
      <div className="info-card" style={{ padding: 20, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Moon size={18} style={{ color: 'var(--primary, #6366f1)' }} />
          <h3 style={{ margin: 0 }}>Quiet Hours</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 16 }}>
          Non-critical notifications will be suppressed during quiet hours.
          Critical notifications (security, payment overdue) will still be delivered immediately.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 400 }}>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Moon size={14} /> Start Time
            </label>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => { setQuietStart(e.target.value); setHasChanges(true); }}
              placeholder="22:00"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sun size={14} /> End Time
            </label>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => { setQuietEnd(e.target.value); setHasChanges(true); }}
              placeholder="07:00"
            />
          </div>
        </div>
        {quietStart && quietEnd && (
          <div style={{
            marginTop: 12,
            padding: '8px 14px',
            background: 'rgba(99,102,241,0.06)',
            borderRadius: 8,
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <CheckCircle size={14} style={{ color: 'var(--primary, #6366f1)' }} />
            Quiet hours active: <strong>{quietStart}</strong> to <strong>{quietEnd}</strong>
          </div>
        )}
      </div>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--primary, #6366f1)',
          color: '#fff',
          padding: '10px 24px',
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 100,
          fontSize: '0.85rem',
        }}>
          <span>You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Save size={13} /> Save
          </button>
        </div>
      )}
    </div>
  );
}
