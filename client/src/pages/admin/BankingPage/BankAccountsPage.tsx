import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { useGetBankAccountsQuery, useCreateBankAccountMutation } from '../../../store/api/bankingApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useGetCurrencyRatesQuery } from '../../../store/api/billingApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { skipToken } from '@reduxjs/toolkit/query';
import '../GLPage/GLPage.css';

import { formatCompactAmount as fmtAmt } from '../../../utils/formatCurrency';

const BANK_ICONS: Record<string, string> = {
  'DBS': '🏦', 'OCBC': '🏛️', 'UOB': '🏢', 'HSBC': '🌐', 'Citi': '🌍', 'Standard Chartered': '🏗️',
  'KBZ': '🏦', 'AYA': '🏛️', 'CB': '🏢',
};
const getBankIcon = (name: string) => Object.entries(BANK_ICONS).find(([k]) => name.toUpperCase().includes(k))?.[1] || '🏦';

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const activePropertyFilter = useSelectedPropertyFilter();
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const properties = scopeData?.data || [];
  const activeProperty = properties.find((p) => p.id === activePropertyFilter);

  const { data: accounts = [], isLoading } = useGetBankAccountsQuery(
    activePropertyFilter ? { propertyId: activePropertyFilter } : undefined
  );
  const [showCreate, setShowCreate] = useState(false);

  const activeAccounts = accounts.filter(a => a.isActive);

  // Group balances by currency
  const balancesByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    accounts.forEach((a) => {
      map[a.currency] = (map[a.currency] || 0) + Number(a.currentBalance || 0);
    });
    return map;
  }, [accounts]);

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Landmark size={22} />
          </div>
          <div>
            <h1>Bank Accounts</h1>
            <p>{accounts.length} total bank accounts</p>
          </div>
          {activeProperty ? (
            <span className="gl-badge open" style={{ fontSize: '0.85rem', padding: '4px 10px', borderRadius: 8 }}>
              🏢 {activeProperty.name}
            </span>
          ) : (
            <span className="gl-badge closed" style={{ fontSize: '0.85rem', padding: '4px 10px', borderRadius: 8, background: 'rgba(100,116,139,0.15)', color: 'var(--text-secondary)' }}>
              🌐 All Properties
            </span>
          )}
        </div>
        <PermissionGuard permission="finance-banking.write">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Bank Account</button>
        </PermissionGuard>
      </div>

      <div className="gl-stats">
        <div className="gl-stat-card">
          <div className="stat-value">{activeAccounts.length}</div>
          <div className="stat-label">Active Accounts</div>
        </div>
        <div className="gl-stat-card" style={{ flex: 2 }}>
          <div className="stat-value" style={{ color: 'var(--success, #22c55e)', fontSize: Object.keys(balancesByCurrency).length > 2 ? '1.05rem' : '1.3rem' }}>
            {Object.entries(balancesByCurrency).length > 0 ? (
              Object.entries(balancesByCurrency).map(([curr, amt]) => `${curr} ${fmtAmt(amt)}`).join('  •  ')
            ) : '0.00'}
          </div>
          <div className="stat-label">Total Balance by Currency</div>
        </div>
      </div>

      {isLoading ? <TableSkeleton columns={6} rows={6} /> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:16}}>
          {accounts.map(acct => (
            <div key={acct.id} className="gl-card" style={{cursor:'pointer',transition:'transform 0.15s,box-shadow 0.15s'}}
              onClick={() => navigate(`/admin/banking/reconcile/${acct.id}`)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
            >
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                {acct.propertyId ? (
                  <span style={{fontSize:'0.75rem',fontWeight:600,color:'var(--accent, #6366f1)',background:'rgba(99,102,241,0.1)',padding:'2px 8px',borderRadius:6}}>
                    🏢 {acct.propertyName || 'Property Account'}
                  </span>
                ) : (
                  <span style={{fontSize:'0.75rem',fontWeight:600,color:'var(--text-secondary)',background:'rgba(156,163,175,0.15)',padding:'2px 8px',borderRadius:6}}>
                    🌐 Company-Wide
                  </span>
                )}
              </div>

              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <span style={{fontSize:'2rem'}}>{getBankIcon(acct.bankName)}</span>
                <div>
                  <div style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1rem'}}>{acct.bankName}</div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>{acct.accountName}</div>
                </div>
                <div style={{marginLeft:'auto'}}>
                  <span className={`gl-badge ${acct.isActive ? 'open' : 'closed'}`}>{acct.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:12,borderTop:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Account #</div>
                  <div style={{fontWeight:600,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{acct.accountNumber}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Balance ({acct.currency})</div>
                  <div style={{fontWeight:700,fontSize:'1.2rem',color:'var(--success, #22c55e)',fontVariantNumeric:'tabular-nums'}}>{fmtAmt(Number(acct.currentBalance))}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10,fontSize:'0.75rem',color:'var(--text-muted)'}}>
                <span className={`gl-type-chip ${acct.accountType === 'current' ? 'asset' : acct.accountType === 'savings' ? 'income' : 'equity'}`}>{acct.accountType}</span>
                {acct.branchName && <span>{acct.branchName}</span>}
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="gl-card" style={{textAlign:'center',padding:40,color:'var(--text-muted)',gridColumn:'1/-1'}}>
              No bank accounts found for the selected property scope. Click "+ Add Bank Account" to create one.
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateBankAccountModal
          properties={properties}
          initialPropertyId={activePropertyFilter}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CreateBankAccountModal({
  properties,
  initialPropertyId,
  onClose,
}: {
  properties: Array<{ id: string; name: string; currency?: string }>;
  initialPropertyId?: string;
  onClose: () => void;
}) {
  const [createAccount, { isLoading }] = useCreateBankAccountMutation();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    propertyId: initialPropertyId || '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    accountType: 'current',
    currency: 'MMK',
    openingBalance: 0,
    branchName: '',
    swiftCode: '',
  });
  const alertDialog = useAlertDialog();

  // Load Currency Setup data for the currently selected property
  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    form.propertyId ? { propertyId: form.propertyId } : skipToken
  );

  const rates = currencyRatesData?.data || [];

  // When property selection changes, auto-update default currency from Currency Setup
  useEffect(() => {
    if (form.propertyId) {
      if (rates.length > 0) {
        const baseRate = rates.find((r) => r.isBaseCurrency);
        const defaultCurr = baseRate?.currency || rates[0]?.currency || 'MMK';
        setForm((f) => ({ ...f, currency: defaultCurr }));
      } else {
        const prop = properties.find((p) => p.id === form.propertyId);
        if (prop?.currency) {
          setForm((f) => ({ ...f, currency: prop.currency || 'MMK' }));
        }
      }
    }
  }, [form.propertyId, rates, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!form.bankName.trim() || !form.accountName.trim() || !form.accountNumber.trim()) return;
    try {
      await createAccount({
        ...form,
        propertyId: form.propertyId || null,
      }).unwrap();
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || 'Error creating bank account');
    }
  };

  return (
    <div className="gl-modal-overlay">
      <div className="gl-modal" onClick={e => e.stopPropagation()}>
        <h3>Add Bank Account</h3>
        <form onSubmit={handleSubmit} noValidate>
          <div className="gl-form-row">
            <div className="gl-form-group" style={{ flex: 1 }}>
              <label>Property Scope</label>
              <select
                value={form.propertyId}
                onChange={e => setForm({ ...form, propertyId: e.target.value })}
              >
                <option value="">🌐 Company-Wide (All Properties)</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>🏢 {p.name}</option>
                ))}
              </select>
            </div>
            <div className="gl-form-group" style={{ flex: 1 }}>
              <label>Account Type</label>
              <select value={form.accountType} onChange={e => setForm({...form, accountType: e.target.value})}>
                <option value="current">Current</option>
                <option value="savings">Savings</option>
                <option value="fixed_deposit">Fixed Deposit</option>
              </select>
            </div>
          </div>

          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Bank Name <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !form.bankName.trim() ? 'gl-input-error' : ''}
                value={form.bankName}
                onChange={e => setForm({...form, bankName: e.target.value})}
                placeholder="e.g. KBZ Bank, AYA Bank, CB Bank"
              />
              {hasAttemptedSubmit && !form.bankName.trim() && (
                <span className="gl-error-text">Bank name is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>Account Name <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !form.accountName.trim() ? 'gl-input-error' : ''}
                value={form.accountName}
                onChange={e => setForm({...form, accountName: e.target.value})}
                placeholder="e.g. Collection & Operating"
              />
              {hasAttemptedSubmit && !form.accountName.trim() && (
                <span className="gl-error-text">Account name is required</span>
              )}
            </div>
          </div>

          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Account Number <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !form.accountNumber.trim() ? 'gl-input-error' : ''}
                value={form.accountNumber}
                onChange={e => setForm({...form, accountNumber: e.target.value})}
                placeholder="e.g. 086-101-0123456"
              />
              {hasAttemptedSubmit && !form.accountNumber.trim() && (
                <span className="gl-error-text">Account number is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm({...form, currency: e.target.value})}
              >
                {rates.length > 0 ? (
                  rates.map(r => (
                    <option key={r.currency} value={r.currency}>
                      {r.currency}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="MMK">MMK</option>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                    <option value="EUR">EUR</option>
                    <option value="THB">THB</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Opening Balance</label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance || ''}
                onChange={e => setForm({...form, openingBalance: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="gl-form-group">
              <label>Branch</label>
              <input
                value={form.branchName}
                onChange={e => setForm({...form, branchName: e.target.value})}
                placeholder="e.g. Yuzana Plaza Branch"
              />
            </div>
          </div>

          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>SWIFT / Branch Code</label>
              <input
                value={form.swiftCode}
                onChange={e => setForm({...form, swiftCode: e.target.value})}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
