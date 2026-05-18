import { useState, useEffect, useRef } from 'react';
import { useGetMeQuery } from '../../store/api/authApi';
import { useAppSelector } from '../../store';
import toast from 'react-hot-toast';
import { User, Mail, Phone, Building2, MapPin, Clock, Loader2, Save, Camera, ShieldCheck, ShieldAlert } from 'lucide-react';
import { baseQueryWithReauth } from '../../store/api/baseQuery';

export default function ProfilePage() {
  const { user, accessToken } = useAppSelector((s) => s.auth);
  const { data: meData, isLoading: meLoading, refetch } = useGetMeQuery();
  const me = meData?.data;
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', timezone: '', address: '',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);

  useEffect(() => {
    if (me && !loaded) {
      const p = me.profile as Record<string, string> | undefined;
      setForm({
        firstName: p?.firstName || '',
        lastName: p?.lastName || '',
        phone: p?.phone || '',
        timezone: p?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        address: p?.address || '',
      });
      if (p?.avatarUrl) setAvatarUrl(p.avatarUrl);
      setLoaded(true);
    }
  }, [me, loaded]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    try {
      const result = await baseQueryWithReauth(
        { url: `/users/${user.id}`, method: 'PUT', body: form },
        {} as Parameters<typeof baseQueryWithReauth>[1],
        {} as Parameters<typeof baseQueryWithReauth>[2],
      );
      if (result.error) throw result.error;
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch(`/api/v1/users/${user.id}/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setAvatarUrl(data.data.avatarUrl);
        toast.success('Avatar updated!');
      } else { toast.error('Upload failed'); }
    } catch { toast.error('Upload error'); }
    finally { setUploadingAvatar(false); }
  };

  const handleSendVerification = async () => {
    setSendingVerify(true);
    try {
      const result = await baseQueryWithReauth(
        { url: '/auth/send-verification', method: 'POST' },
        {} as Parameters<typeof baseQueryWithReauth>[1],
        {} as Parameters<typeof baseQueryWithReauth>[2],
      );
      if (result.error) throw result.error;
      const data = result.data as { data: { message: string; verifyUrl?: string } };
      toast.success(data.data.message);
      refetch();
    } catch { toast.error('Failed to send verification email'); }
    finally { setSendingVerify(false); }
  };

  if (meLoading) return <div className="page-content"><div className="loading-inline"><Loader2 size={20} className="spin" /> Loading profile...</div></div>;

  const emailVerified = (me as Record<string, unknown>)?.emailVerified as boolean | undefined;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><User size={24} /> My Profile</h1>
        <p className="text-muted">Manage your personal information and account settings</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 32, alignItems: 'start' }}>
        {/* Left — Avatar & Info Card */}
        <div className="info-card" style={{ textAlign: 'center', padding: 32 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 16px' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar"
                style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 96, height: 96, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 700, color: '#fff',
              }}>
                {form.firstName ? form.firstName[0].toUpperCase() : '?'}
                {form.lastName ? form.lastName[0].toUpperCase() : ''}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}
              title="Upload avatar"
            >
              {uploadingAvatar ? <Loader2 size={12} className="spin" /> : <Camera size={12} />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>

          <h3 style={{ margin: '0 0 4px' }}>{form.firstName} {form.lastName}</h3>
          <p className="text-muted text-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Mail size={14} /> {user?.email}
          </p>

          {/* Email verification badge */}
          <div style={{ marginTop: 12 }}>
            {emailVerified ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: 12 }}>
                <ShieldCheck size={14} /> Email Verified
              </span>
            ) : (
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--danger)', fontSize: 12 }}>
                  <ShieldAlert size={14} /> Email Not Verified
                </span>
                <br />
                <button className="btn btn-sm" style={{ marginTop: 8, fontSize: 11 }}
                  onClick={handleSendVerification} disabled={sendingVerify}>
                  {sendingVerify ? 'Sending...' : 'Send Verification Email'}
                </button>
              </div>
            )}
          </div>

          {user?.roles?.map((r, i) => (
            <span key={i} className="role-chip" style={{ margin: '8px 4px 0' }}>{r}</span>
          ))}
        </div>

        {/* Right — Edit Form */}
        <form onSubmit={handleSave} className="settings-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label><User size={14} /> First Name *</label>
              <input className="input-full" required value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="form-group">
              <label><User size={14} /> Last Name *</label>
              <input className="input-full" required value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label><Phone size={14} /> Phone</label>
              <input className="input-full" value={form.phone} placeholder="+1-555-0100"
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label><Clock size={14} /> Timezone</label>
              <select className="input-full" value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {Intl.supportedValuesOf('timeZone').map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label><MapPin size={14} /> Address</label>
            <input className="input-full" value={form.address} placeholder="123 Main St, City"
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label><Building2 size={14} /> Company</label>
            <input className="input-full" disabled value={(me?.company as Record<string, string>)?.name || 'N/A'}
              style={{ opacity: 0.6 }} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 16 }}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving...</> : <><Save size={16} /> Save Changes</>}
          </button>
        </form>
      </div>
    </div>
  );
}
