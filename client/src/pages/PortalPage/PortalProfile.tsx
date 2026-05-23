import { useState, useEffect } from 'react';
import { useGetPortalProfileQuery, useUpdatePortalProfileMutation } from '../../store/api/portalApi';
import toast from 'react-hot-toast';
import { User, Phone, Globe, Save, Mail, Car, Shield } from 'lucide-react';

const TIMEZONES = [
  'UTC', 'Asia/Singapore', 'Asia/Yangon', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Dubai', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function PortalProfile() {
  const { data: profile, isLoading } = useGetPortalProfileQuery();
  const [updateProfile, { isLoading: saving }] = useUpdatePortalProfileMutation();

  const [mobile, setMobile] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    if (profile) {
      setMobile(profile.resident.mobile || '');
      setTimezone(profile.profile?.timezone || 'UTC');
      setLocale(profile.profile?.locale || 'en');
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile({ mobile, timezone, locale }).unwrap();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to update profile');
    }
  };

  if (isLoading) {
    return (
      <div className="page-content portal-page">
        <div className="loading-inline"><div className="loading-spinner" /> Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-content portal-page">
        <div className="page-header"><h1>My Profile</h1></div>
        <div className="portal-card-empty" style={{ padding: '40px' }}>
          <User size={40} style={{ opacity: 0.3 }} />
          <p>Profile not available</p>
        </div>
      </div>
    );
  }

  const { resident } = profile;

  return (
    <div className="page-content portal-page">
      <div className="page-header">
        <h1>My Profile</h1>
      </div>

      {/* Profile Card */}
      <div className="portal-profile-card" id="portal-profile-card">
        <div className="portal-profile-avatar">
          {resident.avatarUrl ? (
            <img src={resident.avatarUrl} alt={`${resident.firstName} ${resident.lastName}`} />
          ) : (
            <User size={40} />
          )}
        </div>
        <div className="portal-profile-header-info">
          <h2>{resident.firstName} {resident.lastName}</h2>
          <span className="portal-profile-type">
            {resident.residentType === 'primary_tenant' ? 'Primary Tenant' : resident.residentType.replace(/_/g, ' ')}
          </span>
          <div className="portal-profile-quick-info">
            {resident.email && <span><Mail size={14} /> {resident.email}</span>}
            {resident.vehiclePlate && <span><Car size={14} /> {resident.vehiclePlate}</span>}
          </div>
        </div>
      </div>

      {/* Editable Fields */}
      <div className="portal-card" style={{ marginBottom: 24 }} id="portal-profile-form">
        <div className="portal-card-header">
          <Shield size={18} />
          <h3>Contact & Preferences</h3>
        </div>
        <div className="portal-form">
          <div className="portal-form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label><Phone size={14} /> Mobile Number</label>
              <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+65-9xxx-xxxx" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label><Globe size={14} /> Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div className="portal-form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label><Globe size={14} /> Locale</label>
              <select value={locale} onChange={e => setLocale(e.target.value)}>
                <option value="en">English</option>
                <option value="en-SG">English (Singapore)</option>
                <option value="zh">Chinese</option>
                <option value="ms">Malay</option>
                <option value="ta">Tamil</option>
                <option value="my">Myanmar</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }} />
          </div>
          <div className="portal-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
