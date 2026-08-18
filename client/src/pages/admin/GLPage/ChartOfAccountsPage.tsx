import { useState } from 'react';
import { useGetGlAccountsQuery, useCreateGlAccountMutation, useUpdateGlAccountMutation, useSeedCOAMutation } from '../../../store/api/glApi';
import type { GlAccount } from '../../../store/api/glApi';
import { useAlertDialog } from '../../../components/DialogProvider';
import './GLPage.css';

function AccountNode({ account, accounts, onEdit }: { account: GlAccount; accounts: GlAccount[]; onEdit: (a: GlAccount) => void }) {
  const [open, setOpen] = useState(true);
  const children = accounts.filter(a => a.parentId === account.id);
  return (
    <li>
      <div className="coa-node">
        {children.length > 0
          ? <span className="coa-toggle" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</span>
          : <span className="coa-toggle" />}
        <span className="coa-code">{account.code}</span>
        <span className="coa-name">{account.name}</span>
        <span className={`gl-type-chip ${account.accountType}`}>{account.accountType}</span>
        {account.isControl && <span className="gl-badge closed" style={{fontSize:'0.65rem'}}>Control</span>}
        <button className="btn-sm" onClick={() => onEdit(account)} title="Edit">✏️</button>
      </div>
      {open && children.length > 0 && (
        <ul className="coa-children">
          {children.map(c => <AccountNode key={c.id} account={c} accounts={accounts} onEdit={onEdit} />)}
        </ul>
      )}
    </li>
  );
}

export default function ChartOfAccountsPage() {
  const { data: accounts = [], isLoading } = useGetGlAccountsQuery({});
  const [seedCOA] = useSeedCOAMutation();
  const [createAccount] = useCreateGlAccountMutation();
  const [updateAccount] = useUpdateGlAccountMutation();
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<GlAccount | null>(null);
  const [filterType, setFilterType] = useState('');

  const rootAccounts = accounts.filter(a => !a.parentId);
  const filtered = filterType ? rootAccounts.filter(a => a.accountType === filterType) : rootAccounts;

  const handleEdit = (a: GlAccount) => { setEditAccount(a); setShowModal(true); };
  const handleNew = () => { setEditAccount(null); setShowModal(true); };

  return (
    <div className="gl-page">
      <h2>Chart of Accounts</h2>
      <div className="gl-toolbar">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleNew}>+ Add Account</button>
        <button className="btn-sm" onClick={() => seedCOA()} title="Seed default accounts">🌱 Seed COA</button>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-card">
          <ul className="coa-tree">
            {filtered.map(a => <AccountNode key={a.id} account={a} accounts={accounts} onEdit={handleEdit} />)}
          </ul>
          {filtered.length === 0 && <p style={{padding:20,textAlign:'center',color:'var(--text-muted)'}}>No accounts found. Click "Seed COA" to create default chart of accounts.</p>}
        </div>
      )}

      {showModal && (
        <AccountModal
          account={editAccount}
          accounts={accounts}
          onClose={() => setShowModal(false)}
          onCreate={createAccount}
          onUpdate={updateAccount}
        />
      )}
    </div>
  );
}

function AccountModal({ account, accounts, onClose, onCreate, onUpdate }: any) {
  const isEdit = !!account;
  const alertDialog = useAlertDialog();
  const [form, setForm] = useState({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'asset',
    accountSubtype: account?.accountSubtype || '',
    normalBalance: account?.normalBalance || 'debit',
    parentId: account?.parentId || '',
    isControl: account?.isControl || false,
    description: account?.description || '',
    isActive: account?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await onUpdate({ id: account.id, data: { name: form.name, accountSubtype: form.accountSubtype || null, description: form.description || null, isActive: form.isActive } }).unwrap();
      } else {
        await onCreate({ ...form, parentId: form.parentId || undefined, accountSubtype: form.accountSubtype || undefined }).unwrap();
      }
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || 'Error saving account');
    }
  };

  return (
    <div className="gl-modal-overlay">
      <div className="gl-modal" onClick={e => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Account' : 'New Account'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Account Code</label>
              <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required disabled={isEdit} />
            </div>
            <div className="gl-form-group">
              <label>Account Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Account Type</label>
              <select value={form.accountType} onChange={e => setForm({...form, accountType: e.target.value})} disabled={isEdit}>
                <option value="asset">Asset</option><option value="liability">Liability</option>
                <option value="equity">Equity</option><option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="gl-form-group">
              <label>Normal Balance</label>
              <select value={form.normalBalance} onChange={e => setForm({...form, normalBalance: e.target.value})} disabled={isEdit}>
                <option value="debit">Debit</option><option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Parent Account</label>
              <select value={form.parentId} onChange={e => setForm({...form, parentId: e.target.value})} disabled={isEdit}>
                <option value="">— None (Root) —</option>
                {accounts.filter((a: GlAccount) => !a.parentId).map((a: GlAccount) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div className="gl-form-group">
              <label>Subtype</label>
              <input value={form.accountSubtype} onChange={e => setForm({...form, accountSubtype: e.target.value})} placeholder="e.g. current_asset" />
            </div>
          </div>
          <div className="gl-form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} />
          </div>
          <div className="gl-form-group" style={{display:'flex',gap:16,alignItems:'center'}}>
            <label style={{marginBottom:0}}>
              <input type="checkbox" checked={form.isControl} onChange={e => setForm({...form, isControl: e.target.checked})} disabled={isEdit} /> Control Account
            </label>
            {isEdit && <label style={{marginBottom:0}}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} /> Active
            </label>}
          </div>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">{isEdit ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
