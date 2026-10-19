import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Search, X, Check, GitBranch, Layers, Pencil } from 'lucide-react';
import {
  useGetGlAccountsQuery,
  useCreateGlAccountMutation,
  useUpdateGlAccountMutation,
  useGetDepartmentCentersQuery,
  useGetCostCentersQuery,
} from '../../../store/api/glApi';
import type { GlAccount, DepartmentCenter, CostCenter } from '../../../store/api/glApi';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import '../BillingPage/BillingPage.css';
import '../../../components/GlAccountLookupField.css';
import './GLPage.css';

const ACCOUNT_TYPE_GROUPS = [
  {
    group: '1',
    label: 'Assets',
    defaultAccountType: 'asset',
    defaultNormalBalance: 'debit',
    subtypes: [
      { value: 'Non-Current Assets', accountType: 'asset', normalBalance: 'debit' },
      { value: 'Accumulated Depreciation', accountType: 'asset', normalBalance: 'credit' },
      { value: 'Current Assets', accountType: 'asset', normalBalance: 'debit' },
      { value: 'Other Accounts Receivable', accountType: 'asset', normalBalance: 'debit' },
      { value: 'Other Assets', accountType: 'asset', normalBalance: 'debit' },
    ],
  },
  {
    group: '2',
    label: 'Liabilities',
    defaultAccountType: 'liability',
    defaultNormalBalance: 'credit',
    subtypes: [
      { value: 'Non-Current Liabilities', accountType: 'liability', normalBalance: 'credit' },
      { value: 'Current Liabilities', accountType: 'liability', normalBalance: 'credit' },
      { value: 'Other Accounts Payable', accountType: 'liability', normalBalance: 'credit' },
    ],
  },
  {
    group: '3',
    label: 'Equity',
    defaultAccountType: 'equity',
    defaultNormalBalance: 'credit',
    subtypes: [
      { value: 'Capital', accountType: 'equity', normalBalance: 'credit' },
      { value: 'Reserve', accountType: 'equity', normalBalance: 'credit' },
      { value: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit' },
      { value: 'Net Profit', accountType: 'equity', normalBalance: 'credit' },
    ],
  },
  {
    group: '4',
    label: 'Revenue',
    defaultAccountType: 'income',
    defaultNormalBalance: 'credit',
    subtypes: [
      { value: 'Sales', accountType: 'income', normalBalance: 'credit' },
      { value: 'Other Revenue', accountType: 'income', normalBalance: 'credit' },
    ],
  },
  {
    group: '5',
    label: 'Cost of Sales',
    defaultAccountType: 'expense',
    defaultNormalBalance: 'debit',
    subtypes: [
      { value: 'Opening Stocks', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Purchase', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Carriage Inwards', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Closing Stocks', accountType: 'expense', normalBalance: 'credit' },
      { value: 'Cost of Sales', accountType: 'expense', normalBalance: 'debit' },
    ],
  },
  {
    group: '6',
    label: 'Other Income & Tax',
    defaultAccountType: 'income',
    defaultNormalBalance: 'credit',
    subtypes: [
      { value: 'Income & Expenses', accountType: 'income', normalBalance: 'credit' },
      { value: 'Income Tax', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Other Comprehensive Income', accountType: 'income', normalBalance: 'credit' },
    ],
  },
  {
    group: '7',
    label: 'Expenses',
    defaultAccountType: 'expense',
    defaultNormalBalance: 'debit',
    subtypes: [
      { value: 'Cost & Expenses', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Direct Expenses', accountType: 'expense', normalBalance: 'debit' },
      { value: 'Overheads', accountType: 'expense', normalBalance: 'debit' },
    ],
  },
] as const;

const LEGACY_SUBTYPE_MAP: Record<string, string> = {
  current_asset: 'Current Assets',
  fixed_asset: 'Non-Current Assets',
  current_liability: 'Current Liabilities',
  capital: 'Capital',
  retained_earnings: 'Retained Earnings',
  revenue: 'Sales',
  other_income: 'Other Revenue',
  operating: 'Overheads',
};

function normalizeSubtype(raw?: string | null): string {
  if (!raw) return '';
  return LEGACY_SUBTYPE_MAP[raw] || raw;
}

function resolveGroupForAccount(accountType?: string, accountSubtype?: string | null): string {
  const normSub = normalizeSubtype(accountSubtype);
  if (normSub) {
    const matched = ACCOUNT_TYPE_GROUPS.find((g) => g.subtypes.some((s) => s.value === normSub));
    if (matched) return matched.group;
  }
  switch (accountType) {
    case 'asset':
      return '1';
    case 'liability':
      return '2';
    case 'equity':
      return '3';
    case 'income':
      return '4';
    case 'expense':
      return '7';
    default:
      return '1';
  }
}

function getGroupLabel(accountType?: string, accountSubtype?: string | null): string {
  const grp = resolveGroupForAccount(accountType, accountSubtype);
  return ACCOUNT_TYPE_GROUPS.find((g) => g.group === grp)?.label || accountType || '';
}

function matchesAccountSearch(account: GlAccount, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const normSub = normalizeSubtype(account.accountSubtype).toLowerCase();
  const groupLabel = getGroupLabel(account.accountType, account.accountSubtype).toLowerCase();
  const deptCode = (account.departmentCenter?.code || '').toLowerCase();
  const deptName = (account.departmentCenter?.name || '').toLowerCase();
  const ccCode = (account.costCenter?.code || '').toLowerCase();
  const ccName = (account.costCenter?.name || '').toLowerCase();
  return (
    account.code.toLowerCase().includes(q) ||
    account.name.toLowerCase().includes(q) ||
    (account.description || '').toLowerCase().includes(q) ||
    normSub.includes(q) ||
    groupLabel.includes(q) ||
    deptCode.includes(q) ||
    deptName.includes(q) ||
    `${deptCode} ${deptName}`.includes(q) ||
    ccCode.includes(q) ||
    ccName.includes(q) ||
    `${ccCode} ${ccName}`.includes(q)
  );
}

function matchesGroupOrDescendants(
  account: GlAccount,
  accounts: GlAccount[],
  filterGroup: string,
  searchQuery = '',
  visited = new Set<string>(),
): boolean {
  const groupOk = !filterGroup || resolveGroupForAccount(account.accountType, account.accountSubtype) === filterGroup;
  const searchOk = matchesAccountSearch(account, searchQuery);
  if (groupOk && searchOk) return true;
  if (visited.has(account.id)) return false;
  const nextVisited = new Set(visited);
  nextVisited.add(account.id);
  const children = accounts.filter((a) => a.parentId === account.id && a.id !== account.id);
  return children.some((c) => matchesGroupOrDescendants(c, accounts, filterGroup, searchQuery, nextVisited));
}

function AccountNode({
  account,
  accounts,
  filterGroup,
  searchQuery,
  onEdit,
  ancestors = new Set<string>(),
}: {
  account: GlAccount;
  accounts: GlAccount[];
  filterGroup: string;
  searchQuery: string;
  onEdit: (a: GlAccount) => void;
  ancestors?: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(account.id);
  const allChildren = accounts.filter(a => a.parentId === account.id && !nextAncestors.has(a.id));
  const hasFilters = Boolean(filterGroup || searchQuery.trim());
  const children = hasFilters
    ? allChildren.filter(c => matchesGroupOrDescendants(c, accounts, filterGroup, searchQuery, nextAncestors))
    : allChildren;
  const isExpanded = searchQuery.trim() ? true : open;
  const normSubtype = normalizeSubtype(account.accountSubtype);
  const groupLabel = getGroupLabel(account.accountType, account.accountSubtype);

  return (
    <li>
      <div className="coa-node">
        {children.length > 0
          ? <span className="coa-toggle" onClick={() => setOpen(!open)}>{isExpanded ? '▾' : '▸'}</span>
          : <span className="coa-toggle" />}
        <span className="coa-code">{account.code}</span>
        <span className="coa-name">{account.name}</span>
        {account.departmentCenter && (
          <span
            className="gl-badge"
            title={`Department: ${account.departmentCenter.code} — ${account.departmentCenter.name}`}
            style={{
              fontSize: '0.68rem',
              background: 'rgba(139, 92, 246, 0.14)',
              color: '#a78bfa',
              textTransform: 'none',
            }}
          >
            DEPT: {account.departmentCenter.code}
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
        {normSubtype && (
          <span
            className="gl-badge"
            style={{
              fontSize: '0.68rem',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-secondary)',
              textTransform: 'none',
            }}
          >
            {normSubtype}
          </span>
        )}
        <span className={`gl-type-chip ${account.accountType}`} style={{ textTransform: 'none' }}>
          {groupLabel}
        </span>
        {account.isControl && <span className="gl-badge closed" style={{fontSize:'0.65rem'}}>Control</span>}
        <PermissionGuard permission="finance-coa.write">
          <button className="btn-icon" onClick={() => onEdit(account)} title="Edit">
            <Pencil size={14} />
          </button>
        </PermissionGuard>
      </div>
      {isExpanded && children.length > 0 && (
        <ul className="coa-children">
          {children.map(c => (
            <AccountNode
              key={c.id}
              account={c}
              accounts={accounts}
              filterGroup={filterGroup}
              searchQuery={searchQuery}
              onEdit={onEdit}
              ancestors={nextAncestors}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ChartOfAccountsPage() {
  const { data: accounts = [], isLoading } = useGetGlAccountsQuery({});
  const { data: departmentCenters = [] } = useGetDepartmentCentersQuery();
  const { data: costCenters = [] } = useGetCostCentersQuery();
  const [createAccount] = useCreateGlAccountMutation();
  const [updateAccount] = useUpdateGlAccountMutation();
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<GlAccount | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const accountIdSet = new Set(accounts.map(a => a.id));
  const rootAccounts = accounts.filter(a => !a.parentId || a.parentId === a.id || !accountIdSet.has(a.parentId));
  const hasFilters = Boolean(filterType || search.trim());
  const filtered = hasFilters
    ? rootAccounts.filter(a => matchesGroupOrDescendants(a, accounts, filterType, search))
    : rootAccounts;

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
            <button className="btn-primary" onClick={handleNew}>+ Add Account</button>
          </div>
        </PermissionGuard>
      </div>

      <div className="gl-toolbar">
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search code, name, subtype, department, cost center…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 34, paddingRight: search ? 30 : 12, boxSizing: 'border-box' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPE_GROUPS.map((g) => (
            <option key={g.group} value={g.group}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-card">
          <ul className="coa-tree">
            {filtered.map(a => (
              <AccountNode
                key={a.id}
                account={a}
                accounts={accounts}
                filterGroup={filterType}
                searchQuery={search}
                onEdit={handleEdit}
              />
            ))}
          </ul>
          {filtered.length === 0 && (
            <p style={{padding:20,textAlign:'center',color:'var(--text-muted)'}}>
              {hasFilters
                ? 'No accounts match your search or filter criteria.'
                : 'No accounts found. Click "+ Add Account" to create a new account.'}
            </p>
          )}
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

  const initialGroup = resolveGroupForAccount(account?.accountType, account?.accountSubtype);
  const initialSubtype =
    normalizeSubtype(account?.accountSubtype) ||
    (!isEdit ? ACCOUNT_TYPE_GROUPS[0].subtypes[0].value : '');

  const [typeGroup, setTypeGroup] = useState<string>(initialGroup);
  const [form, setForm] = useState({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'asset',
    accountSubtype: initialSubtype,
    normalBalance: account?.normalBalance || 'debit',
    parentId: account?.parentId || '',
    departmentCenterId: account?.departmentCenterId || '',
    costCenterId: account?.costCenterId || '',
    isControl: account?.isControl || false,
    description: account?.description || '',
    isActive: account?.isActive ?? true,
  });

  const currentGroupObj =
    ACCOUNT_TYPE_GROUPS.find((g) => g.group === typeGroup) || ACCOUNT_TYPE_GROUPS[0];

  const handleGroupChange = (nextGroup: string) => {
    setTypeGroup(nextGroup);
    const grp = ACCOUNT_TYPE_GROUPS.find((g) => g.group === nextGroup);
    if (!grp) return;
    const firstSubtype = grp.subtypes[0];
    setForm((prev) => ({
      ...prev,
      accountType: firstSubtype ? firstSubtype.accountType : grp.defaultAccountType,
      accountSubtype: firstSubtype ? firstSubtype.value : '',
      normalBalance: firstSubtype ? firstSubtype.normalBalance : grp.defaultNormalBalance,
    }));
  };

  const handleSubtypeChange = (nextSubtype: string) => {
    const subDef = currentGroupObj.subtypes.find((s) => s.value === nextSubtype);
    setForm((prev) => ({
      ...prev,
      accountSubtype: nextSubtype,
      accountType: !isEdit && subDef ? subDef.accountType : prev.accountType,
      normalBalance: subDef ? subDef.normalBalance : prev.normalBalance,
    }));
  };

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
    if (costSearch.trim()) {
      const q = costSearch.trim().toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
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
              <select
                value={typeGroup}
                onChange={e => handleGroupChange(e.target.value)}
                disabled={isEdit}
              >
                {ACCOUNT_TYPE_GROUPS.map((g) => (
                  <option key={g.group} value={g.group}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="gl-form-group">
              <label>Subtype</label>
              <select
                value={form.accountSubtype}
                onChange={e => handleSubtypeChange(e.target.value)}
              >
                {isEdit && !form.accountSubtype && (
                  <option value="">— Select Subtype —</option>
                )}
                {currentGroupObj.subtypes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Normal Balance</label>
              <select value={form.normalBalance} onChange={e => setForm({...form, normalBalance: e.target.value})} disabled={isEdit}>
                <option value="debit">Debit</option><option value="credit">Credit</option>
              </select>
            </div>
            <div className="gl-form-group">
              <label>Parent Account</label>
              <select value={form.parentId} onChange={e => setForm({...form, parentId: e.target.value})} disabled={isEdit}>
                <option value="">— None (Root) —</option>
                {accounts.filter((a: GlAccount) => !a.parentId).map((a: GlAccount) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Department & Cost Center Lookup Row */}
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Department</label>
              <div className="coa-input-group">
                <input
                  className="coa-bound-input"
                  placeholder="Select Department…"
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
                    title="Clear Department"
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
                  title="Search Departments"
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

      {/* Department Lookup Modal */}
      {showDeptLookup &&
        createPortal(
          <div className="modal-overlay coa-lookup-overlay" onClick={() => setShowDeptLookup(false)}>
            <div className="modal-content coa-lookup-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  <GitBranch size={18} /> Select Department
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
                    placeholder="Search department by code or name…"
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
                    No Departments found. Create them in Finance &gt; Department.
                  </div>
                ) : (
                  <div className="coa-lookup-list">
                    <table className="billing-table coa-lookup-table">
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>Code</th>
                          <th>Department Name</th>
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
                  Showing {filteredDepts.length} of {departmentCenters.length} departments
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
                          <th>Description</th>
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
                                {cc.description || '—'}
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
