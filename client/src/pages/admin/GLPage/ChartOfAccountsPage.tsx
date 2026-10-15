import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Search, X, Check, GitBranch, Layers } from 'lucide-react';
import {
  useGetGlAccountsQuery,
  useCreateGlAccountMutation,
  useUpdateGlAccountMutation,
  useSeedCOAMutation,
  useGetDepartmentCentersQuery,
  useGetCostCentersQuery,
} from '../../../store/api/glApi';
import type { GlAccount, DepartmentCenter, CostCenter } from '../../../store/api/glApi';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import '../BillingPage/BillingPage.css';
import '../../../components/GlAccountLookupField.css';
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
        {account.departmentCenter && (
          <span
            className="gl-badge"
            title={`Department Center: ${account.departmentCenter.code} — ${account.departmentCenter.name}`}
            style={{
              fontSize: '0.68rem',
              background: 'rgba(139, 92, 246, 0.14)',
              color: '#a78bfa',
              textTransform: 'none',
            }}
          >
            DC: {account.departmentCenter.code}
          </span>
        )}
        {account.costCenter && (
          <span
            className="gl-badge"
            title={`Cost Center: ${account.costCenter.code} — ${account.costCenter.name}`}
            style={{
              fontSize: '0.68rem',
              background: 'rgba(59, 130, 246, 0.14)',
              color: '#60a5fa',
              textTransform: 'none',
            }}
          >
            CC: {account.costCenter.code}
          </span>
        )}
        <span className={`gl-type-chip ${account.accountType}`}>{account.accountType}</span>
        {account.isControl && <span className="gl-badge closed" style={{fontSize:'0.65rem'}}>Control</span>}
        <PermissionGuard permission="finance-coa.write">
          <button className="btn-sm" onClick={() => onEdit(account)} title="Edit">✏️</button>
        </PermissionGuard>
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
  const { data: departmentCenters = [] } = useGetDepartmentCentersQuery();
  const { data: costCenters = [] } = useGetCostCentersQuery();
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
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <BookOpen size={22} />
          </div>
          <div>
            <h1>Chart of Accounts</h1>
            <p>{accounts.length} total accounts</p>
          </div>
        </div>
        <PermissionGuard permission="finance-coa.write">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm" onClick={() => seedCOA()} title="Seed default accounts">🌱 Seed COA</button>
            <button className="btn-primary" onClick={handleNew}>+ Add Account</button>
          </div>
        </PermissionGuard>
      </div>

      <div className="gl-toolbar">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
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
          departmentCenters={departmentCenters}
          costCenters={costCenters}
          onClose={() => setShowModal(false)}
          onCreate={createAccount}
          onUpdate={updateAccount}
        />
      )}
    </div>
  );
}

function AccountModal({
  account,
  accounts,
  departmentCenters,
  costCenters,
  onClose,
  onCreate,
  onUpdate,
}: {
  account: GlAccount | null;
  accounts: GlAccount[];
  departmentCenters: DepartmentCenter[];
  costCenters: CostCenter[];
  onClose: () => void;
  onCreate: any;
  onUpdate: any;
}) {
  const isEdit = !!account;
  const alertDialog = useAlertDialog();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'asset',
    accountSubtype: account?.accountSubtype || '',
    normalBalance: account?.normalBalance || 'debit',
    parentId: account?.parentId || '',
    departmentCenterId: account?.departmentCenterId || '',
    costCenterId: account?.costCenterId || '',
    isControl: account?.isControl || false,
    description: account?.description || '',
    isActive: account?.isActive ?? true,
  });

  const [showDeptLookup, setShowDeptLookup] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [showCostLookup, setShowCostLookup] = useState(false);
  const [costSearch, setCostSearch] = useState('');

  const selectedDept = departmentCenters.find((d) => d.id === form.departmentCenterId);
  const selectedCost = costCenters.find((c) => c.id === form.costCenterId);

  const filteredDepts = departmentCenters.filter((d) => {
    if (!d.isActive && d.id !== form.departmentCenterId) return false;
    if (deptSearch.trim()) {
      const q = deptSearch.trim().toLowerCase();
      return (
        d.code.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCosts = costCenters.filter((c) => {
    if (!c.isActive && c.id !== form.costCenterId) return false;
    if (form.departmentCenterId && c.departmentCenterId && c.departmentCenterId !== form.departmentCenterId) {
      return false;
    }
    if (costSearch.trim()) {
      const q = costSearch.trim().toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.departmentCenter?.code || '').toLowerCase().includes(q) ||
        (c.departmentCenter?.name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if ((!isEdit && !form.code.trim()) || !form.name.trim()) return;
    try {
      if (isEdit) {
        await onUpdate({
          id: account.id,
          data: {
            name: form.name,
            departmentCenterId: form.departmentCenterId || null,
            costCenterId: form.costCenterId || null,
            accountSubtype: form.accountSubtype || null,
            description: form.description || null,
            isActive: form.isActive,
          },
        }).unwrap();
      } else {
        await onCreate({
          ...form,
          parentId: form.parentId || undefined,
          departmentCenterId: form.departmentCenterId || null,
          costCenterId: form.costCenterId || null,
          accountSubtype: form.accountSubtype || undefined,
        }).unwrap();
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
        <form onSubmit={handleSubmit} noValidate>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Account Code <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !isEdit && !form.code.trim() ? 'gl-input-error' : ''}
                value={form.code}
                onChange={e => setForm({...form, code: e.target.value})}
                disabled={isEdit}
              />
              {hasAttemptedSubmit && !isEdit && !form.code.trim() && (
                <span className="gl-error-text">Account code is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>Account Name <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !form.name.trim() ? 'gl-input-error' : ''}
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
              />
              {hasAttemptedSubmit && !form.name.trim() && (
                <span className="gl-error-text">Account name is required</span>
              )}
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

          {/* Department Center & Cost Center Lookup Row */}
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Department Center</label>
              <div className="coa-input-group">
                <input
                  className="coa-bound-input"
                  placeholder="Select Department Center…"
                  value={selectedDept ? `${selectedDept.code} — ${selectedDept.name}` : ''}
                  readOnly
                  tabIndex={-1}
                  onClick={() => {
                    setDeptSearch('');
                    setShowDeptLookup(true);
                  }}
                />
                {form.departmentCenterId && (
                  <button
                    type="button"
                    className="coa-clear-inline-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ ...form, departmentCenterId: '' });
                    }}
                    title="Clear Department Center"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="coa-lookup-btn"
                  onClick={() => {
                    setDeptSearch('');
                    setShowDeptLookup(true);
                  }}
                  title="Search Department Centers"
                >
                  <Search size={15} />
                </button>
              </div>
            </div>

            <div className="gl-form-group">
              <label>Cost Center</label>
              <div className="coa-input-group">
                <input
                  className="coa-bound-input"
                  placeholder="Select Cost Center…"
                  value={selectedCost ? `${selectedCost.code} — ${selectedCost.name}` : ''}
                  readOnly
                  tabIndex={-1}
                  onClick={() => {
                    setCostSearch('');
                    setShowCostLookup(true);
                  }}
                />
                {form.costCenterId && (
                  <button
                    type="button"
                    className="coa-clear-inline-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ ...form, costCenterId: '' });
                    }}
                    title="Clear Cost Center"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="coa-lookup-btn"
                  onClick={() => {
                    setCostSearch('');
                    setShowCostLookup(true);
                  }}
                  title="Search Cost Centers"
                >
                  <Search size={15} />
                </button>
              </div>
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

      {/* Department Center Lookup Modal */}
      {showDeptLookup &&
        createPortal(
          <div className="modal-overlay coa-lookup-overlay" onClick={() => setShowDeptLookup(false)}>
            <div className="modal-content coa-lookup-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  <GitBranch size={18} /> Select Department Center
                </h2>
                <button type="button" className="modal-close" onClick={() => setShowDeptLookup(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="coa-lookup-toolbar">
                <div className="coa-lookup-search-wrap">
                  <Search size={15} className="coa-lookup-search-icon" />
                  <input
                    type="text"
                    placeholder="Search department center by code or name…"
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    autoFocus
                  />
                  {deptSearch && (
                    <button
                      type="button"
                      className="coa-lookup-clear-btn"
                      onClick={() => setDeptSearch('')}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-body coa-lookup-body">
                {filteredDepts.length === 0 ? (
                  <div className="coa-lookup-empty">
                    No Department Centers found. Create them in Finance &gt; Department Centers.
                  </div>
                ) : (
                  <div className="coa-lookup-list">
                    <table className="billing-table coa-lookup-table">
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>Code</th>
                          <th>Department Center Name</th>
                          <th>Description</th>
                          <th style={{ width: 100 }} className="text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDepts.map((dc) => {
                          const isSelected = form.departmentCenterId === dc.id;
                          return (
                            <tr
                              key={dc.id}
                              className={`coa-lookup-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setForm((f) => ({ ...f, departmentCenterId: dc.id }));
                                setShowDeptLookup(false);
                              }}
                            >
                              <td>
                                <span className="cell-mono">{dc.code}</span>
                              </td>
                              <td>
                                <div className="cell-primary">{dc.name}</div>
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                {dc.description || '—'}
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className={`coa-select-btn ${isSelected ? 'active' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setForm((f) => ({ ...f, departmentCenterId: dc.id }));
                                    setShowDeptLookup(false);
                                  }}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check size={13} /> Selected
                                    </>
                                  ) : (
                                    'Select'
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
                  Showing {filteredDepts.length} of {departmentCenters.length} department centers
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeptLookup(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Cost Center Lookup Modal */}
      {showCostLookup &&
        createPortal(
          <div className="modal-overlay coa-lookup-overlay" onClick={() => setShowCostLookup(false)}>
            <div className="modal-content coa-lookup-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  <Layers size={18} /> Select Cost Center
                </h2>
                <button type="button" className="modal-close" onClick={() => setShowCostLookup(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="coa-lookup-toolbar">
                <div className="coa-lookup-search-wrap">
                  <Search size={15} className="coa-lookup-search-icon" />
                  <input
                    type="text"
                    placeholder="Search cost center by code or name…"
                    value={costSearch}
                    onChange={(e) => setCostSearch(e.target.value)}
                    autoFocus
                  />
                  {costSearch && (
                    <button
                      type="button"
                      className="coa-lookup-clear-btn"
                      onClick={() => setCostSearch('')}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="modal-body coa-lookup-body">
                {filteredCosts.length === 0 ? (
                  <div className="coa-lookup-empty">
                    No Cost Centers found. Create them in Finance &gt; Cost Centers.
                  </div>
                ) : (
                  <div className="coa-lookup-list">
                    <table className="billing-table coa-lookup-table">
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>Code</th>
                          <th>Cost Center Name</th>
                          <th>Department Center</th>
                          <th style={{ width: 100 }} className="text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCosts.map((cc) => {
                          const isSelected = form.costCenterId === cc.id;
                          return (
                            <tr
                              key={cc.id}
                              className={`coa-lookup-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  costCenterId: cc.id,
                                  departmentCenterId: f.departmentCenterId || cc.departmentCenterId || '',
                                }));
                                setShowCostLookup(false);
                              }}
                            >
                              <td>
                                <span className="cell-mono">{cc.code}</span>
                              </td>
                              <td>
                                <div className="cell-primary">{cc.name}</div>
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                {cc.departmentCenter
                                  ? `${cc.departmentCenter.code} — ${cc.departmentCenter.name}`
                                  : '—'}
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className={`coa-select-btn ${isSelected ? 'active' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setForm((f) => ({
                                      ...f,
                                      costCenterId: cc.id,
                                      departmentCenterId: f.departmentCenterId || cc.departmentCenterId || '',
                                    }));
                                    setShowCostLookup(false);
                                  }}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check size={13} /> Selected
                                    </>
                                  ) : (
                                    'Select'
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
                  Showing {filteredCosts.length} of {costCenters.length} cost centers
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCostLookup(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
