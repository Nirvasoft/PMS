import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetInvoicesQuery,
  useGetBillingDashboardSummaryQuery,
  useRunBillingMutation,
} from '../../../store/api/billingApi';
import { useGetCronJobsQuery } from '../../../store/api/integrationsApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  LayoutDashboard, FileText, AlertTriangle, Clock, DollarSign,
  Play, ArrowRight, TrendingUp, Receipt, CalendarClock, CheckCircle,
  Settings, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import './BillingPage.css';

const formatCurrency = (amount: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      currencyDisplay: 'code',
      maximumFractionDigits: currency === 'MMK' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${Number(amount).toLocaleString()}`;
  }
};

function getHumanSchedule(expr: string, tz: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, mon, dow] = parts;
    if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Every minute';
    }
    if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.replace('*/', '')} minutes`;
    }
    if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Hourly at :00';
    }
    if (!isNaN(Number(min)) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Hourly at :${min.padStart(2, '0')}`;
    }
    if (hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${hour.replace('*/', '')} hours at :${min.padStart(2, '0')}`;
    }
    if (!isNaN(Number(min)) && !isNaN(Number(hour)) && dom === '*' && mon === '*' && dow === '*') {
      const h = Number(hour);
      const m = Number(min);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `Runs daily at ${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
    if (!isNaN(Number(min)) && !isNaN(Number(hour)) && !isNaN(Number(dom)) && mon === '*' && dow === '*') {
      const h = Number(hour);
      const m = Number(min);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `Runs monthly on Day ${dom} at ${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }
  return `Runs on schedule: ${expr} (${tz})`;
}

function calculateNextRun(cronExpr: string, isEnabled: boolean, now: Date = new Date()): string {
  if (!isEnabled) {
    return 'Job is paused';
  }
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [minStr, hourStr, domStr, monStr, dowStr] = parts;
    // 1. Daily: "min hour * * *"
    if (!isNaN(Number(minStr)) && !isNaN(Number(hourStr)) && domStr === '*' && monStr === '*' && dowStr === '*') {
      const min = Number(minStr);
      const hour = Number(hourStr);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return format(target, 'MMM d, yyyy HH:mm');
    }
    // 2. Interval: "*/X * * * *"
    if (minStr.startsWith('*/') && hourStr === '*' && domStr === '*' && monStr === '*' && dowStr === '*') {
      const step = Number(minStr.replace('*/', '')) || 15;
      const currentMin = now.getMinutes();
      const nextMin = Math.floor(currentMin / step) * step + step;
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
      target.setMinutes(nextMin);
      return format(target, 'MMM d, yyyy HH:mm');
    }
    // 3. Hourly: "min * * * *"
    if (!isNaN(Number(minStr)) && hourStr === '*' && domStr === '*' && monStr === '*' && dowStr === '*') {
      const min = Number(minStr);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), min, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setHours(target.getHours() + 1);
      }
      return format(target, 'MMM d, yyyy HH:mm');
    }
    // 4. Monthly: "min hour dom * *"
    if (!isNaN(Number(minStr)) && !isNaN(Number(hourStr)) && !isNaN(Number(domStr)) && monStr === '*' && dowStr === '*') {
      const min = Number(minStr);
      const hour = Number(hourStr);
      const dom = Number(domStr);
      let target = new Date(now.getFullYear(), now.getMonth(), dom, hour, min, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getFullYear(), now.getMonth() + 1, dom, hour, min, 0, 0);
      }
      return format(target, 'MMM d, yyyy HH:mm');
    }
  }
  return 'Scheduled';
}

export default function BillingDashboardPage() {
  const navigate = useNavigate();

  // Fetch summary & recent invoices — scoped to the sidebar's Active Property when one is chosen.
  const activePropertyFilter = useSelectedPropertyFilter();
  const propertyIdParam = activePropertyFilter || undefined;

  const { data: summaryData, isFetching: isFetchingSummary } = useGetBillingDashboardSummaryQuery(
    propertyIdParam ? { propertyId: propertyIdParam } : undefined,
  );
  const { data: allData, isFetching: isFetchingInvoices } = useGetInvoicesQuery({
    propertyId: propertyIdParam,
    page: 1,
    limit: 10,
  });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();
  const { data: cronJobsRes, refetch: refetchCronJobs } = useGetCronJobsQuery();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const billingJob = useMemo(() => {
    const list = cronJobsRes?.data;
    if (!Array.isArray(list)) return null;
    return list.find((j: any) => j.jobKey === 'billing.daily') || null;
  }, [cronJobsRes]);

  const isFetching = isFetchingInvoices || isFetchingSummary;
  const summary = summaryData?.data;
  const currencyCode = summary?.currency || 'USD';

  const stats = useMemo(() => ({
    issuedToday: summary?.issuedToday ?? 0,
    dueThisWeek: summary?.dueThisWeek ?? 0,
    overdueCount: summary?.overdueCount ?? 0,
    totalOverdue: summary?.totalOverdue ?? 0,
    mtdRevenue: summary?.mtdRevenue ?? 0,
  }), [summary]);

  const recentInvoices = allData?.data || [];

  const handleRunBilling = async () => {
    if (!(await confirmDialog('This will generate invoices for all due billing schedules. Continue?'))) return;
    try {
      const result = await runBilling().unwrap();
      alertDialog(`Generated ${result.data.generated} invoices from ${result.data.processed} schedules.${result.data.errors.length > 0 ? '\n\nErrors:\n' + result.data.errors.join('\n') : ''}`);
      refetchCronJobs();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to run billing');
    }
  };

  const getTenantName = (inv: any) => {
    if (!inv.tenant) return '—';
    return inv.tenant.tenantType !== 'individual'
      ? inv.tenant.companyName || ''
      : inv.tenant.lastName || inv.tenant.firstName || '';
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <LayoutDashboard size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Billing Dashboard</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>Overview of billing activity and outstanding invoices</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="billing-summary-cards">
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <FileText size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Issued Today</span>
            <span className="bsc-value">{stats.issuedToday}</span>
            <span className="bsc-sub">Invoices generated</span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <AlertTriangle size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Overdue</span>
            <span className="bsc-value" style={{ color: stats.overdueCount > 0 ? '#f87171' : undefined }}>{stats.overdueCount}</span>
            <span className="bsc-sub" style={{ color: stats.totalOverdue > 0 ? '#f87171' : undefined }}>
              {formatCurrency(stats.totalOverdue, currencyCode)} outstanding
            </span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
            <Clock size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Due This Week</span>
            <span className="bsc-value">{stats.dueThisWeek}</span>
            <span className="bsc-sub">Upcoming payments</span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <TrendingUp size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">MTD Revenue</span>
            <span className="bsc-value">{formatCurrency(stats.mtdRevenue, currencyCode)}</span>
            <span className="bsc-sub">Month-to-date collected</span>
          </div>
        </div>
      </div>

      {/* Scheduled Job Status (Dynamic from Cron Engine) */}
      <div className="inv-form-section" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className="bsc-icon"
              style={{
                background: (billingJob?.isEnabled ?? true) ? 'rgba(6,182,212,0.12)' : 'rgba(148, 163, 184, 0.12)',
                color: (billingJob?.isEnabled ?? true) ? '#22d3ee' : 'var(--text-muted)',
                width: 42,
                height: 42,
                borderRadius: 10,
              }}
            >
              <CalendarClock size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {billingJob?.name || 'Daily Recurring Billing'}
                </span>
                {(billingJob?.isEnabled ?? true) ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}>
                    <span className="live-dot" style={{ margin: 0, width: 6, height: 6 }} /> Active
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(148, 163, 184, 0.12)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    Paused
                  </span>
                )}
                {billingJob?.isRunning && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(96, 165, 250, 0.15)',
                    color: '#60a5fa',
                  }}>
                    <RefreshCw size={11} className="animate-spin" /> In Progress
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  {getHumanSchedule(billingJob?.cronExpression || '0 2 * * *', billingJob?.timezone || 'Asia/Yangon')}
                </span>
                <span style={{ color: 'var(--border)' }}>—</span>
                <span>
                  Next run: <strong style={{ color: 'var(--text-primary)' }}>{calculateNextRun(billingJob?.cronExpression || '0 2 * * *', billingJob?.isEnabled ?? true)}</strong>
                </span>
                {billingJob?.lastRunAt && (
                  <>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Last run: {format(new Date(billingJob.lastRunAt), 'MMM d, HH:mm')}
                      {billingJob.lastStatus === 'success' ? (
                        <span style={{ color: '#10b981', marginLeft: 4, fontWeight: 500 }}>(Success)</span>
                      ) : billingJob.lastStatus === 'failed' ? (
                        <span style={{ color: '#f87171', marginLeft: 4, fontWeight: 500 }}>(Failed)</span>
                      ) : null}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/admin/developer/cron-jobs')}
              title="Manage cron schedules and frequency in Cron Jobs Setup"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '0.45rem 0.75rem' }}
            >
              <Settings size={14} />
              <span>Configure Schedule</span>
            </button>
            <PermissionGuard permission="billing-dashboard.write">
              <button
                className="btn btn-primary"
                onClick={handleRunBilling}
                disabled={runningBilling || billingJob?.isRunning}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '0.45rem 0.85rem' }}
              >
                <Play size={14} /> {runningBilling || billingJob?.isRunning ? 'Running…' : 'Run Now'}
              </button>
            </PermissionGuard>
          </div>
        </div>
      </div>

      {/* Quick Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Invoices', icon: <Receipt size={16} />, path: '/admin/billing/invoices', color: '#818cf8' },
          { label: 'Schedules', icon: <CalendarClock size={16} />, path: '/admin/billing/schedules', color: '#22d3ee' },
          { label: 'Charge Types', icon: <DollarSign size={16} />, path: '/admin/billing/charge-types', color: '#34d399' },
          { label: 'Settings', icon: <CheckCircle size={16} />, path: '/admin/billing/settings', color: '#fbbf24' },
        ].map(item => (
          <button
            key={item.path}
            className="billing-stat-card"
            onClick={() => navigate(item.path)}
            style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)', textAlign: 'left', background: 'var(--surface-elevated)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="bsc-icon" style={{ background: `color-mix(in srgb, ${item.color} 12%, transparent)`, color: item.color, width: 32, height: 32 }}>
                {item.icon}
              </div>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{item.label}</span>
            </div>
            <ArrowRight size={14} style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }} />
          </button>
        ))}
      </div>

      {/* Recent Invoices Table */}
      <div className="inv-form-section" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Recent Invoices</div>
          <button
            className="add-line-btn"
            onClick={() => navigate('/admin/billing/invoices')}
          >
            View All <ArrowRight size={12} />
          </button>
        </div>
        <div className="billing-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <TableScrollWrapper>
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Tenant</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && !recentInvoices.length ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Loading…</td></tr>
                ) : recentInvoices.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No invoices yet</td></tr>
                ) : recentInvoices.map(inv => (
                  <tr key={inv.id} className="clickable" onClick={() => navigate(`/admin/billing/invoices/${inv.id}`)}>
                    <td><span className="cell-mono">{inv.invoiceNumber}</span></td>
                    <td><span className="cell-primary">{getTenantName(inv)}</span></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{format(new Date(inv.invoiceDate), 'yyyy-MM-dd')}</span></td>
                    <td className="text-right">
                      <span className="cell-amount">{formatCurrency(Number(inv.totalAmount), inv.currency)}</span>
                    </td>
                    <td><span className={`inv-status inv-status--${inv.status}`}>{inv.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
        </div>
      </div>
    </div>
  );
}
