import { TableSkeleton } from './common/SkeletonLoaders';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, BookOpen, Check } from 'lucide-react';
import { useGetGlAccountsQuery, type GlAccount } from '../store/api/glApi';
import { useSelectedPropertyId } from '../hooks/useSelectedPropertyId';
import '../pages/admin/BillingPage/BillingPage.css';
import './GlAccountLookupField.css';

interface GlAccountLookupFieldProps {
  label?: string;
  value: string;
  onChange: (code: string) => void;
  wrapperClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  propertyId?: string;
}

export default function GlAccountLookupField({
  label = 'GL Account Code',
  value,
  onChange,
  wrapperClassName = 'form-field',
  disabled = false,
  placeholder = 'Select from Chart of Accountsâ€¦',
  propertyId: propPropertyId,
}: GlAccountLookupFieldProps) {
  const selectedPropertyId = useSelectedPropertyId();
  const effectivePropertyId = propPropertyId || selectedPropertyId || undefined;
  const { data: glAccounts = [], isLoading: loadingGlAccounts } = useGetGlAccountsQuery(
    effectivePropertyId ? { propertyId: effectivePropertyId } : {},
  );

  const [showCoaModal, setShowCoaModal] = useState(false);
  const [coaSearch, setCoaSearch] = useState('');
  const [coaTypeFilter, setCoaTypeFilter] = useState('');

  const filteredGlAccounts = glAccounts.filter((acc) => {
    if (!acc.isActive) return false;
    if (coaTypeFilter && acc.accountType !== coaTypeFilter) return false;
    if (coaSearch.trim()) {
      const q = coaSearch.trim().toLowerCase();
      return (
        acc.code.toLowerCase().includes(q) ||
        acc.name.toLowerCase().includes(q) ||
        acc.accountType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedGlAccount = glAccounts.find(
    (acc) => acc.code.toLowerCase() === (value || '').trim().toLowerCase()
  );

  const openModal = () => {
    if (disabled) return;
    setCoaSearch('');
    setCoaTypeFilter('');
    setShowCoaModal(true);
  };

  return (
    <div className={wrapperClassName}>
      <label>{label}</label>
      <div className="coa-input-group">
        <input
          className="coa-bound-input"
          placeholder={placeholder}
          value={value}
          readOnly
          disabled={disabled}
          tabIndex={-1}
          onClick={openModal}
        />
        {value && !disabled && (
          <button
            type="button"
            className="coa-clear-inline-btn"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            title="Clear GL Account Code"
            aria-label="Clear GL Account Code"
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className="coa-lookup-btn"
          disabled={disabled}
          onClick={openModal}
          title="Search Chart of Accounts"
          aria-label="Search Chart of Accounts"
        >
          <Search size={15} />
        </button>
      </div>
      {selectedGlAccount && (
        <span className="coa-selected-hint">
          {selectedGlAccount.name} ({selectedGlAccount.accountType})
        </span>
      )}

      {/* Chart of Accounts Lookup Modal â€” identical to ChargeTypesPage */}
      {showCoaModal &&
        createPortal(
          <div className="modal-overlay coa-lookup-overlay" onClick={() => setShowCoaModal(false)}>
            <div className="modal-content coa-lookup-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  <BookOpen size={18} /> Chart of Accounts
                </h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowCoaModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="coa-lookup-toolbar">
                <div className="coa-lookup-search-wrap">
                  <Search size={15} className="coa-lookup-search-icon" />
                  <input
                    type="text"
                    placeholder="Search by account code or nameâ€¦"
                    value={coaSearch}
                    onChange={(e) => setCoaSearch(e.target.value)}
                    autoFocus
                  />
                  {coaSearch && (
                    <button
                      type="button"
                      className="coa-lookup-clear-btn"
                      onClick={() => setCoaSearch('')}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  className="coa-lookup-type-select"
                  value={coaTypeFilter}
                  onChange={(e) => setCoaTypeFilter(e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              <div className="modal-body coa-lookup-body">
                {loadingGlAccounts ? (
                  <TableSkeleton columns={4} rows={4} />
                ) : filteredGlAccounts.length === 0 ? (
                  <div className="coa-lookup-empty">
                    No GL accounts found matching your search.
                  </div>
                ) : (
                  <div className="coa-lookup-list">
                    <table className="billing-table coa-lookup-table">
                      <thead>
                        <tr>
                          <th style={{ width: 110 }}>Code</th>
                          <th>Account Name</th>
                          <th style={{ width: 110 }}>Department</th>
                          <th style={{ width: 110 }}>Cost Center</th>
                          <th style={{ width: 110 }}>Type</th>
                          <th style={{ width: 100 }} className="text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGlAccounts.map((acc: GlAccount) => {
                          const isSelected = (value || '').trim() === acc.code;
                          return (
                            <tr
                              key={acc.id}
                              className={`coa-lookup-row ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                onChange(acc.code);
                                setShowCoaModal(false);
                              }}
                            >
                              <td>
                                <span className="cell-mono">{acc.code}</span>
                              </td>
                              <td>
                                <div className="cell-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span>{acc.name}</span>
                                  {acc.isControl && (
                                    <span className="coa-control-tag">Control</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className="cell-mono" style={{ fontSize: 12, color: acc.departmentCenter?.code ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                  {acc.departmentCenter?.code || 'â€”'}
                                </span>
                              </td>
                              <td>
                                <span className="cell-mono" style={{ fontSize: 12, color: acc.costCenter?.code ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                  {acc.costCenter?.code || 'â€”'}
                                </span>
                              </td>
                              <td>
                                <span className={`coa-type-badge ${acc.accountType}`}>
                                  {acc.accountType}
                                </span>
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className={`coa-select-btn ${isSelected ? 'active' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(acc.code);
                                    setShowCoaModal(false);
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
                  Showing {filteredGlAccounts.length} of {glAccounts.length} accounts
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCoaModal(false)}
                >
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
