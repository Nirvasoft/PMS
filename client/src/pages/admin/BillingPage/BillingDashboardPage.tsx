import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetInvoicesQuery, useRunBillingMutation } from '../../../store/api/billingApi';
import {
  LayoutDashboard, FileText, AlertTriangle, Clock, DollarSign,
  Play, ArrowRight, TrendingUp, Receipt, CalendarClock, CheckCircle,
} from 'lucide-react';
import { format, startOfMonth, isAfter, isBefore, addDays } from 'date-fns';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import './BillingPage.css';

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function BillingDashboardPage() {
  const navigate = useNavigate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekEnd = addDays(today, 7).toISOString().split('T')[0];
  const monthStart = startOfMonth(today).toISOString().split('T')[0];

  // Fetch recent invoices
  const { data: allData, isFetching } = useGetInvoicesQuery({ page: 1, limit: 50 });
  const { data: overdueData } = useGetInvoicesQuery({ status: 'overdue', page: 1, limit: 50 });
  const { data: paidData } = useGetInvoicesQuery({ status: 'paid', page: 1, limit: 50, from: monthStart });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const invoices = allData?.data || [];
  const overdueInvoices = overdueData?.data || [];
  const paidInvoices = paidData?.data || [];

  const stats = useMemo(() => {
    const issuedToday = invoices.filter(i =>
      i.invoiceDate === todayStr && i.invoiceType === 'invoice',
    ).length;

    const dueThisWeek = invoices.filter(i => {
      const due = i.dueDate;
      return due >= todayStr && due <= weekEnd &&
        !['paid', 'void'].includes(i.status);
    }).length;

    const totalOverdue = overdueInvoices.reduce(
      (s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0,
    );

    const mtdRevenue = paidInvoices.reduce(
      (s, i) => s + Number(i.paidAmount), 0,
    );

    return { issuedToday, dueThisWeek, totalOverdue, overdueCount: overdueInvoices.length, mtdRevenue };
  }, [invoices, overdueInvoices, paidInvoices, todayStr, weekEnd]);

  const recentInvoices = useMemo(() =>
    [...invoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()).slice(0, 10),
    [invoices],
  );

  const handleRunBilling = async () => {
    if (!(await confirmDialog('This will generate invoices for all due billing schedules. Continue?'))) return;
    try {
      const result = await runBilling().unwrap();
      alertDialog(`Generated ${result.data.generated} invoices from ${result.data.processed} schedules.${result.data.errors.length > 0 ? '\n\nErrors:\n' + result.data.errors.join('\n') : ''}`);
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to run billing');
    }
  };

  const getTenantName = (inv: any) => {
    if (!inv.tenant) return '—';
    return inv.tenant.tenantType === 'company'
      ? inv.tenant.companyName || ''
      : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <LayoutDashboard size={22} />
          </div>
          <div>
            <h1>Billing Dashboard</h1>
            <p>Overview of billing activity and outstanding invoices</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="billing-summary-cards">
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <FileText size={18} />
          </div>
          <div className="bsc-label">Issued Today</div>
          <div className="bsc-value">{stats.issuedToday}</div>
          <div className="bsc-sub">Invoices generated</div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <AlertTriangle size={18} />
          </div>
          <div className="bsc-label">Overdue</div>
          <div className="bsc-value">{stats.overdueCount}</div>
          <div className="bsc-sub" style={{ color: stats.totalOverdue > 0 ? '#f87171' : undefined }}>
            {formatCurrency(stats.totalOverdue)} outstanding
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
            <Clock size={18} />
          </div>
          <div className="bsc-label">Due This Week</div>
          <div className="bsc-value">{stats.dueThisWeek}</div>
          <div className="bsc-sub">Upcoming payments</div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <TrendingUp size={18} />
          </div>
          <div className="bsc-label">MTD Revenue</div>
          <div className="bsc-value" style={{ fontSize: 22 }}>{formatCurrency(stats.mtdRevenue)}</div>
          <div className="bsc-sub">Month-to-date collected</div>
        </div>
      </div>

      {/* Scheduled Job Status */}
      <div className="inv-form-section" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="bsc-icon" style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee', width: 36, height: 36 }}>
              <CalendarClock size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Daily Billing Job</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                <span className="live-dot" /> Runs daily at 2:00 AM — next run: {format(addDays(today, 1), 'MMM d, yyyy')} 02:00
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleRunBilling}
            disabled={runningBilling}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Play size={14} /> {runningBilling ? 'Running…' : 'Run Now'}
          </button>
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
          <table className="billing-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Tenant</th>
                <th>Property</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !recentInvoices.length ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : recentInvoices.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No invoices yet</td></tr>
              ) : recentInvoices.map(inv => (
                <tr key={inv.id} className="clickable" onClick={() => navigate(`/admin/billing/invoices/${inv.id}`)}>
                  <td><span className="cell-mono">{inv.invoiceNumber}</span></td>
                  <td><span className="cell-primary">{getTenantName(inv)}</span></td>
                  <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inv.property?.name}</span></td>
                  <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{format(new Date(inv.invoiceDate), 'MMM d, yyyy')}</span></td>
                  <td className="text-right">
                    <span className="cell-amount">{formatCurrency(Number(inv.totalAmount), inv.currency)}</span>
                  </td>
                  <td><span className={`inv-status inv-status--${inv.status}`}>{inv.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
