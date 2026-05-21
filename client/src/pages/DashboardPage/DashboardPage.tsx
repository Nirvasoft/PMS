import { useNavigate, NavLink, Outlet } from 'react-router-dom';
import { useLogoutMutation } from '../../store/api/authApi';
import { useGetPropertyStatsQuery } from '../../store/api/organizationApi';
import { useAppSelector } from '../../store';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import { FeatureGate } from '../../components/guards/FeatureGate';
import {
  Building2, LayoutDashboard, Shield, LogOut, Settings, ChevronRight,
  User, Users, Key, GitBranch, Home, MapPin, Workflow, Inbox, Bell, Briefcase, FileText, FolderOpen,
  Users2, ClipboardList, Target, Megaphone, Car, Link2, Ticket, Activity, Receipt, CalendarClock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationBell from '../../components/notifications/NotificationBell';
import ThemeToggle from '../../components/ThemeToggle';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import AnalyticsDashboard from './AnalyticsDashboard';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { user } = useAppSelector((s) => s.auth);
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

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="nav-item">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>

          {/* Admin Section */}
          <PermissionGuard permission="users.read">
            <div className="nav-section-label">Administration</div>
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

          {/* Organization Section */}
          <div className="nav-section-label">Organization</div>
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

          {/* CRM Section */}
          <FeatureGate flag="crmEnabled">
            <div className="nav-section-label">CRM</div>
            <NavLink to="/admin/crm/leads" className="nav-item">
              <Target size={18} />
              <span>Lead Pipeline</span>
            </NavLink>
            <NavLink to="/admin/crm/campaigns" className="nav-item">
              <Megaphone size={18} />
              <span>Campaigns</span>
            </NavLink>
          </FeatureGate>

          {/* Parking Section */}
          <FeatureGate flag="parkingEnabled">
            <div className="nav-section-label">Parking</div>
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
          </FeatureGate>

          {/* Billing Section */}
          <div className="nav-section-label">Billing</div>
          <NavLink to="/admin/billing/invoices" className="nav-item">
            <Receipt size={18} />
            <span>Invoices</span>
          </NavLink>
          <NavLink to="/admin/billing/schedules" className="nav-item">
            <CalendarClock size={18} />
            <span>Schedules</span>
          </NavLink>

          {/* Workflow Section */}
          <FeatureGate flag="workflowEnabled">
            <div className="nav-section-label">Workflows</div>
            <NavLink to="/tasks" className="nav-item">
              <Inbox size={18} />
              <span>My Tasks</span>
            </NavLink>
            <NavLink to="/admin/workflows" className="nav-item">
              <Workflow size={18} />
              <span>Workflow Engine</span>
            </NavLink>
          </FeatureGate>

          {/* Documents Section */}
          <FeatureGate flag="documentVaultEnabled">
            <div className="nav-section-label">Documents</div>
            <NavLink to="/documents" className="nav-item">
              <FolderOpen size={18} />
              <span>Document Vault</span>
            </NavLink>
          </FeatureGate>

          {/* Notifications Section */}
          <div className="nav-section-label">Notifications</div>
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

          {/* Settings Section */}
          <div className="nav-section-label">Settings</div>
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
  return <AnalyticsDashboard />;
}
