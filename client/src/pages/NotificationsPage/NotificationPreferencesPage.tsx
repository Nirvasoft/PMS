import { useState, useEffect } from 'react';
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  type NotificationPref,
} from '../../store/api/notificationsApi';
import toast from 'react-hot-toast';

export default function NotificationPreferencesPage() {
  const { data, isLoading } = useGetPreferencesQuery();
  const [updatePrefs, { isLoading: saving }] = useUpdatePreferencesMutation();
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');

  useEffect(() => {
    if (data?.data) {
      setPrefs(data.data.preferences);
      setQuietStart(data.data.quietHoursStart || '');
      setQuietEnd(data.data.quietHoursEnd || '');
    }
  }, [data]);

  const toggle = (code: string, field: keyof NotificationPref) => {
    setPrefs(prev => prev.map(p =>
      p.templateCode === code ? { ...p, [field]: !p[field] } : p
    ));
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
    } catch {
      toast.error('Failed to save');
    }
  };

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-inline"><div className="loading-spinner" /> Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🔔 Notification Preferences</h1>
        <p className="text-secondary">Choose how you want to receive notifications for each category</p>
      </div>

      {/* Channel Toggle Matrix */}
      <div className="user-detail-section">
        <div className="section-header">
          <h3>Channel Preferences</h3>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="pref-table-container">
          <table className="audit-table" id="pref-table">
            <thead>
              <tr>
                <th>Notification</th>
                <th style={{ textAlign: 'center' }}>📧 Email</th>
                <th style={{ textAlign: 'center' }}>📱 SMS</th>
                <th style={{ textAlign: 'center' }}>🔔 Push</th>
                <th style={{ textAlign: 'center' }}>💬 In-App</th>
              </tr>
            </thead>
            <tbody>
              {prefs.map(p => (
                <tr key={p.templateCode}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="text-muted text-small">{p.templateCode}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={p.emailEnabled}
                        onChange={() => toggle(p.templateCode, 'emailEnabled')}
                        disabled={!p.channels.includes('email')} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={p.smsEnabled}
                        onChange={() => toggle(p.templateCode, 'smsEnabled')}
                        disabled={!p.channels.includes('sms')} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={p.pushEnabled}
                        onChange={() => toggle(p.templateCode, 'pushEnabled')}
                        disabled={!p.channels.includes('push')} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={p.inAppEnabled}
                        onChange={() => toggle(p.templateCode, 'inAppEnabled')}
                        disabled={!p.channels.includes('in_app')} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                </tr>
              ))}
              {prefs.length === 0 && (
                <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 40 }}>
                  No notification templates configured yet
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="user-detail-section" style={{ marginTop: 24 }}>
        <div className="section-header">
          <h3>🌙 Quiet Hours</h3>
        </div>
        <p className="text-muted text-small" style={{ marginBottom: 16 }}>
          Non-critical notifications will be suppressed during quiet hours.
          Critical notifications (security, payment overdue) will still be delivered.
        </p>
        <div className="form-row-2">
          <div className="form-group">
            <label>Start Time</label>
            <input type="time" className="input-full" value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input type="time" className="input-full" value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
