import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetCamPoolsQuery, useCreateCamPoolMutation, useUpdateCamPoolMutation,
  useGetCamBillingsQuery, useGetCamReconciliationsQuery,
  useGenerateCamBillingMutation, useRunCamReconciliationMutation,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Plus, BarChart3, Zap, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const POOL_TYPES = ['controllable', 'uncontrollable', 'capital'];
const ALLOC_BASIS = ['gla', 'equal', 'zone', 'custom'];
const TABS = ['Pools', 'Billing', 'Reconciliation'];

export default function CamManagementPage() {
  
  const propertyId = useSelectedPropertyId();

  const [activeTab, setActiveTab] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState<any>({
    name: '', poolType: 'controllable', allocationBasis: 'gla',
    costCategories: '', year: new Date().getFullYear(), budgetedAmount: 0,
  });
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genLoading, setGenLoading] = useState(false);
  const [reconLoading, setReconLoading] = useState(false);

  const { data: poolsData, isLoading: loadingPools } = useGetCamPoolsQuery(
    { propertyId, year },
    { skip: !propertyId }
  );
  const { data: billingsData } = useGetCamBillingsQuery(
    { propertyId, year },
    { skip: !propertyId || activeTab !== 1 }
  );
  const { data: reconData } = useGetCamReconciliationsQuery(
    { propertyId, year },
    { skip: !propertyId || activeTab !== 2 }
  );

  const [createPool] = useCreateCamPoolMutation();
  const [generateCamBilling] = useGenerateCamBillingMutation();
  const [runCamReconciliation] = useRunCamReconciliationMutation();

  const pools = poolsData?.data || [];
  const billings = billingsData?.data || [];
  const reconciliations = reconData?.data || [];

  const handleCreate = async () => {
    try {
      await createPool({
        propertyId,
        ...formData,
        costCategories: formData.costCategories.split(',').map((s: string) => s.trim()).filter(Boolean),
        budgetedAmount: Number(formData.budgetedAmount),
      }).unwrap();
      setShowCreate(false);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="page-content">
      <div className="mall-page-header">
        <div>
          <h1>CAM Management</h1>
          <p className="mall-page-subtitle">Common Area Maintenance cost pools, billing, and reconciliation</p>
        </div>
        <div className="mall-header-actions">
          <select className="mall-filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {activeTab === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} style={{ marginRight: 4 }} />New Pool
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mall-tabs">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`mall-tab ${activeTab === i ? 'mall-tab-active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 0 && (
        <div className="mall-cam-pool-grid">
          {loadingPools ? (
            <div className="module-skeleton-grid">
              {[1,2,3].map(i => <div key={i} className="module-skeleton-card module-skeleton-tall" />)}
            </div>
          ) : pools.length > 0 ? (
            pools.map((pool: any) => {
              const utilization = pool.budgetedAmount > 0
                ? (Number(pool.actualAmount) / Number(pool.budgetedAmount)) * 100
                : 0;
              return (
                <div key={pool.id} className="mall-cam-pool-card">
                  <div className="mall-cam-pool-header">
                    <h4>{pool.name}</h4>
                    <span className={`mall-pool-type mall-pool-${pool.poolType}`}>
                      {pool.poolType}
                    </span>
                  </div>
                  <div className="mall-cam-pool-body">
                    <div className="mall-cam-stat">
                      <span>Budget</span>
                      <strong>${Number(pool.budgetedAmount).toLocaleString()}</strong>
                    </div>
                    <div className="mall-cam-stat">
                      <span>Actual</span>
                      <strong>${Number(pool.actualAmount).toLocaleString()}</strong>
                    </div>
                    <div className="mall-cam-stat">
                      <span>Variance</span>
                      <strong className={utilization > 100 ? 'text-danger' : 'text-success'}>
                        {(utilization - 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div className="mall-progress-bar" style={{ marginTop: 8 }}>
                      <div
                        className="mall-progress-fill"
                        style={{
                          width: `${Math.min(utilization, 100)}%`,
                          background: utilization > 100 ? '#ef4444' : utilization > 80 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  </div>
                  <div className="mall-cam-pool-footer">
                    <span>Allocation: {pool.allocationBasis}</span>
                    <span>{pool._count?.billings || 0} billings</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mall-empty-state">
              <BarChart3 size={40} strokeWidth={1} />
              <h3>No CAM Pools</h3>
              <p>Create a cost pool to start tracking CAM expenses</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Month:
              <select value={genMonth} onChange={e => setGenMonth(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, var(--border))', background: 'var(--card-bg, var(--surface))', color: 'var(--text-primary)' }}>
                {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{new Date(2025, i).toLocaleString('default', {month:'long'})}</option>)}
              </select>
            </label>
            <button
              className="btn btn-primary"
              disabled={genLoading || !propertyId}
              onClick={async () => {
                setGenLoading(true);
                try {
                  const res = await generateCamBilling({ propertyId, month: genMonth, year }).unwrap();
                  toast.success(`Generated ${res.data.generated} billing records for ${res.data.pools} pools × ${res.data.units} units`);
                } catch (e: any) {
                  toast.error(e?.data?.errors?.[0]?.message || 'Failed to generate');
                }
                setGenLoading(false);
              }}
            >
              <Zap size={14} /> {genLoading ? 'Generating...' : 'Generate Billing'}
            </button>
          </div>
          <div className="mall-table-wrap">
          <table className="mall-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Month</th>
                <th className="text-right">GLA</th>
                <th className="text-right">Allocation %</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {billings.map((b: any) => (
                <tr key={b.id}>
                  <td>{b.pool?.name}</td>
                  <td>{b.unit?.unitNumber}</td>
                  <td>{b.tenant?.companyName}</td>
                  <td>{b.billingMonth}/{b.billingYear}</td>
                  <td className="text-right">{Number(b.unitGlaSqft).toLocaleString()}</td>
                  <td className="text-right">{(Number(b.allocationPct) * 100).toFixed(2)}%</td>
                  <td className="text-right">${Number(b.allocatedAmount).toLocaleString()}</td>
                  <td>
                    <span className={`mall-status-badge mall-status-${b.status}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
              {billings.length === 0 && (
                <tr><td colSpan={8} className="mall-table-empty">No billings for this period</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              disabled={reconLoading || !propertyId}
              onClick={async () => {
                setReconLoading(true);
                try {
                  const res = await runCamReconciliation({ propertyId, year }).unwrap();
                  toast.success(`Reconciliation complete: ${res.data.reconciliations} records, total variance: $${Number(res.data.totalVariance).toLocaleString()}`);
                } catch (e: any) {
                  toast.error(e?.data?.errors?.[0]?.message || 'Failed to run reconciliation');
                }
                setReconLoading(false);
              }}
            >
              <RefreshCw size={14} /> {reconLoading ? 'Running...' : `Run ${year} Reconciliation`}
            </button>
          </div>
          <div className="mall-table-wrap">
          <table className="mall-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Unit</th>
                <th>Tenant</th>
                <th className="text-right">Estimated</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.pool?.name}</td>
                  <td>{r.unit?.unitNumber}</td>
                  <td>{r.tenant?.companyName}</td>
                  <td className="text-right">${Number(r.totalEstimated).toLocaleString()}</td>
                  <td className="text-right">${Number(r.totalActual).toLocaleString()}</td>
                  <td className={`text-right ${Number(r.variance) > 0 ? 'text-danger' : 'text-success'}`}>
                    ${Number(r.variance).toLocaleString()}
                  </td>
                  <td>{Number(r.variance) > 0 ? 'Debit Note' : 'Credit Note'}</td>
                  <td>
                    <span className={`mall-status-badge mall-status-${r.status}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {reconciliations.length === 0 && (
                <tr><td colSpan={8} className="mall-table-empty">No reconciliations for this year</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Create Pool Modal */}
      {showCreate && createPortal(
        <div className="mall-modal-overlay">
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Create CAM Pool</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label>Pool Name
                  <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Controllable CAM" />
                </label>
                <label>Pool Type
                  <select value={formData.poolType} onChange={e => setFormData({ ...formData, poolType: e.target.value })}>
                    {POOL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>Allocation Basis
                  <select value={formData.allocationBasis} onChange={e => setFormData({ ...formData, allocationBasis: e.target.value })}>
                    {ALLOC_BASIS.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
                  </select>
                </label>
                <label>Year
                  <input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: Number(e.target.value) })} />
                </label>
                <label>Budget Amount
                  <input type="number" value={formData.budgetedAmount} onChange={e => setFormData({ ...formData, budgetedAmount: e.target.value })} />
                </label>
                <label>Cost Categories (comma-separated)
                  <input value={formData.costCategories} onChange={e => setFormData({ ...formData, costCategories: e.target.value })} placeholder="cleaning, security, utilities" />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create Pool</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
