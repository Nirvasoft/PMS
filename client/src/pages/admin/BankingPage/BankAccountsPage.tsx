import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetBankAccountsQuery, useCreateBankAccountMutation } from '../../../store/api/bankingApi';
import type { BankAccount } from '../../../store/api/bankingApi';
import { useAlertDialog } from '../../../components/DialogProvider';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BANK_ICONS: Record<string, string> = {
  'DBS': '🏦', 'OCBC': '🏛️', 'UOB': '🏢', 'HSBC': '🌐', 'Citi': '🌍', 'Standard Chartered': '🏗️',
};
const getBankIcon = (name: string) => Object.entries(BANK_ICONS).find(([k]) => name.includes(k))?.[1] || '🏦';

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const { data: accounts = [], isLoading } = useGetBankAccountsQuery();
  const [showCreate, setShowCreate] = useState(false);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);
  const activeAccounts = accounts.filter(a => a.isActive);

  return (
    <div className="gl-page">
      <h2>Bank Accounts</h2>
      <div className="gl-toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Bank Account</button>
      </div>

      <div className="gl-stats">
        <div className="gl-stat-card">
          <div className="stat-value">{activeAccounts.length}</div>
          <div className="stat-label">Active Accounts</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value" style={{color:'var(--success, #22c55e)'}}>{fmtAmt(totalBalance)}</div>
          <div className="stat-label">Total Balance</div>
        </div>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:16}}>
          {accounts.map(acct => (
            <div key={acct.id} className="gl-card" style={{cursor:'pointer',transition:'transform 0.15s,box-shadow 0.15s'}}
              onClick={() => navigate(`/admin/banking/reconcile/${acct.id}`)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
            >
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
              No bank accounts configured. Click "+ Add Bank Account" to get started.
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateBankAccountModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateBankAccountModal({ onClose }: { onClose: () => void }) {
  const [createAccount, { isLoading }] = useCreateBankAccountMutation();
  const [form, setForm] = useState({
    bankName: '', accountName: '', accountNumber: '', accountType: 'current',
    currency: 'USD', openingBalance: 0, branchName: '', swiftCode: '',
  });
  const alertDialog = useAlertDialog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAccount(form).unwrap();
      onClose();
    } catch (err: any) { alertDialog(err.data?.message || 'Error'); }
  };

  return (
    <div className="gl-modal-overlay">
      <div className="gl-modal" onClick={e => e.stopPropagation()}>
        <h3>Add Bank Account</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Bank Name</label>
              <input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} required placeholder="e.g. DBS Bank" />
            </div>
            <div className="gl-form-group">
              <label>Account Name</label>
              <input value={form.accountName} onChange={e => setForm({...form, accountName: e.target.value})} required placeholder="e.g. Operating Account" />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Account Number</label>
              <input value={form.accountNumber} onChange={e => setForm({...form, accountNumber: e.target.value})} required />
            </div>
            <div className="gl-form-group">
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
              <label>Currency</label>
              <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                <option value="USD">USD</option><option value="SGD">SGD</option>
                <option value="EUR">EUR</option><option value="GBP">GBP</option>
                <option value="MMK">MMK</option><option value="THB">THB</option>
              </select>
            </div>
            <div className="gl-form-group">
              <label>Opening Balance</label>
              <input type="number" step="0.01" value={form.openingBalance || ''} onChange={e => setForm({...form, openingBalance: parseFloat(e.target.value) || 0})} />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Branch</label>
              <input value={form.branchName} onChange={e => setForm({...form, branchName: e.target.value})} />
            </div>
            <div className="gl-form-group">
              <label>SWIFT Code</label>
              <input value={form.swiftCode} onChange={e => setForm({...form, swiftCode: e.target.value})} />
            </div>
          </div>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Creating…' : 'Create Account'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
