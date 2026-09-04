import { useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLogoutMutation } from '../../store/api/authApi';
import { useGetPropertyStatsQuery } from '../../store/api/organizationApi';
import { useGetMyPropertyScopeQuery } from '../../store/api/propertiesApi';
import { useAppSelector, useAppDispatch } from '../../store';
import { setSelectedProperty } from '../../store/slices/propertiesSlice';
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
        {properties.length > 0 && (
          <div className={`sidebar-property-selector${isCollapsed ? ' sidebar-property-selector--collapsed' : ''}`}>
            {!isCollapsed && <label htmlFor="sidebar-prop-select">Active Property</label>}
            {isCollapsed ? (
              <div className="sidebar-property-icon" title={properties.find((p: any) => p.id === (selectedPropertyId || properties[0]?.id))?.name || 'Property'}>
                <Home size={16} />
              </div>
            ) : (
              <select
                id="sidebar-prop-select"
                value={selectedPropertyId || properties[0]?.id || ''}
                onChange={(e) => dispatch(setSelectedProperty(e.target.value))}
                className="sidebar-property-dropdown"
              >
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <nav className={`sidebar-nav${isCollapsed ? ' sidebar-nav--collapsed' : ''}`}>
          <PermissionGuard permission="dashboard.view">
            <NavLink to="/dashboard" end className="nav-item" title="Dashboard">
              <SquareKanban size={18} />
              {!isCollapsed && <span>Dashboard</span>}
            </NavLink>
          </PermissionGuard>


          {/* Admin Section */}
          <PermissionGuard permission={['users.read', 'roles.read', 'departments.read', 'positions.read']}>
            <NavSection label="Administration" storageKey="admin" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard permission="users.read">
                <NavLink to="/admin/users" className="nav-item" title="Users">
                  <Users size={18} />
                  <span>Users</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard permission="roles.read">
                <NavLink to="/admin/roles" className="nav-item" title="Roles & Permissions">
                  <Key size={18} />
                  <span>Roles & Permissions</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard permission="departments.read">
                <NavLink to="/admin/departments" className="nav-item" title="Departments">
                  <GitBranch size={18} />
                  <span>Departments</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard permission="positions.read">
                <NavLink to="/admin/positions" className="nav-item" title="Positions">
                  <Briefcase size={18} />
                  <span>Positions</span>
                </NavLink>
              </PermissionGuard>
            </NavSection>
          </PermissionGuard>

          {/* Organization Section */}
          <PermissionGuard permission={['company.read', 'properties.read', 'tenants.read', 'leases.read']}>
            <NavSection label="Organization" storageKey="org" defaultOpen isCollapsed={isCollapsed}>
              <PermissionGuard permission="company.read">
                <NavLink to="/admin/company" className="nav-item" title="Company">
                  <Building2 size={18} />
                  <span>Company</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard permission="properties.read">
                <NavLink to="/admin/properties" end className="nav-item" title="Properties">
                  <Home size={18} />
                  <span>Properties</span>
                </NavLink>
                <NavLink to="/admin/properties/floor-setup" className="nav-item" title="Floor Setup">
                  <Layers size={18} />
                  <span>Floor Setup</span>
                </NavLink>
              </PermissionGuard>
              <PermissionGuard permission="tenants.read">
                <NavLink to="/admin/tenants" className="nav-item" title="Tenants">
                  <Users2 size={18} />
                  <span>Tenants</span>
                </NavLink>
              </PermissionGuard>
              <FeatureGate flag="leasingEnabled">
                <PermissionGuard permission="leases.read">
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
            <PermissionGuard permission="crm.read">
              <NavSection label="CRM" storageKey="crm" defaultOpen isCollapsed={isCollapsed}>
                <NavLink to="/admin/crm/leads" className="nav-item" title="Lead Pipeline">
                  <Target size={18} />
                  <span>Lead Pipeline</span>
                </NavLink>
                <NavLink to="/admin/crm/campaigns" className="nav-item" title="Campaigns">
                  <Megaphone size={18} />
                  <span>Campaigns</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Parking Section */}
          <FeatureGate flag="parkingEnabled">
            <PermissionGuard permission="parking.read">
              <NavSection label="Parking" storageKey="parking" isCollapsed={isCollapsed}>
                <NavLink to="/admin/parking" end className="nav-item" title="Parking Overview">
                  <Car size={18} />
                  <span>Parking Overview</span>
                </NavLink>
                <NavLink to="/admin/parking/allocations" className="nav-item" title="Allocations">
                  <Link2 size={18} />
                  <span>Allocations</span>
                </NavLink>
                <NavLink to="/admin/parking/visitors" className="nav-item" title="Visitor Parking">
                  <Ticket size={18} />
                  <span>Visitor Parking</span>
                </NavLink>
                <NavLink to="/admin/parking/gate-logs" className="nav-item" title="Gate Logs">
                  <Activity size={18} />
                  <span>Gate Logs</span>
                </NavLink>
                <NavLink to="/admin/parking/vehicles" className="nav-item" title="Vehicle Registry">
                  <Car size={18} />
                  <span>Vehicle Registry</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Billing Section */}
          <PermissionGuard permission="billing.read">
            <NavSection label="Billing" storageKey="billing" defaultOpen isCollapsed={isCollapsed}>
              <NavLink to="/admin/billing/dashboard" className="nav-item" title="Dashboard">
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/admin/billing/invoices" className="nav-item" title="Invoices">
                <Receipt size={18} />
                <span>Invoices</span>
              </NavLink>
              <NavLink to="/admin/billing/schedules" className="nav-item" title="Schedules">
                <CalendarClock size={18} />
                <span>Schedules</span>
              </NavLink>
              <NavLink to="/admin/billing/charge-categories" className="nav-item" title="Charge Categories">
                <Tag size={18} />
                <span>Charge Categories</span>
              </NavLink>
              <NavLink to="/admin/billing/charge-types" className="nav-item" title="Charge Types">
                <DollarSign size={18} />
                <span>Charge Types</span>
              </NavLink>
              <NavLink to="/admin/billing/meter-setup" className="nav-item" title="Meter Setup">
                <SquareKanban size={18} />
                <span>Meter Setup</span>
              </NavLink>
              <NavLink to="/admin/billing/settings" className="nav-item" title="Settings">
                <Settings size={18} />
                <span>Settings</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Accounts Receivable Section */}
          <PermissionGuard permission="ar.read">
            <NavSection label="Accounts Receivable" storageKey="ar" defaultOpen isCollapsed={isCollapsed}>
              <NavLink to="/admin/ar/receipts" className="nav-item" title="Receipts">
                <Banknote size={18} />
                <span>Receipts</span>
              </NavLink>
              <NavLink to="/admin/ar/aging" className="nav-item" title="Aging Report">
                <Clock size={18} />
                <span>Aging Report</span>
              </NavLink>
              <NavLink to="/admin/ar/collections" className="nav-item" title="Collections">
                <BarChart3 size={18} />
                <span>Collections</span>
              </NavLink>
              <NavLink to="/admin/ar/refunds" className="nav-item" title="Refunds">
                <RotateCcw size={18} />
                <span>Refunds</span>
              </NavLink>
              <NavLink to="/admin/ar/statements" className="nav-item" title="Statements">
                <FileText size={18} />
                <span>Statements</span>
              </NavLink>
              <NavLink to="/admin/ar/credits" className="nav-item" title="Tenant Credits">
                <Coins size={18} />
                <span>Tenant Credits</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Accounts Payable Section */}
          <PermissionGuard permission="ap.read">
            <NavSection label="Accounts Payable" storageKey="ap" defaultOpen isCollapsed={isCollapsed}>
              <NavLink to="/admin/ap/invoices" className="nav-item" title="AP Invoices">
                <FileText size={18} />
                <span>AP Invoices</span>
              </NavLink>
              <NavLink to="/admin/ap/vouchers" className="nav-item" title="Payment Vouchers">
                <Wallet size={18} />
                <span>Payment Vouchers</span>
              </NavLink>
              <NavLink to="/admin/ap/expenses" className="nav-item" title="Expenses">
                <Receipt size={18} />
                <span>Expenses</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Finance / GL Section */}
          <PermissionGuard permission="finance.read">
            <NavSection label="Finance" storageKey="finance" defaultOpen isCollapsed={isCollapsed}>
              <NavLink to="/admin/gl/accounts" className="nav-item" title="Chart of Accounts">
                <BookOpen size={18} />
                <span>Chart of Accounts</span>
              </NavLink>
              <NavLink to="/admin/gl/journal-entries" className="nav-item" title="Journal Entries">
                <ClipboardList size={18} />
                <span>Journal Entries</span>
              </NavLink>
              <NavLink to="/admin/gl/fiscal-periods" className="nav-item" title="Fiscal Periods">
                <CalendarClock size={18} />
                <span>Fiscal Periods</span>
              </NavLink>
              <NavLink to="/admin/gl/trial-balance" className="nav-item" title="Trial Balance">
                <Scale size={18} />
                <span>Trial Balance</span>
              </NavLink>
              <NavLink to="/admin/gl/pnl" className="nav-item" title="Profit & Loss">
                <PieChart size={18} />
                <span>Profit & Loss</span>
              </NavLink>
              <NavLink to="/admin/gl/balance-sheet" className="nav-item" title="Balance Sheet">
                <Landmark size={18} />
                <span>Balance Sheet</span>
              </NavLink>
              <NavLink to="/admin/gl/cash-flow" className="nav-item" title="Cash Flow">
                <Banknote size={18} />
                <span>Cash Flow</span>
              </NavLink>
              <NavLink to="/admin/budgets" className="nav-item" title="Budgets">
                <Wallet size={18} />
                <span>Budgets</span>
              </NavLink>
              <NavLink to="/admin/assets" className="nav-item" title="Fixed Assets">
                <Box size={18} />
                <span>Fixed Assets</span>
              </NavLink>
              <NavLink to="/admin/banking" className="nav-item" title="Banking">
                <Building2 size={18} />
                <span>Banking</span>
              </NavLink>
              <NavLink to="/admin/banking/gateway-transactions" className="nav-item" title="Gateway Payments">
                <Zap size={18} />
                <span>Gateway Payments</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          <FeatureGate flag="workflowEnabled">
            <PermissionGuard permission="workflows.read">
              <NavSection label="Workflows" storageKey="wf" isCollapsed={isCollapsed}>
                <NavLink to="/tasks" className="nav-item" title="My Tasks">
                  <Inbox size={18} />
                  <span>My Tasks</span>
                </NavLink>
                <NavLink to="/admin/workflows" className="nav-item" title="Workflow Engine">
                  <Workflow size={18} />
                  <span>Workflow Engine</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Maintenance Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard permission="maintenance.read">
              <NavSection label="Maintenance" storageKey="maintenance" isCollapsed={isCollapsed}>
                <NavLink to="/admin/maintenance" className="nav-item" end>
                  <BarChart3 size={18} />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/admin/maintenance/tickets" className="nav-item" title="Tickets">
                  <Wrench size={18} />
                  <span>Tickets</span>
                </NavLink>
                <NavLink to="/admin/maintenance/technicians" className="nav-item" title="Technician Schedule">
                  <Calendar size={18} />
                  <span>Technician Schedule</span>
                </NavLink>
                <NavLink to="/admin/maintenance/sla-config" className="nav-item" title="SLA Configuration">
                  <Shield size={18} />
                  <span>SLA Configuration</span>
                </NavLink>
                <NavLink to="/admin/maintenance/pm" className="nav-item" title="PM Schedules">
                  <CalendarClock size={18} />
                  <span>PM Schedules</span>
                </NavLink>
                <NavLink to="/admin/maintenance/pm/calendar" className="nav-item" title="PM Calendar">
                  <Calendar size={18} />
                  <span>PM Calendar</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Facility Management Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard permission="facility.read">
              <NavSection label="Facility" storageKey="facility" isCollapsed={isCollapsed}>
                <NavLink to="/admin/facility/assets" className="nav-item" title="Asset Registry">
                  <Box size={18} />
                  <span>Asset Registry</span>
                </NavLink>
                <NavLink to="/admin/facility/cam-costs" className="nav-item" title="CAM Costs">
                  <Receipt size={18} />
                  <span>CAM Costs</span>
                </NavLink>
                <NavLink to="/admin/facility/schedule" className="nav-item" title="Booking Schedule">
                  <CalendarDays size={18} />
                  <span>Booking Schedule</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Inventory Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard permission="inventory.read">
              <NavSection label="Inventory" storageKey="inventory" isCollapsed={isCollapsed}>
                <NavLink to="/admin/inventory/dashboard" className="nav-item" title="Dashboard">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/admin/inventory/items" className="nav-item" title="Item Catalog">
                  <Package size={18} />
                  <span>Item Catalog</span>
                </NavLink>
                <NavLink to="/admin/inventory/stock" className="nav-item" title="Stock Levels">
                  <Layers size={18} />
                  <span>Stock Levels</span>
                </NavLink>
                <NavLink to="/admin/inventory/stores" className="nav-item" title="Stores">
                  <Store size={18} />
                  <span>Stores</span>
                </NavLink>
                <NavLink to="/admin/inventory/movements" className="nav-item" title="Movements">
                  <Activity size={18} />
                  <span>Movements</span>
                </NavLink>
                <NavLink to="/admin/inventory/purchase-requisitions" className="nav-item" title="Purchase Requisitions">
                  <ClipboardList size={18} />
                  <span>Purchase Requisitions</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Housekeeping Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard permission="housekeeping.read">
              <NavSection label="Housekeeping" storageKey="housekeeping" isCollapsed={isCollapsed}>
                <NavLink to="/admin/housekeeping/dashboard" className="nav-item" title="Dashboard">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/admin/housekeeping" className="nav-item" title="Tasks">
                  <Sparkles size={18} />
                  <span>Tasks</span>
                </NavLink>
                <NavLink to="/admin/housekeeping/schedules" className="nav-item" title="Schedules">
                  <Calendar size={18} />
                  <span>Schedules</span>
                </NavLink>
                <NavLink to="/admin/housekeeping/zones" className="nav-item" title="Zones">
                  <MapPin size={18} />
                  <span>Zones</span>
                </NavLink>
                <NavLink to="/admin/housekeeping/inspections" className="nav-item" title="Inspections">
                  <ClipboardCheck size={18} />
                  <span>Inspections</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Security Section */}
          <FeatureGate flag="maintenanceEnabled">
            <PermissionGuard permission="security.read">
              <NavSection label="Security" storageKey="security" isCollapsed={isCollapsed}>
                <NavLink to="/admin/security/dashboard" className="nav-item" title="Dashboard">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/admin/security/incidents" className="nav-item" title="Incidents">
                  <Shield size={18} />
                  <span>Incidents</span>
                </NavLink>
                <NavLink to="/admin/security/patrol" className="nav-item" title="Patrol Logs">
                  <MapPin size={18} />
                  <span>Patrol Logs</span>
                </NavLink>
                <NavLink to="/admin/security/patrol/schedules" className="nav-item" title="Patrol Schedules">
                  <Clock size={18} />
                  <span>Patrol Schedules</span>
                </NavLink>
                <NavLink to="/admin/security/patrol/scan" className="nav-item" title="Patrol Scan">
                  <QrCode size={18} />
                  <span>Patrol Scan</span>
                </NavLink>
                <NavLink to="/admin/security/access-events" className="nav-item" title="Access Events">
                  <DoorOpen size={18} />
                  <span>Access Events</span>
                </NavLink>
                <NavLink to="/admin/security/blacklist" className="nav-item" title="Visitor Blacklist">
                  <Shield size={18} />
                  <span>Visitor Blacklist</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Documents Section */}
          <FeatureGate flag="documentVaultEnabled">
            <PermissionGuard permission="documents.read">
              <NavSection label="Documents" storageKey="docs" isCollapsed={isCollapsed}>
                <NavLink to="/documents" className="nav-item" title="Document Vault">
                  <FolderOpen size={18} />
                  <span>Document Vault</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>

          {/* Notifications Section */}
          <PermissionGuard permission={['notifications.send', 'notifications.logs', 'notifications.manage']}>
            <NavSection label="Notifications" storageKey="notif" isCollapsed={isCollapsed}>
              <NavLink to="/notifications" className="nav-item" title="All Notifications">
                <Bell size={18} />
                <span>All Notifications</span>
              </NavLink>
              <FeatureGate flag="notificationsAdminEnabled">
                <PermissionGuard permission="notifications.logs">
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
            <PermissionGuard permission="mall.read">
              <NavSection label="Shopping Mall" storageKey="mall" isCollapsed={isCollapsed}>
                <NavLink to="/admin/mall" className="nav-item" end>
                  <Store size={18} />
                  <span>Mall Dashboard</span>
                </NavLink>
                <NavLink to="/admin/mall/shops" className="nav-item" title="Shop Directory">
                  <Building2 size={18} />
                  <span>Shop Directory</span>
                </NavLink>
                <NavLink to="/admin/mall/gto" className="nav-item" title="GTO Management">
                  <TrendingUp size={18} />
                  <span>GTO Management</span>
                </NavLink>
                <NavLink to="/admin/mall/cam" className="nav-item" title="CAM Management">
                  <DollarSign size={18} />
                  <span>CAM Management</span>
                </NavLink>
                <NavLink to="/admin/mall/events" className="nav-item" title="Events">
                  <Calendar size={18} />
                  <span>Events</span>
                </NavLink>
                <NavLink to="/admin/mall/footfall" className="nav-item" title="Footfall Analytics">
                  <Activity size={18} />
                  <span>Footfall Analytics</span>
                </NavLink>
                <NavLink to="/admin/mall/pos" className="nav-item" title="POS Integration">
                  <ShoppingCart size={18} />
                  <span>POS Integration</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>
          {/* Community Section */}
          <PermissionGuard permission="community.read">
            <NavSection label="Community" storageKey="community" isCollapsed={isCollapsed}>
              <NavLink to="/admin/community" className="nav-item" title="Community Admin">
                <Megaphone size={18} />
                <span>Community Admin</span>
              </NavLink>
              <NavLink to="/admin/portal/quick-actions" className="nav-item" title="Portal Quick Actions">
                <Zap size={18} />
                <span>Portal Quick Actions</span>
              </NavLink>
              <NavLink to="/admin/portal/analytics" className="nav-item" title="Portal Analytics">
                <Activity size={18} />
                <span>Portal Analytics</span>
              </NavLink>
              <NavLink to="/admin/access-cards" className="nav-item" title="Access Cards">
                <CreditCard size={18} />
                <span>Access Cards</span>
              </NavLink>
              <NavLink to="/admin/portal/branding" className="nav-item" title="Portal Branding">
                <Palette size={18} />
                <span>Portal Branding</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Condo Section */}
          <FeatureGate flag="condoModuleEnabled">
            <PermissionGuard permission="condo.read">
              <NavSection label="Condo" storageKey="condo" isCollapsed={isCollapsed}>
                <NavLink to="/admin/condo/smart-meters" className="nav-item" title="Smart Meters">
                  <Zap size={18} />
                  <span>Smart Meters</span>
                </NavLink>
                <NavLink to="/admin/condo/funds" className="nav-item" title="Funds">
                  <Wallet size={18} />
                  <span>Funds</span>
                </NavLink>
                <NavLink to="/admin/condo/meetings" className="nav-item" title="Meetings (AGM)">
                  <Users2 size={18} />
                  <span>Meetings (AGM)</span>
                </NavLink>
                <NavLink to="/admin/condo/bylaws" className="nav-item" title="By-Laws">
                  <Gavel size={18} />
                  <span>By-Laws</span>
                </NavLink>
              </NavSection>
            </PermissionGuard>
          </FeatureGate>
          <PermissionGuard permission="portal.read">
            <NavSection label="Tenant Portal" storageKey="portal" isCollapsed={isCollapsed}>
              <NavLink to="/portal" className="nav-item" title="Portal Dashboard">
                <Home size={18} />
                <span>Portal Dashboard</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* BI & Analytics */}
          <PermissionGuard permission="reports.view">
            <NavSection label="Analytics" storageKey="bi" isCollapsed={isCollapsed}>
              <NavLink to="/admin/bi" className="nav-item" title="Executive Dashboard">
                <BarChart3 size={18} />
                <span>Executive Dashboard</span>
              </NavLink>
              <NavLink to="/admin/bi/reports" className="nav-item" title="BI Reports">
                <PieChart size={18} />
                <span>BI Reports</span>
              </NavLink>
              <NavLink to="/admin/bi/anomalies" className="nav-item" title="Anomaly Dashboard">
                <Activity size={18} />
                <span>Anomaly Dashboard</span>
              </NavLink>
              <NavLink to="/reports" className="nav-item" title="Reports">
                <FileText size={18} />
                <span>Reports</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Developer / Integrations Section */}
          <PermissionGuard permission="developer.read">
            <NavSection label="Developer" storageKey="developer" isCollapsed={isCollapsed}>
              <NavLink to="/admin/developer/integrations" className="nav-item" title="Integrations">
                <Plug size={18} />
                <span>Integrations</span>
              </NavLink>
              <NavLink to="/admin/developer/webhooks" className="nav-item" title="Webhooks">
                <Webhook size={18} />
                <span>Webhooks</span>
              </NavLink>
              <NavLink to="/admin/developer/api-keys" className="nav-item" title="API Keys">
                <Key size={18} />
                <span>API Keys</span>
              </NavLink>
              <NavLink to="/admin/developer/bms" className="nav-item" title="BMS Devices">
                <Server size={18} />
                <span>BMS Devices</span>
              </NavLink>
            </NavSection>
          </PermissionGuard>

          {/* Settings Section — "Company & Features" deliberately omitted here: it's the
              same /admin/company page already reachable via Organization → Company, and
              including it here would leak this section open to anyone with company.manage
              even though they have no actual Settings-module permission. */}
          <PermissionGuard permission={['settings.read', 'settings.manage']}>
            <NavSection label="Settings" storageKey="settings" isCollapsed={isCollapsed}>
              <NavLink to="/settings/security" className="nav-item" title="Security">
                <Shield size={18} />
                <span>Security</span>
              </NavLink>
              <NavLink to="/settings/notifications" className="nav-item" title="Notification Prefs">
                <Bell size={18} />
                <span>Notification Prefs</span>
              </NavLink>
              <NavLink to="/settings/profile" className="nav-item" title="My Profile">
                <User size={18} />
                <span>My Profile</span>
              </NavLink>
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
