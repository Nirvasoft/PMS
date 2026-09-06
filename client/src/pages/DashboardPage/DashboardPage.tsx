import { useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLogoutMutation } from '../../store/api/authApi';
import { useGetPropertyStatsQuery } from '../../store/api/organizationApi';
import { useGetMyPropertyScopeQuery } from '../../store/api/propertiesApi';
import { useAppSelector, useAppDispatch } from '../../store';
import { setSelectedProperty } from '../../store/slices/propertiesSlice';
import { ALL_PROPERTIES } from '../../hooks/useSelectedPropertyId';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import { FeatureGate } from '../../components/guards/FeatureGate';
import {
  Building2, LayoutDashboard, Shield, LogOut, Settings, ChevronRight, ChevronDown, SquareKanban,
  User, Users, Key, GitBranch, Home, MapPin, Workflow, Inbox, Bell, Briefcase, FileText, FolderOpen,
  Users2, ClipboardList, Target, Megaphone, Car, Link2, Ticket, Activity, Receipt, CalendarClock, CalendarDays,
  Banknote, BarChart3, Clock, RotateCcw,
  BookOpen, Calculator, Scale, PieChart, Landmark, Wallet, Box,
  Wrench, Calendar, Package, Layers, Sparkles, ClipboardCheck,
  Store, TrendingUp, DollarSign, Coins, Tag,
  Zap, Gavel, CreditCard, Palette,
  Plug, Webhook, Server, DoorOpen, QrCode, ShoppingCart, Gauge,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationBell from '../../components/notifications/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import ExpiringDocumentsWidget from '../../components/widgets/ExpiringDocumentsWidget';
import { useState, useCallback, type ReactNode, Component, lazy, Suspense } from 'react';

const SIDEBAR_COLLAPSED_WIDTH = 64;

const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));

// Error Boundary to prevent dashboard crashes from breaking the whole page
const CHUNK_RELOAD_KEY = 'dashboard-chunk-reload';
const CHUNK_LOAD_ERROR = /fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }

  componentDidCatch(error: Error) {
    // A stale chunk hash from before the latest deploy 404s on lazy-load.
    // Reloading once picks up the new build; guard against looping if the
    // failure is something else entirely.
    if (CHUNK_LOAD_ERROR.test(error.message) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>
          <h3>⚠️ Dashboard failed to load</h3>
          <p style={{ fontSize: '0.85rem' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Collapsible Nav Section ──────────────────

function NavSection({ label, children, defaultOpen = false, storageKey, isCollapsed }: {
  label: string; children: ReactNode; defaultOpen?: boolean; storageKey: string; isCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(`nav-section-${storageKey}`);
    return saved !== null ? saved === '1' : defaultOpen;
  });

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(`nav-section-${storageKey}`, next ? '1' : '0');
      return next;
    });
  }, [storageKey]);

  // In collapsed mode, show all nav items without section headers
  if (isCollapsed) {
    return <div className="nav-section nav-section--collapsed">{children}</div>;
  }

  return (
    <div className="nav-section">
      <button className="nav-section-toggle" onClick={toggle} type="button">
        <span className="nav-section-label-text">{label}</span>
        <ChevronRight size={12} className={`nav-section-chevron ${open ? 'open' : ''}`} />
      </button>
      <div className={`nav-section-items ${open ? 'expanded' : 'collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const selectedPropertyId = useAppSelector((s) => s.properties.selectedPropertyId);
  const { data: propertiesRes } = useGetMyPropertyScopeQuery();
  const properties = propertiesRes?.data || [];
  const [logout] = useLogoutMutation();
  useRealtimeNotifications(); // Real-time WS notifications

  // ── Sidebar Collapse State ──
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === '1';
  });


  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await logout({ allDevices: false });
    toast.success('Signed out successfully');
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside
        className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`}
        style={isCollapsed ? { width: SIDEBAR_COLLAPSED_WIDTH } : undefined}
      >
        {/* Header */}
        <div
          className={`sidebar-header${isCollapsed ? ' sidebar-header--collapsed' : ''}`}
          onClick={isCollapsed ? toggleCollapse : undefined}
        >
          {/* Logo icon — swaps to expand arrow on hover when collapsed */}
          <span className="sidebar-logo-wrap">
            <Building2 size={26} className="sidebar-logo-icon logo-default" />
            {isCollapsed && <PanelLeftOpen size={26} className="logo-hover" />}
          </span>
          {!isCollapsed && <span className="sidebar-brand">PMS</span>}
          {/* Toggle button — only visible when expanded */}
          {!isCollapsed && (
            <button
              className="sidebar-collapse-btn"
              onClick={toggleCollapse}
              title="Collapse sidebar"
            >
              <PanelLeftClose size={26} />
            </button>
          )}
        </div>

        {/* Property Selector */}
        {properties.length > 0 && (() => {
          const currentPropertyValue = selectedPropertyId === ALL_PROPERTIES
            ? ALL_PROPERTIES
            : (selectedPropertyId || properties[0]?.id || '');
          const currentPropertyLabel = currentPropertyValue === ALL_PROPERTIES
            ? 'All Properties'
            : properties.find((p: any) => p.id === currentPropertyValue)?.name || 'Property';
          return (
            <div className={`sidebar-property-selector${isCollapsed ? ' sidebar-property-selector--collapsed' : ''}`}>
              {!isCollapsed && <label htmlFor="sidebar-prop-select">Active Property</label>}
              {isCollapsed ? (
                <div className="sidebar-property-icon" title={currentPropertyLabel}>
                  <Home size={16} />
                </div>
              ) : (
                <select
                  id="sidebar-prop-select"
                  value={currentPropertyValue}
                  onChange={(e) => dispatch(setSelectedProperty(e.target.value))}
                  className="sidebar-property-dropdown"
                >
                  <option value={ALL_PROPERTIES}>All Properties</option>
                  {properties.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              )}
            </div>
          );
        })()}

        <nav className={`sidebar-nav${isCollapsed ? ' sidebar-nav--collapsed' : ''}`}>
          <PermissionGuard hideWhenDenied permission="dashboard.view">
            <NavLink to="/dashboard" end className="nav-item" title="Dashboard">
              <SquareKanban size={18} />
              {!isCollapsed && <span>Dashboard</span>}
            </NavLink>
          </PermissionGuard>


          {/* Admin Section */}
          <PermissionGuard hideWhenDenied permission={['users.read', 'roles.read', 'departments.read', 'positions.read']}>
            <NavSection label="Administration" storageKey="admin" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="users.read">
                <NavLink to="/admin/users" className="nav-item" title="Users">
                  <Users size={18} />
                  <span>Users</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="roles.read">
                <NavLink to="/admin/roles" className="nav-item" title="Roles & Permissions">
                  <Key size={18} />
                  <span>Roles & Permissions</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="departments.read">
                <NavLink to="/admin/departments" className="nav-item" title="Departments">
                  <GitBranch size={18} />
                  <span>Departments</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="positions.read">
                <NavLink to="/admin/positions" className="nav-item" title="Positions">
                  <Briefcase size={18} />
                  <span>Positions</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Organization Section */}
          <PermissionGuard hideWhenDenied permission={['company.read', 'properties.read', 'tenants.read', 'leases.read']}>
            <NavSection label="Organization" storageKey="org" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="company.read">
                <NavLink to="/admin/company" className="nav-item" title="Company">
                  <Building2 size={18} />
                  <span>Company</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="properties.read">
                <NavLink to="/admin/properties" end className="nav-item" title="Properties">
                  <Home size={18} />
                  <span>Properties</span>
                </NavLink>
                <NavLink to="/admin/properties/floor-setup" className="nav-item" title="Floor Setup">
                  <Layers size={18} />
                  <span>Floor Setup</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="tenants.read">
                <NavLink to="/admin/tenants" className="nav-item" title="Tenants">
                  <Users2 size={18} />
                  <span>Tenants</span>
                </NavLink>
              </PermissionGuard>
              <FeatureGate flag="leasingEnabled">
                <PermissionGuard hideWhenDenied permission="leases.read">
                  <NavLink to="/admin/leases" className="nav-item" title="Leases">
                    <ClipboardList size={18} />
                    <span>Leases</span>
                  </NavLink>
                </PermissionGuard>
              </FeatureGate>
            </NavSection>
          </PermissionGuard>

          {/* CRM Section */}
          <FeatureGate flag="crmEnabled">
            <PermissionGuard hideWhenDenied permission={['crm-leads.read', 'crm-campaigns.read']}>
              <NavSection label="CRM" storageKey="crm" defaultOpen isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="crm-leads.read">
                  <NavLink to="/admin/crm/leads" className="nav-item" title="Lead Pipeline">
                    <Target size={18} />
                    <span>Lead Pipeline</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="crm-campaigns.read">
                  <NavLink to="/admin/crm/campaigns" className="nav-item" title="Campaigns">
                    <Megaphone size={18} />
                    <span>Campaigns</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Parking Section */}
          <FeatureGate flag="parkingEnabled">
            <PermissionGuard hideWhenDenied permission={['parking-overview.read', 'parking-allocations.read', 'parking-visitors.read', 'parking-gate-logs.read', 'parking-vehicles.read']}>
              <NavSection label="Parking" storageKey="parking" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="parking-overview.read">
                  <NavLink to="/admin/parking" end className="nav-item" title="Parking Overview">
                    <Car size={18} />
                    <span>Parking Overview</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="parking-allocations.read">
                  <NavLink to="/admin/parking/allocations" className="nav-item" title="Allocations">
                    <Link2 size={18} />
                    <span>Allocations</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="parking-visitors.read">
                  <NavLink to="/admin/parking/visitors" className="nav-item" title="Visitor Parking">
                    <Ticket size={18} />
                    <span>Visitor Parking</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="parking-gate-logs.read">
                  <NavLink to="/admin/parking/gate-logs" className="nav-item" title="Gate Logs">
                    <Activity size={18} />
                    <span>Gate Logs</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="parking-vehicles.read">
                  <NavLink to="/admin/parking/vehicles" className="nav-item" title="Vehicle Registry">
                    <Car size={18} />
                    <span>Vehicle Registry</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Billing Section */}
          <PermissionGuard hideWhenDenied permission={['billing-dashboard.read', 'billing-invoices.read', 'billing-schedules.read', 'charge-category.read', 'billing-charge-types.read', 'meter.read', 'billing-settings.read']}>
            <NavSection label="Billing" storageKey="billing" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="billing-dashboard.read">
                <NavLink to="/admin/billing/dashboard" className="nav-item" title="Dashboard">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="billing-invoices.read">
                <NavLink to="/admin/billing/invoices" className="nav-item" title="Invoices">
                  <Receipt size={18} />
                  <span>Invoices</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="billing-schedules.read">
                <NavLink to="/admin/billing/schedules" className="nav-item" title="Schedules">
                  <CalendarClock size={18} />
                  <span>Schedules</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="charge-category.read">
                <NavLink to="/admin/billing/charge-categories" className="nav-item" title="Charge Categories">
                  <Tag size={18} />
                  <span>Charge Categories</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="billing-charge-types.read">
                <NavLink to="/admin/billing/charge-types" className="nav-item" title="Charge Types">
                  <DollarSign size={18} />
                  <span>Charge Types</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="meter.read">
                <NavLink to="/admin/billing/meter-setup" className="nav-item" title="Meter Setup">
                  <SquareKanban size={18} />
                  <span>Meter Setup</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="billing-settings.read">
                <NavLink to="/admin/billing/settings" className="nav-item" title="Settings">
                  <Settings size={18} />
                  <span>Settings</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Accounts Receivable Section */}
          <PermissionGuard hideWhenDenied permission={['ar-receipts.read', 'ar-aging.read', 'ar-collections.read', 'ar-refunds.read', 'ar-statements.read', 'ar-credits.read']}>
            <NavSection label="Accounts Receivable" storageKey="ar" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="ar-receipts.read">
                <NavLink to="/admin/ar/receipts" className="nav-item" title="Receipts">
                  <Banknote size={18} />
                  <span>Receipts</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ar-aging.read">
                <NavLink to="/admin/ar/aging" className="nav-item" title="Aging Report">
                  <Clock size={18} />
                  <span>Aging Report</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ar-collections.read">
                <NavLink to="/admin/ar/collections" className="nav-item" title="Collections">
                  <BarChart3 size={18} />
                  <span>Collections</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ar-refunds.read">
                <NavLink to="/admin/ar/refunds" className="nav-item" title="Refunds">
                  <RotateCcw size={18} />
                  <span>Refunds</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ar-statements.read">
                <NavLink to="/admin/ar/statements" className="nav-item" title="Statements">
                  <FileText size={18} />
                  <span>Statements</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ar-credits.read">
                <NavLink to="/admin/ar/credits" className="nav-item" title="Tenant Credits">
                  <Coins size={18} />
                  <span>Tenant Credits</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Accounts Payable Section */}
          <PermissionGuard hideWhenDenied permission={['ap-invoices.read', 'ap-vouchers.read', 'ap-expenses.read']}>
            <NavSection label="Accounts Payable" storageKey="ap" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="ap-invoices.read">
                <NavLink to="/admin/ap/invoices" className="nav-item" title="AP Invoices">
                  <FileText size={18} />
                  <span>AP Invoices</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ap-vouchers.read">
                <NavLink to="/admin/ap/vouchers" className="nav-item" title="Payment Vouchers">
                  <Wallet size={18} />
                  <span>Payment Vouchers</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="ap-expenses.read">
                <NavLink to="/admin/ap/expenses" className="nav-item" title="Expenses">
                  <Receipt size={18} />
                  <span>Expenses</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Finance / GL Section */}
          <PermissionGuard hideWhenDenied permission={['finance-coa.read', 'finance-journal.read', 'finance-fiscal-periods.read', 'finance-trial-balance.read', 'finance-pnl.read', 'finance-balance-sheet.read', 'finance-cash-flow.read', 'finance-budgets.read', 'finance-assets.read', 'finance-banking.read', 'finance-gateway.read']}>
            <NavSection label="Finance" storageKey="finance" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="finance-coa.read">
                <NavLink to="/admin/gl/accounts" className="nav-item" title="Chart of Accounts">
                  <BookOpen size={18} />
                  <span>Chart of Accounts</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-journal.read">
                <NavLink to="/admin/gl/journal-entries" className="nav-item" title="Journal Entries">
                  <ClipboardList size={18} />
                  <span>Journal Entries</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-fiscal-periods.read">
                <NavLink to="/admin/gl/fiscal-periods" className="nav-item" title="Fiscal Periods">
                  <CalendarClock size={18} />
                  <span>Fiscal Periods</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-trial-balance.read">
                <NavLink to="/admin/gl/trial-balance" className="nav-item" title="Trial Balance">
                  <Scale size={18} />
                  <span>Trial Balance</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-pnl.read">
                <NavLink to="/admin/gl/pnl" className="nav-item" title="Profit & Loss">
                  <PieChart size={18} />
                  <span>Profit & Loss</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-balance-sheet.read">
                <NavLink to="/admin/gl/balance-sheet" className="nav-item" title="Balance Sheet">
                  <Landmark size={18} />
                  <span>Balance Sheet</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-cash-flow.read">
                <NavLink to="/admin/gl/cash-flow" className="nav-item" title="Cash Flow">
                  <Banknote size={18} />
                  <span>Cash Flow</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-budgets.read">
                <NavLink to="/admin/budgets" className="nav-item" title="Budgets">
                  <Wallet size={18} />
                  <span>Budgets</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-assets.read">
                <NavLink to="/admin/assets" className="nav-item" title="Fixed Assets">
                  <Box size={18} />
                  <span>Fixed Assets</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-banking.read">
                <NavLink to="/admin/banking" className="nav-item" title="Banking">
                  <Building2 size={18} />
                  <span>Banking</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="finance-gateway.read">
                <NavLink to="/admin/banking/gateway-transactions" className="nav-item" title="Gateway Payments">
                  <Zap size={18} />
                  <span>Gateway Payments</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          <FeatureGate flag="workflowEnabled">
            <PermissionGuard hideWhenDenied permission={['workflows-tasks.read', 'workflows-engine.read']}>
              <NavSection label="Workflows" storageKey="wf" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="workflows-tasks.read">
                  <NavLink to="/tasks" className="nav-item" title="My Tasks">
                    <Inbox size={18} />
                    <span>My Tasks</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="workflows-engine.read">
                  <NavLink to="/admin/workflows" className="nav-item" title="Workflow Engine">
                    <Workflow size={18} />
                    <span>Workflow Engine</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Maintenance Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard hideWhenDenied permission={['maintenance-dashboard.read', 'maintenance-tickets.read', 'maintenance-technicians.read', 'maintenance-sla.read', 'maintenance-pm.read', 'maintenance-pm-calendar.read']}>
              <NavSection label="Maintenance" storageKey="maintenance" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="maintenance-dashboard.read">
                  <NavLink to="/admin/maintenance" className="nav-item" end>
                    <BarChart3 size={18} />
                    <span>Dashboard</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="maintenance-tickets.read">
                  <NavLink to="/admin/maintenance/tickets" className="nav-item" title="Tickets">
                    <Wrench size={18} />
                    <span>Tickets</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="maintenance-technicians.read">
                  <NavLink to="/admin/maintenance/technicians" className="nav-item" title="Technician Schedule">
                    <Calendar size={18} />
                    <span>Technician Schedule</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="maintenance-sla.read">
                  <NavLink to="/admin/maintenance/sla-config" className="nav-item" title="SLA Configuration">
                    <Shield size={18} />
                    <span>SLA Configuration</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="maintenance-pm.read">
                  <NavLink to="/admin/maintenance/pm" className="nav-item" title="PM Schedules">
                    <CalendarClock size={18} />
                    <span>PM Schedules</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="maintenance-pm-calendar.read">
                  <NavLink to="/admin/maintenance/pm/calendar" className="nav-item" title="PM Calendar">
                    <Calendar size={18} />
                    <span>PM Calendar</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Facility Management Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard hideWhenDenied permission={['facility-assets.read', 'facility-cam.read', 'facility-schedule.read']}>
              <NavSection label="Facility" storageKey="facility" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="facility-assets.read">
                  <NavLink to="/admin/facility/assets" className="nav-item" title="Asset Registry">
                    <Box size={18} />
                    <span>Asset Registry</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="facility-cam.read">
                  <NavLink to="/admin/facility/cam-costs" className="nav-item" title="CAM Costs">
                    <Receipt size={18} />
                    <span>CAM Costs</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="facility-schedule.read">
                  <NavLink to="/admin/facility/schedule" className="nav-item" title="Booking Schedule">
                    <CalendarDays size={18} />
                    <span>Booking Schedule</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Inventory Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard hideWhenDenied permission={['inventory-dashboard.read', 'inventory-items.read', 'inventory-stock.read', 'inventory-stores.read', 'inventory-movements.read', 'inventory-purchase-req.read']}>
              <NavSection label="Inventory" storageKey="inventory" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="inventory-dashboard.read">
                  <NavLink to="/admin/inventory/dashboard" className="nav-item" title="Dashboard">
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="inventory-items.read">
                  <NavLink to="/admin/inventory/items" className="nav-item" title="Item Catalog">
                    <Package size={18} />
                    <span>Item Catalog</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="inventory-stock.read">
                  <NavLink to="/admin/inventory/stock" className="nav-item" title="Stock Levels">
                    <Layers size={18} />
                    <span>Stock Levels</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="inventory-stores.read">
                  <NavLink to="/admin/inventory/stores" className="nav-item" title="Stores">
                    <Store size={18} />
                    <span>Stores</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="inventory-movements.read">
                  <NavLink to="/admin/inventory/movements" className="nav-item" title="Movements">
                    <Activity size={18} />
                    <span>Movements</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="inventory-purchase-req.read">
                  <NavLink to="/admin/inventory/purchase-requisitions" className="nav-item" title="Purchase Requisitions">
                    <ClipboardList size={18} />
                    <span>Purchase Requisitions</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Housekeeping Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard hideWhenDenied permission={['housekeeping-dashboard.read', 'housekeeping-tasks.read', 'housekeeping-schedules.read', 'housekeeping-zones.read', 'housekeeping-inspections.read']}>
              <NavSection label="Housekeeping" storageKey="housekeeping" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="housekeeping-dashboard.read">
                  <NavLink to="/admin/housekeeping/dashboard" className="nav-item" title="Dashboard">
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="housekeeping-tasks.read">
                  <NavLink to="/admin/housekeeping" className="nav-item" title="Tasks">
                    <Sparkles size={18} />
                    <span>Tasks</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="housekeeping-schedules.read">
                  <NavLink to="/admin/housekeeping/schedules" className="nav-item" title="Schedules">
                    <Calendar size={18} />
                    <span>Schedules</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="housekeeping-zones.read">
                  <NavLink to="/admin/housekeeping/zones" className="nav-item" title="Zones">
                    <MapPin size={18} />
                    <span>Zones</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="housekeeping-inspections.read">
                  <NavLink to="/admin/housekeeping/inspections" className="nav-item" title="Inspections">
                    <ClipboardCheck size={18} />
                    <span>Inspections</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Security Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard hideWhenDenied permission={['security-dashboard.read', 'security-incidents.read', 'security-patrol.read', 'security-patrol-schedules.read', 'security-patrol-scan.read', 'security-access-events.read', 'security-blacklist.read']}>
              <NavSection label="Security" storageKey="security" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="security-dashboard.read">
                  <NavLink to="/admin/security/dashboard" className="nav-item" title="Dashboard">
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-incidents.read">
                  <NavLink to="/admin/security/incidents" className="nav-item" title="Incidents">
                    <Shield size={18} />
                    <span>Incidents</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-patrol.read">
                  <NavLink to="/admin/security/patrol" className="nav-item" title="Patrol Logs">
                    <MapPin size={18} />
                    <span>Patrol Logs</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-patrol-schedules.read">
                  <NavLink to="/admin/security/patrol/schedules" className="nav-item" title="Patrol Schedules">
                    <Clock size={18} />
                    <span>Patrol Schedules</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-patrol-scan.read">
                  <NavLink to="/admin/security/patrol/scan" className="nav-item" title="Patrol Scan">
                    <QrCode size={18} />
                    <span>Patrol Scan</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-access-events.read">
                  <NavLink to="/admin/security/access-events" className="nav-item" title="Access Events">
                    <DoorOpen size={18} />
                    <span>Access Events</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="security-blacklist.read">
                  <NavLink to="/admin/security/blacklist" className="nav-item" title="Visitor Blacklist">
                    <Shield size={18} />
                    <span>Visitor Blacklist</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Documents Section */}
          <FeatureGate flag="documentVaultEnabled">
            <PermissionGuard hideWhenDenied permission="documents.read">
              <NavSection label="Documents" storageKey="docs" isCollapsed={isCollapsed}>
                <NavLink to="/documents" className="nav-item" title="Document Vault">
                  <FolderOpen size={18} />
                  <span>Document Vault</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Notifications Section */}
          <PermissionGuard hideWhenDenied permission={['notifications.send', 'notifications.logs', 'notifications.manage']}>
            <NavSection label="Notifications" storageKey="notif" isCollapsed={isCollapsed}>
              <NavLink to="/notifications" className="nav-item" title="All Notifications">
                <Bell size={18} />
                <span>All Notifications</span>
              </NavLink>
              <FeatureGate flag="notificationsAdminEnabled">
                <PermissionGuard hideWhenDenied permission="notifications.logs">
                  <NavLink to="/admin/notifications" className="nav-item" title="Logs & Templates">
                    <FileText size={18} />
                    <span>Logs & Templates</span>
                  </NavLink>
                </PermissionGuard>
              </FeatureGate>
            </NavSection>
          </PermissionGuard>

          {/* Mall Section */}
          <FeatureGate flag="mallModuleEnabled">
            <PermissionGuard hideWhenDenied permission={['mall-dashboard.read', 'mall-shops.read', 'mall-gto.read', 'mall-cam.read', 'mall-events.read', 'mall-footfall.read', 'mall-pos.read']}>
              <NavSection label="Shopping Mall" storageKey="mall" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="mall-dashboard.read">
                  <NavLink to="/admin/mall" className="nav-item" end>
                    <Store size={18} />
                    <span>Mall Dashboard</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-shops.read">
                  <NavLink to="/admin/mall/shops" className="nav-item" title="Shop Directory">
                    <Building2 size={18} />
                    <span>Shop Directory</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-gto.read">
                  <NavLink to="/admin/mall/gto" className="nav-item" title="GTO Management">
                    <TrendingUp size={18} />
                    <span>GTO Management</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-cam.read">
                  <NavLink to="/admin/mall/cam" className="nav-item" title="CAM Management">
                    <DollarSign size={18} />
                    <span>CAM Management</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-events.read">
                  <NavLink to="/admin/mall/events" className="nav-item" title="Events">
                    <Calendar size={18} />
                    <span>Events</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-footfall.read">
                  <NavLink to="/admin/mall/footfall" className="nav-item" title="Footfall Analytics">
                    <Activity size={18} />
                    <span>Footfall Analytics</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="mall-pos.read">
                  <NavLink to="/admin/mall/pos" className="nav-item" title="POS Integration">
                    <ShoppingCart size={18} />
                    <span>POS Integration</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>
          {/* Community Section */}
          <PermissionGuard hideWhenDenied permission={['community-admin.read', 'community-quick-actions.read', 'community-analytics.read', 'community-access-cards.read', 'community-branding.read']}>
            <NavSection label="Community" storageKey="community" isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="community-admin.read">
                <NavLink to="/admin/community" className="nav-item" title="Community Admin">
                  <Megaphone size={18} />
                  <span>Community Admin</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="community-quick-actions.read">
                <NavLink to="/admin/portal/quick-actions" className="nav-item" title="Portal Quick Actions">
                  <Zap size={18} />
                  <span>Portal Quick Actions</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="community-analytics.read">
                <NavLink to="/admin/portal/analytics" className="nav-item" title="Portal Analytics">
                  <Activity size={18} />
                  <span>Portal Analytics</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="community-access-cards.read">
                <NavLink to="/admin/access-cards" className="nav-item" title="Access Cards">
                  <CreditCard size={18} />
                  <span>Access Cards</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="community-branding.read">
                <NavLink to="/admin/portal/branding" className="nav-item" title="Portal Branding">
                  <Palette size={18} />
                  <span>Portal Branding</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Condo Section */}
          <FeatureGate flag="condoModuleEnabled">
            <PermissionGuard hideWhenDenied permission={['condo-meters.read', 'condo-funds.read', 'condo-meetings.read', 'condo-bylaws.read']}>
              <NavSection label="Condo" storageKey="condo" isCollapsed={isCollapsed}>
                <PermissionGuard hideWhenDenied permission="condo-meters.read">
                  <NavLink to="/admin/condo/smart-meters" className="nav-item" title="Smart Meters">
                    <Zap size={18} />
                    <span>Smart Meters</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="condo-funds.read">
                  <NavLink to="/admin/condo/funds" className="nav-item" title="Funds">
                    <Wallet size={18} />
                    <span>Funds</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="condo-meetings.read">
                  <NavLink to="/admin/condo/meetings" className="nav-item" title="Meetings (AGM)">
                    <Users2 size={18} />
                    <span>Meetings (AGM)</span>
                  </NavLink>
                </PermissionGuard>
                <PermissionGuard hideWhenDenied permission="condo-bylaws.read">
                  <NavLink to="/admin/condo/bylaws" className="nav-item" title="By-Laws">
                    <Gavel size={18} />
                    <span>By-Laws</span>
                  </NavLink>
                </PermissionGuard>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>
          <PermissionGuard hideWhenDenied permission="portal.read">
            <NavSection label="Tenant Portal" storageKey="portal" isCollapsed={isCollapsed}>
              <NavLink to="/portal" className="nav-item" title="Portal Dashboard">
                <Home size={18} />
                <span>Portal Dashboard</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* BI & Analytics */}
          <PermissionGuard hideWhenDenied permission={['reports-executive.read', 'reports-bi.read', 'reports-anomalies.read', 'reports-list.read']}>
            <NavSection label="Analytics" storageKey="bi" isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="reports-executive.read">
                <NavLink to="/admin/bi" className="nav-item" title="Executive Dashboard">
                  <BarChart3 size={18} />
                  <span>Executive Dashboard</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="reports-bi.read">
                <NavLink to="/admin/bi/reports" className="nav-item" title="BI Reports">
                  <PieChart size={18} />
                  <span>BI Reports</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="reports-anomalies.read">
                <NavLink to="/admin/bi/anomalies" className="nav-item" title="Anomaly Dashboard">
                  <Activity size={18} />
                  <span>Anomaly Dashboard</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="reports-list.read">
                <NavLink to="/reports" className="nav-item" title="Reports">
                  <FileText size={18} />
                  <span>Reports</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Developer / Integrations Section */}
          <PermissionGuard hideWhenDenied permission={['developer-integrations.read', 'developer-webhooks.read', 'developer-api-keys.read', 'developer-bms.read']}>
            <NavSection label="Developer" storageKey="developer" isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="developer-integrations.read">
                <NavLink to="/admin/developer/integrations" className="nav-item" title="Integrations">
                  <Plug size={18} />
                  <span>Integrations</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="developer-webhooks.read">
                <NavLink to="/admin/developer/webhooks" className="nav-item" title="Webhooks">
                  <Webhook size={18} />
                  <span>Webhooks</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="developer-api-keys.read">
                <NavLink to="/admin/developer/api-keys" className="nav-item" title="API Keys">
                  <Key size={18} />
                  <span>API Keys</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="developer-bms.read">
                <NavLink to="/admin/developer/bms" className="nav-item" title="BMS Devices">
                  <Server size={18} />
                  <span>BMS Devices</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Settings Section — "Company & Features" deliberately omitted here: it's the
              same /admin/company page already reachable via Organization → Company, and
              including it here would leak this section open to anyone with company.manage
              even though they have no actual Settings-module permission. */}
          <PermissionGuard hideWhenDenied permission={['settings-security.read', 'settings-notifications.read', 'settings-profile.read']}>
            <NavSection label="Settings" storageKey="settings" isCollapsed={isCollapsed}>
              <PermissionGuard hideWhenDenied permission="settings-security.read">
                <NavLink to="/settings/security" className="nav-item" title="Security">
                  <Shield size={18} />
                  <span>Security</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="settings-notifications.read">
                <NavLink to="/settings/notifications" className="nav-item" title="Notification Prefs">
                  <Bell size={18} />
                  <span>Notification Prefs</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard hideWhenDenied permission="settings-profile.read">
                <NavLink to="/settings/profile" className="nav-item" title="My Profile">
                  <User size={18} />
                  <span>My Profile</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>
        </nav>

        <div className={`sidebar-footer${isCollapsed ? ' sidebar-footer--collapsed' : ''}`}>
          <div className="user-info" title={isCollapsed ? (user?.email?.split('@')[0] || '') : undefined}>
            <div className="user-avatar">
              <User size={16} />
            </div>
            {!isCollapsed && (
              <div className="user-details">
                <span className="user-name">{user?.email?.split('@')[0]}</span>
                <span className="user-role">{user?.roles?.[0] || 'User'}</span>
              </div>
            )}
          </div>
          <button className="btn-icon logout-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="top-bar">
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function DashboardHome() {
  const navigate = useNavigate();
  return (
    <>
      <DashboardErrorBoundary>
        <Suspense fallback={<div className="loading-inline"><div className="loading-spinner" /> Loading dashboard...</div>}>
          <AnalyticsDashboard />
        </Suspense>
      </DashboardErrorBoundary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginTop: '20px', padding: '0 0 24px' }}>
        <ExpiringDocumentsWidget
          days={30}
          limit={6}
          onViewAll={() => navigate('/documents')}
        />
      </div>
    </>
  );
}
