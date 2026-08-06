import { useNavigate } from 'react-router-dom';
import { useGetPenaltyConfigsQuery, useGetTaxConfigsQuery } from '../../../store/api/billingApi';
import { Settings, Shield, Calculator, ArrowRight, Tag, DollarSign } from 'lucide-react';
import './BillingPage.css';

export default function BillingSettingsPage() {
  const navigate = useNavigate();
  const { data: penaltyData } = useGetPenaltyConfigsQuery();
  const { data: taxData } = useGetTaxConfigsQuery();

  const penaltyCount = penaltyData?.data?.length || 0;
  const taxCount = taxData?.data?.length || 0;

  const sections = [
    {
      title: 'Penalty Configuration',
      description: 'Set up late payment penalties including grace periods, fixed or percentage-based fees, and compound interest options.',
      icon: <Shield size={22} />,
      color: '#f87171',
      bg: 'rgba(239,68,68,0.12)',
      path: '/admin/billing/penalty-configs',
      count: penaltyCount,
      countLabel: 'active configs',
    },
    {
      title: 'Tax Configuration',
      description: 'Manage GST, VAT, and other tax rates. Assign rates to specific charge types with effective date ranges.',
      icon: <Calculator size={22} />,
      color: '#fbbf24',
      bg: 'rgba(245,158,11,0.12)',
      path: '/admin/billing/tax-configs',
      count: taxCount,
      countLabel: 'tax rules',
    },
    {
      title: 'Charge Types',
      description: 'Define and manage charge type categories used across billing, invoicing, and lease schedules.',
      icon: <DollarSign size={22} />,
      color: '#34d399',
      bg: 'rgba(16,185,129,0.12)',
      path: '/admin/billing/charge-types',
      count: 0,
      countLabel: '',
    },
  ];

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <Settings size={22} />
          </div>
          <div>
            <h1>Billing Settings</h1>
            <p>Configure penalties, taxes, and billing rules</p>
          </div>
        </div>
      </div>

      {/* Settings Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {sections.map(section => (
          <div
            key={section.path}
            className="billing-stat-card"
            onClick={() => navigate(section.path)}
            style={{ cursor: 'pointer', padding: 28, gap: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="bsc-icon" style={{ background: section.bg, color: section.color, width: 44, height: 44 }}>
                {section.icon}
              </div>
              {section.count > 0 && (
                <span style={{
                  background: section.bg, color: section.color,
                  padding: '4px 12px', borderRadius: 20,
                  fontSize: 12, fontWeight: 700,
                }}>
                  {section.count} {section.countLabel}
                </span>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
                {section.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {section.description}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              Configure <ArrowRight size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
