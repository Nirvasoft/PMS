import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { useGetPortalDashboardQuery } from '../../store/api/portalApi';
import { useLogoutMutation } from '../../store/api/authApi';
import ThemeToggle from '../../components/ThemeToggle';
import NotificationBell from '../../components/notifications/NotificationBell';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Receipt, Wrench, FileText, Users, User, LogOut,
  Building2, ChevronRight, UserPlus, CalendarDays, Megaphone, Truck, FileCheck, Bell,
} from 'lucide-react';

export default function PortalLayout() {
  const navigate = useNavigate();
  const { user } = useAppSelector((s) => s.auth);
  const [logout] = useLogoutMutation();
  const { data: dashboard } = useGetPortalDashboardQuery();

  const handleLogout = async () => {
    await logout({ allDevices: false });
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const propertyName = dashboard?.property?.name || 'Tenant Portal';
  const residentName = dashboard?.resident
    ? `${dashboard.resident.firstName} ${dashboard.resident.lastName}`
    : user?.email?.split('@')[0] || 'Tenant';
  const unitInfo = dashboard?.unit
    ? `Unit ${dashboard.unit.unitNumber}`
    : '';

  const branding = (dashboard as any)?.branding;
  const primaryColor = branding?.primaryColor || '#6366f1';

  return (
    <div className="app-layout" style={{ '--portal-primary': primaryColor } as React.CSSProperties}>
      <aside className="sidebar portal-sidebar">
        <div className="sidebar-header">
          <div className="portal-brand-icon" style={{ background: primaryColor }}>
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" style={{ height: 20, maxWidth: 36, objectFit: 'contain' }} />
            ) : (
              <Building2 size={22} />
            )}
          </div>
          <div className="portal-brand-text">
            <span className="sidebar-brand">{propertyName}</span>
            {unitInfo && <span className="portal-unit-badge">{unitInfo}</span>}
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/portal" end className="nav-item" id="portal-nav-dashboard">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/portal/invoices" className="nav-item" id="portal-nav-invoices">
            <Receipt size={18} />
            <span>Invoices & Payments</span>
          </NavLink>
          <NavLink to="/portal/maintenance" className="nav-item" id="portal-nav-maintenance">
            <Wrench size={18} />
            <span>Maintenance</span>
          </NavLink>
          <NavLink to="/portal/lease" className="nav-item" id="portal-nav-lease">
            <FileText size={18} />
            <span>My Lease</span>
          </NavLink>
          <NavLink to="/portal/residents" className="nav-item" id="portal-nav-residents">
            <Users size={18} />
            <span>Residents</span>
          </NavLink>
          <NavLink to="/portal/profile" className="nav-item" id="portal-nav-profile">
            <User size={18} />
            <span>My Profile</span>
          </NavLink>
          <NavLink to="/settings/notifications" className="nav-item" id="portal-nav-notif-prefs">
            <Bell size={18} />
            <span>Notification Preferences</span>
          </NavLink>
          <NavLink to="/portal/kyc" className="nav-item" id="portal-nav-kyc">
            <FileCheck size={18} />
            <span>KYC Documents</span>
          </NavLink>

          <div className="portal-nav-divider" />

          <NavLink to="/portal/visitors" className="nav-item" id="portal-nav-visitors">
            <UserPlus size={18} />
            <span>Visitors</span>
          </NavLink>
          <NavLink to="/portal/bookings" className="nav-item" id="portal-nav-bookings">
            <CalendarDays size={18} />
            <span>Facility Bookings</span>
          </NavLink>
          <NavLink to="/portal/community" className="nav-item" id="portal-nav-community">
            <Megaphone size={18} />
            <span>Community</span>
          </NavLink>
          <NavLink to="/portal/move-requests" className="nav-item" id="portal-nav-move">
            <Truck size={18} />
            <span>Move Requests</span>
          </NavLink>

          {/* Quick link back to admin if user has admin roles */}
          {user?.roles?.some(r => !['tenant', 'resident'].includes(r)) && (
            <div className="portal-admin-link">
              <NavLink to="/dashboard" className="nav-item">
                <ChevronRight size={18} />
                <span>Admin Panel</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <div className="user-details">
              <span className="user-name">{residentName}</span>
              <span className="user-role">Tenant</span>
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
