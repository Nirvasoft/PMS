import { useNavigate } from 'react-router-dom';
import { useGetPenaltyConfigsQuery, useGetTaxConfigsQuery, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { Settings, Shield, Calculator, ArrowRight, DollarSign } from 'lucide-react';
import './BillingPage.css';

export default function BillingSettingsPage() {
  const navigate = useNavigate();
  const selectedPropertyId = useSelectedPropertyId();
  const { data: penaltyData } = useGetPenaltyConfigsQuery();
  const { data: taxData } = useGetTaxConfigsQuery();
  const { data: chargeTypesData } = useGetChargeTypesQuery(
    selectedPropertyId ? { propertyId: selectedPropertyId } : undefined,
  );

  const penaltyCount = penaltyData?.data?.length || 0;
  const taxCount = taxData?.data?.length || 0;
  const chargeTypeCount = chargeTypesData?.data?.length || 0;

  const sections = [
    {
      title: 'Penalty Configuration',
      description: 'Set up late payment penalties including grace periods, fixed or percentage-based fees, and compound interest options.',
      icon: <Shield size={22} />,
      color: '#f87171',
      bg: 'rgba(239,68,68,0.12)',
      path: '/admin/billing/penalty-configs',
      count: penaltyCount,
      countLabel: penaltyCount === 1 ? 'active config' : 'active configs',
    },
    {
      title: 'Tax Configuration',
      description: 'Manage GST, VAT, and other tax rates. Assign rates to specific charge types with effective date ranges.',
      icon: <Calculator size={22} />,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      path: '/admin/billing/tax-configs',
      count: taxCount,
      countLabel: taxCount === 1 ? 'tax rule' : 'tax rules',
    },
    {
      title: 'Charge Types',
      description: 'Define and manage charge type categories used across billing, invoicing, and lease schedules.',
      icon: <DollarSign size={22} />,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      path: '/admin/billing/charge-types',
      count: chargeTypeCount,
      countLabel: chargeTypeCount === 1 ? 'charge type' : 'charge types',
    },
  ];

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Settings size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Billing Settings</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>Configure penalties, taxes, and billing rules</p>
          </div>
        </div>
      </div>

      {/* Settings Cards */}
      <div className="billing-settings-grid">
        {sections.map(section => (
          <div
            key={section.path}
            className="billing-setting-card"
            onClick={() => navigate(section.path)}
          >
            <div className="bsc-card-top">
              <div className="bsc-card-icon" style={{ background: section.bg, color: section.color }}>
                {section.icon}
              </div>
              {section.count > 0 && (
                <span
                  className="bsc-card-badge"
                  style={{ background: section.bg, color: section.color }}
                >
                  {section.count} {section.countLabel}
                </span>
              )}
            </div>

            <div className="bsc-card-body">
              <h3 className="bsc-card-title">{section.title}</h3>
              <p className="bsc-card-desc">{section.description}</p>
            </div>

            <div className="bsc-card-footer">
              <span>Configure</span>
              <ArrowRight size={15} className="bsc-card-arrow" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
