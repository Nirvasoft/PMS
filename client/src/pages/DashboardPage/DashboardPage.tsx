import { useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLogoutMutation } from '../../store/api/authApi';
import { useGetPropertyStatsQuery } from '../../store/api/organizationApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import { useAppSelector, useAppDispatch } from '../../store';
import { setSelectedProperty } from '../../store/slices/propertiesSlice';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import { FeatureGate } from '../../components/guards/FeatureGate';
import {
  Building2, LayoutDashboard, Shield, LogOut, Settings, ChevronRight, ChevronDown,
  User, Users, Key, GitBranch, Home, MapPin, Workflow, Inbox, Bell, Briefcase, FileText, FolderOpen,
  Users2, ClipboardList, Target, Megaphone, Car, Link2, Ticket, Activity, Receipt, CalendarClock,
  Banknote, BarChart3, Clock, RotateCcw,
  BookOpen, Calculator, Scale, PieChart, Landmark, Wallet, Box,
  Wrench, Calendar, Package, Layers, Sparkles,
  Store, TrendingUp, DollarSign,
  Zap, Gavel,
  Plug, Webhook, Server,
} from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationBell from '../../components/notifications/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import AnalyticsDashboard from './AnalyticsDashboard';
import ExpiringDocumentsWidget from '../../components/widgets/ExpiringDocumentsWidget';
import { useState, useCallback, useEffect, type ReactNode } from 'react';

// ─── Collapsible Nav Section ──────────────────

function NavSection({ label, children, defaultOpen = false, storageKey }: {
  label: string; children: ReactNode; defaultOpen?: boolean; storageKey: string;
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
  const { data: propertiesRes } = useGetPropertiesQuery({ limit: 100 });
  const properties = propertiesRes?.data || [];
  const [logout] = useLogoutMutation();
  useRealtimeNotifications(); // Real-time WS notifications

  const handleLogout = async () => {
    await logout({ allDevices: false });
    toast.success('Signed out successfully');
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Building2 size={28} />
          <span className="sidebar-brand">PMS</span>
        </div>

        {/* Property Selector */}
        {properties.length > 0 && (
          <div className="sidebar-property-selector">
            <label htmlFor="sidebar-prop-select">Active Property</label>
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
          </div>
        )}

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="nav-item">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>

          {/* Admin Section */}
          <NavSection label="Administration" storageKey="admin" defaultOpen>
            <PermissionGuard permission="users.read">
              <NavLink to="/admin/users" className="nav-item">
                <Users size={18} />
                <span>Users</span>
              </NavLink>
            </PermissionGuard>
            <PermissionGuard permission="roles.read">
              <NavLink to="/admin/roles" className="nav-item">
                <Key size={18} />
                <span>Roles & Permissions</span>
              </NavLink>
            </PermissionGuard>
            <PermissionGuard permission="departments.read">
              <NavLink to="/admin/departments" className="nav-item">
                <GitBranch size={18} />
                <span>Departments</span>
              </NavLink>
            </PermissionGuard>
            <NavLink to="/admin/positions" className="nav-item">
              <Briefcase size={18} />
              <span>Positions</span>
            </NavLink>
          </NavSection>

          {/* Organization Section */}
          <NavSection label="Organization" storageKey="org" defaultOpen>
            <NavLink to="/admin/company" className="nav-item">
              <Building2 size={18} />
              <span>Company</span>
            </NavLink>
            <PermissionGuard permission="properties.read">
              <NavLink to="/admin/properties" className="nav-item">
                <Home size={18} />
                <span>Properties</span>
              </NavLink>
            </PermissionGuard>
            <PermissionGuard permission="tenants.read">
              <NavLink to="/admin/tenants" className="nav-item">
                <Users2 size={18} />
                <span>Tenants</span>
              </NavLink>
            </PermissionGuard>
            <FeatureGate flag="leasingEnabled">
              <PermissionGuard permission="leases.read">
                <NavLink to="/admin/leases" className="nav-item">
                  <ClipboardList size={18} />
                  <span>Leases</span>
                </NavLink>
              </PermissionGuard>
            </FeatureGate>
          </NavSection>

          {/* CRM Section */}
          <FeatureGate flag="crmEnabled">
            <NavSection label="CRM" storageKey="crm" defaultOpen>
              <NavLink to="/admin/crm/leads" className="nav-item">
                <Target size={18} />
                <span>Lead Pipeline</span>
              </NavLink>
              <NavLink to="/admin/crm/campaigns" className="nav-item">
                <Megaphone size={18} />
                <span>Campaigns</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Parking Section */}
          <FeatureGate flag="parkingEnabled">
            <NavSection label="Parking" storageKey="parking">
              <NavLink to="/admin/parking" className="nav-item">
                <Car size={18} />
                <span>Parking Overview</span>
              </NavLink>
              <NavLink to="/admin/parking/allocations" className="nav-item">
                <Link2 size={18} />
                <span>Allocations</span>
              </NavLink>
              <NavLink to="/admin/parking/visitors" className="nav-item">
                <span className="nav-icon"><Ticket size={16} /></span>
                <span className="nav-label">Visitor Parking</span>
              </NavLink>
              <NavLink to="/admin/parking/gate-logs" className="nav-item">
                <span className="nav-icon"><Activity size={16} /></span>
                <span className="nav-label">Gate Logs</span>
              </NavLink>
              <NavLink to="/admin/parking/vehicles" className="nav-item">
                <span className="nav-icon"><Car size={16} /></span>
                <span className="nav-label">Vehicle Registry</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Billing Section */}
          <NavSection label="Billing" storageKey="billing" defaultOpen>
            <NavLink to="/admin/billing/invoices" className="nav-item">
              <Receipt size={18} />
              <span>Invoices</span>
            </NavLink>
            <NavLink to="/admin/billing/schedules" className="nav-item">
              <CalendarClock size={18} />
              <span>Schedules</span>
            </NavLink>
          </NavSection>

          {/* Accounts Receivable Section */}
          <NavSection label="Accounts Receivable" storageKey="ar" defaultOpen>
            <NavLink to="/admin/ar/receipts" className="nav-item">
              <Banknote size={18} />
              <span>Receipts</span>
            </NavLink>
            <NavLink to="/admin/ar/aging" className="nav-item">
              <Clock size={18} />
              <span>Aging Report</span>
            </NavLink>
            <NavLink to="/admin/ar/collections" className="nav-item">
              <BarChart3 size={18} />
              <span>Collections</span>
            </NavLink>
            <NavLink to="/admin/ar/refunds" className="nav-item">
              <RotateCcw size={18} />
              <span>Refunds</span>
            </NavLink>
            <NavLink to="/admin/ar/statements" className="nav-item">
              <FileText size={18} />
              <span>Statements</span>
            </NavLink>
          </NavSection>

          {/* Finance / GL Section */}
          <NavSection label="Finance" storageKey="finance" defaultOpen>
            <NavLink to="/admin/gl/accounts" className="nav-item">
              <BookOpen size={18} />
              <span>Chart of Accounts</span>
            </NavLink>
            <NavLink to="/admin/gl/journal-entries" className="nav-item">
              <ClipboardList size={18} />
              <span>Journal Entries</span>
            </NavLink>
            <NavLink to="/admin/gl/fiscal-periods" className="nav-item">
              <CalendarClock size={18} />
              <span>Fiscal Periods</span>
            </NavLink>
            <NavLink to="/admin/gl/trial-balance" className="nav-item">
              <Scale size={18} />
              <span>Trial Balance</span>
            </NavLink>
            <NavLink to="/admin/gl/pnl" className="nav-item">
              <PieChart size={18} />
              <span>Profit & Loss</span>
            </NavLink>
            <NavLink to="/admin/gl/balance-sheet" className="nav-item">
              <Landmark size={18} />
              <span>Balance Sheet</span>
            </NavLink>
            <NavLink to="/admin/gl/cash-flow" className="nav-item">
              <Banknote size={18} />
              <span>Cash Flow</span>
            </NavLink>
            <NavLink to="/admin/budgets" className="nav-item">
              <Wallet size={18} />
              <span>Budgets</span>
            </NavLink>
            <NavLink to="/admin/assets" className="nav-item">
              <Box size={18} />
              <span>Fixed Assets</span>
            </NavLink>
            <NavLink to="/admin/banking" className="nav-item">
              <Building2 size={18} />
              <span>Banking</span>
            </NavLink>
          </NavSection>

          <FeatureGate flag="workflowEnabled">
            <NavSection label="Workflows" storageKey="wf">
              <NavLink to="/tasks" className="nav-item">
                <Inbox size={18} />
                <span>My Tasks</span>
              </NavLink>
              <NavLink to="/admin/workflows" className="nav-item">
                <Workflow size={18} />
                <span>Workflow Engine</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Maintenance Section */}
          <FeatureGate flag="maintenanceEnabled">
            <NavSection label="Maintenance" storageKey="maintenance">
              <NavLink to="/admin/maintenance" className="nav-item" end>
                <BarChart3 size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/admin/maintenance/tickets" className="nav-item">
                <Wrench size={18} />
                <span>Tickets</span>
              </NavLink>
              <NavLink to="/admin/maintenance/technicians" className="nav-item">
                <Calendar size={18} />
                <span>Technician Schedule</span>
              </NavLink>
              <NavLink to="/admin/maintenance/sla-config" className="nav-item">
                <Shield size={18} />
                <span>SLA Configuration</span>
              </NavLink>
              <NavLink to="/admin/maintenance/pm" className="nav-item">
                <CalendarClock size={18} />
                <span>PM Schedules</span>
              </NavLink>
              <NavLink to="/admin/maintenance/pm/calendar" className="nav-item">
                <Calendar size={18} />
                <span>PM Calendar</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Facility Management Section */}
          <FeatureGate flag="maintenanceEnabled">
            <NavSection label="Facility" storageKey="facility">
              <NavLink to="/admin/facility/assets" className="nav-item">
                <Box size={18} />
                <span>Asset Registry</span>
              </NavLink>
              <NavLink to="/admin/facility/cam-costs" className="nav-item">
                <Receipt size={18} />
                <span>CAM Costs</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Inventory Section */}
          <FeatureGate flag="maintenanceEnabled">
            <NavSection label="Inventory" storageKey="inventory">
              <NavLink to="/admin/inventory/items" className="nav-item">
                <Package size={18} />
                <span>Item Catalog</span>
              </NavLink>
              <NavLink to="/admin/inventory/stock" className="nav-item">
                <Layers size={18} />
                <span>Stock Levels</span>
              </NavLink>
              <NavLink to="/admin/inventory/movements" className="nav-item">
                <Activity size={18} />
                <span>Movements</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Housekeeping Section */}
          <FeatureGate flag="maintenanceEnabled">
            <NavSection label="Housekeeping" storageKey="housekeeping">
              <NavLink to="/admin/housekeeping" className="nav-item">
                <Sparkles size={18} />
                <span>Tasks & Schedules</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Security Section */}
          <FeatureGate flag="maintenanceEnabled">
            <NavSection label="Security" storageKey="security">
              <NavLink to="/admin/security/incidents" className="nav-item">
                <Shield size={18} />
                <span>Incidents</span>
              </NavLink>
              <NavLink to="/admin/security/patrol" className="nav-item">
                <MapPin size={18} />
                <span>Patrol Mgmt</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Documents Section */}
          <FeatureGate flag="documentVaultEnabled">
            <NavSection label="Documents" storageKey="docs">
              <NavLink to="/documents" className="nav-item">
                <FolderOpen size={18} />
                <span>Document Vault</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Notifications Section */}
          <NavSection label="Notifications" storageKey="notif">
            <NavLink to="/notifications" className="nav-item">
              <Bell size={18} />
              <span>All Notifications</span>
            </NavLink>
            <FeatureGate flag="notificationsAdminEnabled">
              <NavLink to="/admin/notifications" className="nav-item">
                <FileText size={18} />
                <span>Logs & Templates</span>
              </NavLink>
            </FeatureGate>
          </NavSection>

          {/* Mall Section */}
          <FeatureGate flag="mallModuleEnabled">
            <NavSection label="Shopping Mall" storageKey="mall">
              <NavLink to="/admin/mall" className="nav-item" end>
                <Store size={18} />
                <span>Mall Dashboard</span>
              </NavLink>
              <NavLink to="/admin/mall/shops" className="nav-item">
                <Building2 size={18} />
                <span>Shop Directory</span>
              </NavLink>
              <NavLink to="/admin/mall/gto" className="nav-item">
                <TrendingUp size={18} />
                <span>GTO Management</span>
              </NavLink>
              <NavLink to="/admin/mall/cam" className="nav-item">
                <DollarSign size={18} />
                <span>CAM Management</span>
              </NavLink>
              <NavLink to="/admin/mall/events" className="nav-item">
                <Calendar size={18} />
                <span>Events</span>
              </NavLink>
              <NavLink to="/admin/mall/footfall" className="nav-item">
                <Activity size={18} />
                <span>Footfall Analytics</span>
              </NavLink>
            </NavSection>
          </FeatureGate>

          {/* Condo Section */}
          <FeatureGate flag="condoModuleEnabled">
            <NavSection label="Condo" storageKey="condo">
              <NavLink to="/admin/condo/smart-meters" className="nav-item">
                <Zap size={18} />
                <span>Smart Meters</span>
              </NavLink>
              <NavLink to="/admin/condo/funds" className="nav-item">
                <Wallet size={18} />
                <span>Funds</span>
              </NavLink>
              <NavLink to="/admin/condo/meetings" className="nav-item">
                <Users2 size={18} />
                <span>Meetings (AGM)</span>
              </NavLink>
              <NavLink to="/admin/condo/bylaws" className="nav-item">
                <Gavel size={18} />
                <span>By-Laws</span>
              </NavLink>
            </NavSection>
          </FeatureGate>
          <NavSection label="Tenant Portal" storageKey="portal">
            <NavLink to="/portal" className="nav-item">
              <Home size={18} />
              <span>Portal Dashboard</span>
            </NavLink>
          </NavSection>

          {/* BI & Analytics */}
          <NavSection label="Analytics" storageKey="bi">
            <NavLink to="/admin/bi" className="nav-item">
              <BarChart3 size={18} />
              <span>Executive Dashboard</span>
            </NavLink>
            <NavLink to="/reports" className="nav-item">
              <FileText size={18} />
              <span>Reports</span>
            </NavLink>
          </NavSection>

          {/* Developer / Integrations Section */}
          <NavSection label="Developer" storageKey="developer">
            <NavLink to="/admin/developer/integrations" className="nav-item">
              <Plug size={18} />
              <span>Integrations</span>
            </NavLink>
            <NavLink to="/admin/developer/webhooks" className="nav-item">
              <Webhook size={18} />
              <span>Webhooks</span>
            </NavLink>
            <NavLink to="/admin/developer/api-keys" className="nav-item">
              <Key size={18} />
              <span>API Keys</span>
            </NavLink>
            <NavLink to="/admin/developer/bms" className="nav-item">
              <Server size={18} />
              <span>BMS Devices</span>
            </NavLink>
          </NavSection>

          {/* Settings Section */}
          <NavSection label="Settings" storageKey="settings">
            <NavLink to="/settings/security" className="nav-item">
              <Shield size={18} />
              <span>Security</span>
            </NavLink>
            <NavLink to="/settings/notifications" className="nav-item">
              <Bell size={18} />
              <span>Notification Prefs</span>
            </NavLink>
            <NavLink to="/settings/profile" className="nav-item">
              <User size={18} />
              <span>My Profile</span>
            </NavLink>
          </NavSection>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <div className="user-details">
              <span className="user-name">{user?.email?.split('@')[0]}</span>
              <span className="user-role">{user?.roles?.[0] || 'User'}</span>
            </div>
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
      <AnalyticsDashboard />
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
