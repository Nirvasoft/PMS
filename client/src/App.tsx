import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { ProtectedRoute, PublicRoute } from './components/RouteGuards';
import LoginPage from './pages/LoginPage/LoginPage';
import MfaVerifyPage from './pages/MfaVerifyPage/MfaVerifyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage/ResetPasswordPage';
import DashboardLayout, { DashboardHome } from './pages/DashboardPage/DashboardPage';
import SecuritySettingsPage from './pages/SecuritySettings/SecuritySettingsPage';
import SsoCompletePage from './pages/SsoCompletePage/SsoCompletePage';
import SsoConfigPage from './pages/admin/SsoConfigPage';
import UsersPage from './pages/admin/UsersPage/UsersPage';
import RolesPage from './pages/admin/RolesPage/RolesPage';
import DepartmentsPage from './pages/admin/DepartmentsPage/DepartmentsPage';
import CompanyPage from './pages/admin/CompanyPage/CompanyPage';
import PropertiesPage from './pages/admin/PropertiesPage/PropertiesPage';
import CreatePropertyPage from './pages/admin/PropertiesPage/CreatePropertyPage';
import PropertyDetailPage from './pages/admin/PropertyDetailPage/PropertyDetailPage';
import TenantListPage from './pages/admin/TenantsPage/TenantListPage';
import TenantDetailPage from './pages/admin/TenantsPage/TenantDetailPage';
import CreateTenantPage from './pages/admin/TenantsPage/CreateTenantPage';
import MergeTenantPage from './pages/admin/TenantsPage/MergeTenantPage';
import LeaseListPage from './pages/admin/LeasesPage/LeaseListPage';
import LeaseDetailPage from './pages/admin/LeasesPage/LeaseDetailPage';
import CreateLeasePage from './pages/admin/LeasesPage/CreateLeasePage';
import LeadPipelinePage from './pages/admin/CRMPage/LeadPipelinePage';
import CRMLeadDetailPage from './pages/admin/CRMPage/LeadDetailPage';
import CampaignsPage from './pages/admin/CRMPage/CampaignsPage';
import ParkingOverviewPage from './pages/admin/ParkingPage/ParkingOverviewPage';
import AllocationManager from './pages/admin/ParkingPage/AllocationManager';
import VisitorParkingPage from './pages/admin/ParkingPage/VisitorParkingPage';
import GateAccessLogsPage from './pages/admin/ParkingPage/GateAccessLogsPage';
import InvoiceListPage from './pages/admin/BillingPage/InvoiceListPage';
import InvoiceDetailPage from './pages/admin/BillingPage/InvoiceDetailPage';
import CreateInvoicePage from './pages/admin/BillingPage/CreateInvoicePage';
import BillingSchedulesPage from './pages/admin/BillingPage/BillingSchedulesPage';
import ReceiptsPage from './pages/admin/ARPage/ReceiptsPage';
import AgingReportPage from './pages/admin/ARPage/AgingReportPage';
import CollectionDashboard from './pages/admin/ARPage/CollectionDashboard';
import RefundsPage from './pages/admin/ARPage/RefundsPage';
import TenantStatementPage from './pages/admin/ARPage/TenantStatementPage';
import ChartOfAccountsPage from './pages/admin/GLPage/ChartOfAccountsPage';
import JournalEntriesPage from './pages/admin/GLPage/JournalEntriesPage';
import FiscalPeriodsPage from './pages/admin/GLPage/FiscalPeriodsPage';
import TrialBalancePage from './pages/admin/GLPage/TrialBalancePage';
import ProfitAndLossPage from './pages/admin/GLPage/ProfitAndLossPage';
import BalanceSheetPage from './pages/admin/GLPage/BalanceSheetPage';
import CashFlowPage from './pages/admin/GLPage/CashFlowPage';
import BudgetsPage from './pages/admin/AssetsPage/BudgetsPage';
import AssetsListPage from './pages/admin/AssetsPage/AssetsListPage';
import AssetDetailPage from './pages/admin/AssetsPage/AssetDetailPage';
import BankAccountsPage from './pages/admin/BankingPage/BankAccountsPage';
import ReconciliationPage from './pages/admin/BankingPage/ReconciliationPage';
import WorkflowsPage from './pages/admin/WorkflowsPage/WorkflowsPage';
import DesignerPage from './pages/admin/WorkflowsPage/DesignerPage';
import MyTasksPage from './pages/admin/MyTasksPage/MyTasksPage';
import UserDetailPage from './pages/admin/UserDetailPage/UserDetailPage';
import NotificationsPage from './pages/NotificationsPage/NotificationsPage';
import NotificationPreferencesPage from './pages/NotificationsPage/NotificationPreferencesPage';
import ProfilePage from './pages/ProfilePage/ProfilePage';
import PositionsPage from './pages/admin/PositionsPage/PositionsPage';
import NotificationAdminPage from './pages/admin/NotificationAdminPage/NotificationAdminPage';
import VerifyEmailPage from './pages/VerifyEmailPage/VerifyEmailPage';
import DocumentsPage from './pages/DocumentsPage/DocumentsPage';
import TicketListPage from './pages/admin/MaintenancePage/TicketListPage';
import TicketDetailPage from './pages/admin/MaintenancePage/TicketDetailPage';
import TechnicianSchedulePage from './pages/admin/MaintenancePage/TechnicianSchedulePage';
import SlaConfigPage from './pages/admin/MaintenancePage/SlaConfigPage';
import PmScheduleListPage from './pages/admin/MaintenancePage/PmScheduleListPage';
import PmScheduleDetailPage from './pages/admin/MaintenancePage/PmScheduleDetailPage';
import PmCalendarPage from './pages/admin/MaintenancePage/PmCalendarPage';
import MaintenanceDashboard from './pages/admin/MaintenancePage/MaintenanceDashboard';
import AssetRegistryPage from './pages/admin/FacilityPage/AssetRegistryPage';
import FacilityAssetDetailPage from './pages/admin/FacilityPage/AssetDetailPage';
import CamCostPage from './pages/admin/FacilityPage/CamCostPage';
import ItemCatalogPage from './pages/admin/InventoryPage/ItemCatalogPage';
import StockLevelsPage from './pages/admin/InventoryPage/StockLevelsPage';
import MovementsPage from './pages/admin/InventoryPage/MovementsPage';
import HousekeepingTasksPage from './pages/admin/HousekeepingPage/HousekeepingTasksPage';
import SecurityIncidentsPage from './pages/admin/SecurityPage/SecurityIncidentsPage';
import PatrolLogsPage from './pages/admin/SecurityPage/PatrolLogsPage';
import PortalLayout from './pages/PortalPage/PortalLayout';
import PortalDashboard from './pages/PortalPage/PortalDashboard';
import PortalInvoices from './pages/PortalPage/PortalInvoices';
import PortalMaintenance from './pages/PortalPage/PortalMaintenance';
import PortalLease from './pages/PortalPage/PortalLease';
import PortalResidents from './pages/PortalPage/PortalResidents';
import PortalProfile from './pages/PortalPage/PortalProfile';
import PortalVisitors from './pages/PortalPage/PortalVisitors';
import PortalBookings from './pages/PortalPage/PortalBookings';
import PortalCommunity from './pages/PortalPage/PortalCommunity';
import PortalMoveRequests from './pages/PortalPage/PortalMoveRequests';
import MallDashboard from './pages/admin/MallDashboard';
import ShopDirectoryPage from './pages/admin/ShopDirectoryPage';
import GtoManagementPage from './pages/admin/GtoManagementPage';
import CamManagementPage from './pages/admin/CamManagementPage';
import MallEventsPage from './pages/admin/MallEventsPage';
import FootfallAnalyticsPage from './pages/admin/FootfallAnalyticsPage';
import SmartMeterPage from './pages/admin/SmartMeterPage';
import FundsPage from './pages/admin/FundsPage';
import MeetingsPage from './pages/admin/MeetingsPage';
import BylawsPage from './pages/admin/BylawsPage';
import IntegrationsPage from './pages/admin/IntegrationsPage';
import WebhooksPage from './pages/admin/WebhooksPage';
import ApiKeysPage from './pages/admin/ApiKeysPage';
import BmsPage from './pages/admin/BmsPage';
import ExecutiveDashboardPage from './pages/admin/ExecutiveDashboardPage';
import { useEffect } from 'react';
import { useRefreshTokensMutation } from './store/api/authApi';
import { useAppDispatch } from './store';
import { setCredentials, setLoading } from './store/slices/authSlice';

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const [refreshTokens] = useRefreshTokensMutation();

  useEffect(() => {
    const tryRefresh = async () => {
      try {
        const result = await refreshTokens().unwrap();
        if (result.data && result.data.accessToken && result.data.user) {
          dispatch(setCredentials({
            user: {
              id: result.data.user.id,
              email: result.data.user.email,
              companyId: result.data.user.companyId,
              roles: result.data.user.roles ?? [],
              permissions: result.data.user.permissions ?? [],
              mustChangePassword: result.data.user.mustChangePassword,
            },
            accessToken: result.data.accessToken,
            expiresIn: result.data.expiresIn,
          }));
          return;
        }
      } catch {
        // No valid refresh token — user needs to log in
      }
      dispatch(setLoading(false));
    };
    tryRefresh();
  }, [dispatch, refreshTokens]);

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/mfa" element={<MfaVerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      {/* SSO callback — outside PublicRoute (handles auth transition) */}
      <Route path="/sso/complete" element={<SsoCompletePage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/departments" element={<DepartmentsPage />} />
          <Route path="/admin/company" element={<CompanyPage />} />
          <Route path="/admin/properties" element={<PropertiesPage />} />
          <Route path="/admin/properties/create" element={<CreatePropertyPage />} />
          <Route path="/admin/properties/:id" element={<PropertyDetailPage />} />
          <Route path="/admin/tenants" element={<TenantListPage />} />
          <Route path="/admin/tenants/new" element={<CreateTenantPage />} />
          <Route path="/admin/tenants/merge" element={<MergeTenantPage />} />
          <Route path="/admin/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/admin/leases" element={<LeaseListPage />} />
          <Route path="/admin/leases/new" element={<CreateLeasePage />} />
          <Route path="/admin/leases/:id" element={<LeaseDetailPage />} />
          <Route path="/admin/crm/leads" element={<LeadPipelinePage />} />
          <Route path="/admin/crm/leads/:id" element={<CRMLeadDetailPage />} />
          <Route path="/admin/crm/campaigns" element={<CampaignsPage />} />
          <Route path="/admin/parking" element={<ParkingOverviewPage />} />
          <Route path="/admin/parking/allocations" element={<AllocationManager />} />
          <Route path="/admin/parking/visitors" element={<VisitorParkingPage />} />
          <Route path="/admin/parking/gate-logs" element={<GateAccessLogsPage />} />
          <Route path="/admin/billing/invoices" element={<InvoiceListPage />} />
          <Route path="/admin/billing/invoices/new" element={<CreateInvoicePage />} />
          <Route path="/admin/billing/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/admin/billing/schedules" element={<BillingSchedulesPage />} />
          <Route path="/admin/ar/receipts" element={<ReceiptsPage />} />
          <Route path="/admin/ar/aging" element={<AgingReportPage />} />
          <Route path="/admin/ar/collections" element={<CollectionDashboard />} />
          <Route path="/admin/ar/refunds" element={<RefundsPage />} />
          <Route path="/admin/ar/statements" element={<TenantStatementPage />} />
          <Route path="/admin/gl/accounts" element={<ChartOfAccountsPage />} />
          <Route path="/admin/gl/journal-entries" element={<JournalEntriesPage />} />
          <Route path="/admin/gl/fiscal-periods" element={<FiscalPeriodsPage />} />
          <Route path="/admin/gl/trial-balance" element={<TrialBalancePage />} />
          <Route path="/admin/gl/pnl" element={<ProfitAndLossPage />} />
          <Route path="/admin/gl/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="/admin/gl/cash-flow" element={<CashFlowPage />} />
          <Route path="/admin/budgets" element={<BudgetsPage />} />
          <Route path="/admin/assets" element={<AssetsListPage />} />
          <Route path="/admin/assets/:id" element={<AssetDetailPage />} />
          <Route path="/admin/banking" element={<BankAccountsPage />} />
          <Route path="/admin/banking/reconcile/:bankAccountId" element={<ReconciliationPage />} />
          <Route path="/admin/maintenance" element={<MaintenanceDashboard />} />
          <Route path="/admin/maintenance/tickets" element={<TicketListPage />} />
          <Route path="/admin/maintenance/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/admin/maintenance/technicians" element={<TechnicianSchedulePage />} />
          <Route path="/admin/maintenance/sla-config" element={<SlaConfigPage />} />
          <Route path="/admin/maintenance/pm" element={<PmScheduleListPage />} />
          <Route path="/admin/maintenance/pm/calendar" element={<PmCalendarPage />} />
          <Route path="/admin/maintenance/pm/:id" element={<PmScheduleDetailPage />} />
          <Route path="/admin/facility/assets" element={<AssetRegistryPage />} />
          <Route path="/admin/facility/assets/:id" element={<FacilityAssetDetailPage />} />
          <Route path="/admin/facility/cam-costs" element={<CamCostPage />} />
          <Route path="/admin/inventory/items" element={<ItemCatalogPage />} />
          <Route path="/admin/inventory/stock" element={<StockLevelsPage />} />
          <Route path="/admin/inventory/movements" element={<MovementsPage />} />
          <Route path="/admin/housekeeping" element={<HousekeepingTasksPage />} />
          <Route path="/admin/security/incidents" element={<SecurityIncidentsPage />} />
          <Route path="/admin/security/patrol" element={<PatrolLogsPage />} />
          <Route path="/admin/workflows" element={<WorkflowsPage />} />
          <Route path="/admin/positions" element={<PositionsPage />} />
          <Route path="/admin/notifications" element={<NotificationAdminPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/admin/sso" element={<SsoConfigPage />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />

          {/* Module 6.1 — Mall */}
          <Route path="/admin/mall" element={<MallDashboard />} />
          <Route path="/admin/mall/shops" element={<ShopDirectoryPage />} />
          <Route path="/admin/mall/gto" element={<GtoManagementPage />} />
          <Route path="/admin/mall/cam" element={<CamManagementPage />} />
          <Route path="/admin/mall/events" element={<MallEventsPage />} />
          <Route path="/admin/mall/footfall" element={<FootfallAnalyticsPage />} />

          {/* Module 6.2 — Condo */}
          <Route path="/admin/condo/smart-meters" element={<SmartMeterPage />} />
          <Route path="/admin/condo/funds" element={<FundsPage />} />
          <Route path="/admin/condo/meetings" element={<MeetingsPage />} />
          <Route path="/admin/condo/bylaws" element={<BylawsPage />} />

          {/* Module 6.3 — BI & Analytics */}
          <Route path="/admin/bi" element={<ExecutiveDashboardPage />} />

          {/* Module 6.3 — Enterprise Integrations */}
          <Route path="/admin/developer/integrations" element={<IntegrationsPage />} />
          <Route path="/admin/developer/webhooks" element={<WebhooksPage />} />
          <Route path="/admin/developer/api-keys" element={<ApiKeysPage />} />
          <Route path="/admin/developer/bms" element={<BmsPage />} />
        </Route>

        {/* Full-screen Workflow Designer — no sidebar layout */}
        <Route path="/admin/workflows/:id/design" element={<DesignerPage />} />

        {/* Portal — Tenant/Resident self-service */}
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/invoices" element={<PortalInvoices />} />
          <Route path="/portal/maintenance" element={<PortalMaintenance />} />
          <Route path="/portal/lease" element={<PortalLease />} />
          <Route path="/portal/residents" element={<PortalResidents />} />
          <Route path="/portal/profile" element={<PortalProfile />} />
          <Route path="/portal/visitors" element={<PortalVisitors />} />
          <Route path="/portal/bookings" element={<PortalBookings />} />
          <Route path="/portal/community" element={<PortalCommunity />} />
          <Route path="/portal/move-requests" element={<PortalMoveRequests />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AuthBootstrap>
          <AppRoutes />
        </AuthBootstrap>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              fontSize: '14px',
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  );
}
