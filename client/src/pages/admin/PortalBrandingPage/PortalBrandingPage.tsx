import { useState, useEffect } from 'react';
import {
  useGetPortalBrandingQuery, useUpdatePortalBrandingMutation,
  type PortalBranding,
} from '../../../store/api/portalApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Palette, Save, Eye, Image, Type, Mail, Phone,
  ToggleLeft, ToggleRight, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

export default function PortalBrandingPage() {
  const [selectedProperty, setSelectedProperty] = useState('');
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  // Auto-select first property
  useEffect(() => {
    if (properties.length > 0 && !selectedProperty) {
      setSelectedProperty(properties[0].id);
    }
  }, [properties, selectedProperty]);

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Palette size={24} /> Portal Branding</h1>
        <p className="text-muted">Customize the tenant portal appearance for each property</p>
      </div>

      {/* Property Selector */}
      <div className="section-toolbar" style={{ marginBottom: 20 }}>
        <Building2 size={16} style={{ opacity: 0.5 }} />
        <select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          className="form-select"
          style={{ width: 280 }}
        >
          <option value="">Select property...</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProperty && (
        <BrandingEditor propertyId={selectedProperty} />
      )}
    </div>
  );
}

function BrandingEditor({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useGetPortalBrandingQuery(propertyId);
  const [updateBranding, { isLoading: saving }] = useUpdatePortalBrandingMutation();

  const [form, setForm] = useState<Partial<PortalBranding>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ ...data });
      setHasChanges(false);
    }
  }, [data]);

  const update = (key: keyof PortalBranding, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateBranding({ propertyId, data: form }).unwrap();
      toast.success('Branding saved');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save branding');
    }
  };

  if (isLoading) {
    return <div className="loading-inline"><div className="loading-spinner" /> Loading branding...</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
      {/* Settings Panel */}
      <div>
        {/* Visual Identity */}
        <div className="info-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image size={18} /> Visual Identity
          </h3>

          <div className="form-group">
            <label>Logo URL</label>
            <input
              type="text"
              value={form.logoUrl || ''}
              onChange={(e) => update('logoUrl', e.target.value || null)}
              placeholder="https://example.com/logo.png"
            />
            <span style={{ fontSize: '0.72rem', opacity: 0.5 }}>PNG or SVG recommended, max 200x60px</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Palette size={14} /> Primary Color
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={form.primaryColor || '#6366f1'}
                  onChange={(e) => update('primaryColor', e.target.value)}
                  style={{ width: 48, height: 36, padding: 2, cursor: 'pointer', borderRadius: 6 }}
                />
                <input
                  type="text"
                  value={form.primaryColor || '#6366f1'}
                  onChange={(e) => update('primaryColor', e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Palette size={14} /> Accent Color
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={form.accentColor || '#a78bfa'}
                  onChange={(e) => update('accentColor', e.target.value)}
                  style={{ width: 48, height: 36, padding: 2, cursor: 'pointer', borderRadius: 6 }}
                />
                <input
                  type="text"
                  value={form.accentColor || '#a78bfa'}
                  onChange={(e) => update('accentColor', e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="info-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Type size={18} /> Content
          </h3>

          <div className="form-group">
            <label>Welcome Message</label>
            <textarea
              value={form.welcomeMessage || ''}
              onChange={(e) => update('welcomeMessage', e.target.value)}
              rows={2}
              placeholder="Welcome to your property portal"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label><Mail size={14} /> Support Email</label>
              <input
                type="email"
                value={form.supportEmail || ''}
                onChange={(e) => update('supportEmail', e.target.value || null)}
                placeholder="support@property.com"
              />
            </div>
            <div className="form-group">
              <label><Phone size={14} /> Support Phone</label>
              <input
                type="text"
                value={form.supportPhone || ''}
                onChange={(e) => update('supportPhone', e.target.value || null)}
                placeholder="+1 234 567 8900"
              />
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="info-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToggleLeft size={18} /> Portal Features
          </h3>
          <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 16 }}>
            Control which features are visible to tenants in this property&apos;s portal
          </p>

          {[
            { key: 'showOnlinePayment' as const, label: 'Online Payment', desc: 'Allow tenants to pay invoices online' },
            { key: 'showMaintenance' as const, label: 'Maintenance Requests', desc: 'Allow tenants to submit maintenance tickets' },
            { key: 'showCommunity' as const, label: 'Community Board', desc: 'Show announcements and community posts' },
            { key: 'showBookings' as const, label: 'Facility Bookings', desc: 'Allow tenants to book shared facilities' },
          ].map(feat => (
            <div key={feat.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--border-color, rgba(128,128,128,0.08))',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{feat.label}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{feat.desc}</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form[feat.key] !== false}
                  onChange={(e) => update(feat.key, e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>

        {/* Save */}
        <PermissionGuard permission="community-branding.write">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {saving ? <div className="loading-spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Branding'}
          </button>
        </PermissionGuard>
      </div>

      {/* Live Preview */}
      <div className="info-card" style={{ padding: 0, position: 'sticky', top: 20, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-secondary, rgba(128,128,128,0.03))',
          borderBottom: '1px solid var(--border-color, rgba(128,128,128,0.1))',
          display: 'flex', alignItems: 'center', gap: 6,
          fontWeight: 600, fontSize: '0.85rem',
        }}>
          <Eye size={14} /> Live Preview
        </div>

        {/* Mini portal preview */}
        <div style={{
          background: '#0f0f23',
          padding: 16,
          minHeight: 320,
          color: '#e2e8f0',
          fontSize: '0.75rem',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            borderLeft: `3px solid ${form.primaryColor || '#6366f1'}`,
          }}>
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" style={{ height: 24, maxWidth: 80, objectFit: 'contain' }} />
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: form.primaryColor || '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 700, color: '#fff',
              }}>
                {(form.propertyName || 'P').charAt(0)}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{form.propertyName || 'Property'}</div>
              <div style={{ opacity: 0.5, fontSize: '0.65rem' }}>Tenant Portal</div>
            </div>
          </div>

          {/* Welcome */}
          <div style={{
            padding: '12px 14px',
            background: `linear-gradient(135deg, ${form.primaryColor || '#6366f1'}22, ${form.accentColor || '#a78bfa'}22)`,
            borderRadius: 8,
            marginBottom: 12,
            borderLeft: `3px solid ${form.primaryColor || '#6366f1'}`,
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>{form.welcomeMessage || 'Welcome!'}</div>
          </div>

          {/* Nav items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {['Dashboard', 'Invoices', 'Maintenance', 'My Lease', 'Bookings', 'Community'].map((item, i) => {
              const hidden =
                (item === 'Maintenance' && form.showMaintenance === false) ||
                (item === 'Bookings' && form.showBookings === false) ||
                (item === 'Community' && form.showCommunity === false);
              if (hidden) return null;
              return (
                <div key={item} style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: i === 0 ? `${form.primaryColor || '#6366f1'}33` : 'transparent',
                  color: i === 0 ? form.primaryColor || '#6366f1' : '#94a3b8',
                  fontWeight: i === 0 ? 600 : 400,
                  fontSize: '0.72rem',
                }}>
                  {item}
                </div>
              );
            })}
          </div>

          {/* Support */}
          {(form.supportEmail || form.supportPhone) && (
            <div style={{
              marginTop: 16, padding: '8px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6, fontSize: '0.65rem', opacity: 0.6,
            }}>
              {form.supportEmail && <div>📧 {form.supportEmail}</div>}
              {form.supportPhone && <div>📞 {form.supportPhone}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
