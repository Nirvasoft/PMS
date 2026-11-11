import { Suspense, lazy as reactLazy, useEffect, useRef, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { store, useAppDispatch } from './store';
import { ProtectedRoute, PublicRoute, RequirePermission } from './components/RouteGuards';
import { DialogProvider } from './components/DialogProvider';
import { LanguageProvider } from './i18n/LanguageProvider';
import { useRefreshTokensMutation } from './store/api/authApi';
import { setCredentials, setLoading } from './store/slices/authSlice';

// Eagerly loaded core shells (Login & Dashboard frame)
import LoginPage from './pages/LoginPage/LoginPage';
import DashboardLayout, { DashboardHome } from './pages/DashboardPage/DashboardPage';

const CHUNK_RELOAD_TS_KEY = 'pms-chunk-reload-ts';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;
const CHUNK_LOAD_ERROR = /fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload css/i;

function reloadOnceOnStaleChunk(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (!CHUNK_LOAD_ERROR.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_TS_KEY) || '0');
    if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // Ignore storage errors in restricted browsing modes
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceOnStaleChunk(event.payload ?? new Error('fetch dynamically imported module'))) {
      event.preventDefault();
    }
  });
}

// Wrap React.lazy so a stale chunk 404 after a new deploy triggers a silent reload
// while keeping <Suspense> in its loading state instead of flashing GlobalErrorBoundary.
function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return reactLazy(() =>
    factory().catch((err) => {
      if (reloadOnceOnStaleChunk(err)) {
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

// Lazy-loaded route pages (split into on-demand chunks)
const MfaVerifyPage = lazy(() => import('./pages/MfaVerifyPage/MfaVerifyPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage/ResetPasswordPage'));
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettings/SecuritySettingsPage'));
const SsoCompletePage = lazy(() => import('./pages/SsoCompletePage/SsoCompletePage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage/AcceptInvitePage'));
const SsoConfigPage = lazy(() => import('./pages/admin/SsoConfigPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage/UsersPage'));
const RolesPage = lazy(() => import('./pages/admin/RolesPage/RolesPage'));
const AssignPermissionPage = lazy(() => import('./pages/admin/RolesPage/AssignPermissionPage'));
const DepartmentsPage = lazy(() => import('./pages/admin/DepartmentsPage/DepartmentsPage'));
const CompanyPage = lazy(() => import('./pages/admin/CompanyPage/CompanyPage'));
const PrefixSetupPage = lazy(() => import('./pages/admin/PrefixSetupPage/PrefixSetupPage'));
const PropertiesPage = lazy(() => import('./pages/admin/PropertiesPage/PropertiesPage'));
const CreatePropertyPage = lazy(() => import('./pages/admin/PropertiesPage/CreatePropertyPage'));
const PropertyDetailPage = lazy(() => import('./pages/admin/PropertyDetailPage/PropertyDetailPage'));
const TenantListPage = lazy(() => import('./pages/admin/TenantsPage/TenantListPage'));
const TenantDetailPage = lazy(() => import('./pages/admin/TenantsPage/TenantDetailPage'));
const CreateTenantPage = lazy(() => import('./pages/admin/TenantsPage/CreateTenantPage'));
const MergeTenantPage = lazy(() => import('./pages/admin/TenantsPage/MergeTenantPage'));
const KycRequirementsPage = lazy(() => import('./pages/admin/TenantsPage/KycRequirementsPage'));
const LeaseListPage = lazy(() => import('./pages/admin/LeasesPage/LeaseListPage'));
const LeaseDetailPage = lazy(() => import('./pages/admin/LeasesPage/LeaseDetailPage'));
const CreateLeasePage = lazy(() => import('./pages/admin/LeasesPage/CreateLeasePage'));
const LeaseTemplatesPage = lazy(() => import('./pages/admin/LeasesPage/LeaseTemplatesPage'));
const LeaseClausesPage = lazy(() => import('./pages/admin/LeasesPage/LeaseClausesPage'));
const GeneralImportPage = lazy(() => import('./pages/admin/LeasesPage/GeneralImportPage'));
const LeadPipelinePage = lazy(() => import('./pages/admin/CRMPage/LeadPipelinePage'));
const CreateLeadPage = lazy(() => import('./pages/admin/CRMPage/CreateLeadPage'));
const CRMLeadDetailPage = lazy(() => import('./pages/admin/CRMPage/LeadDetailPage'));
const CampaignsPage = lazy(() => import('./pages/admin/CRMPage/CampaignsPage'));
const ParkingOverviewPage = lazy(() => import('./pages/admin/ParkingPage/ParkingOverviewPage'));
const AllocationManager = lazy(() => import('./pages/admin/ParkingPage/AllocationManager'));
const VisitorParkingPage = lazy(() => import('./pages/admin/ParkingPage/VisitorParkingPage'));
const GateAccessLogsPage = lazy(() => import('./pages/admin/ParkingPage/GateAccessLogsPage'));
const VehicleRegistryPage = lazy(() => import('./pages/admin/ParkingPage/VehicleRegistryPage'));
const InvoiceListPage = lazy(() => import('./pages/admin/BillingPage/InvoiceListPage'));
const InvoiceDetailPage = lazy(() => import('./pages/admin/BillingPage/InvoiceDetailPage'));
const CreateInvoicePage = lazy(() => import('./pages/admin/BillingPage/CreateInvoicePage'));
const BillingSchedulesPage = lazy(() => import('./pages/admin/BillingPage/BillingSchedulesPage'));
const BillingDashboardPage = lazy(() => import('./pages/admin/BillingPage/BillingDashboardPage'));
const ChargeCategoriesPage = lazy(() => import('./pages/admin/BillingPage/ChargeCategoriesPage'));
const ChargeTypesPage = lazy(() => import('./pages/admin/BillingPage/ChargeTypesPage'));
const CurrencyRatesPage = lazy(() => import('./pages/admin/BillingPage/CurrencyRatesPage'));
const MeterSetupPage = lazy(() => import('./pages/admin/BillingPage/MeterSetupPage'));
const PenaltyConfigPage = lazy(() => import('./pages/admin/BillingPage/PenaltyConfigPage'));
const TaxConfigPage = lazy(() => import('./pages/admin/BillingPage/TaxConfigPage'));
const BillingSettingsPage = lazy(() => import('./pages/admin/BillingPage/BillingSettingsPage'));
const ReceiptsPage = lazy(() => import('./pages/admin/ARPage/ReceiptsPage'));
const AgingReportPage = lazy(() => import('./pages/admin/ARPage/AgingReportPage'));
const CollectionDashboard = lazy(() => import('./pages/admin/ARPage/CollectionDashboard'));
const RefundsPage = lazy(() => import('./pages/admin/ARPage/RefundsPage'));
const TenantStatementPage = lazy(() => import('./pages/admin/ARPage/TenantStatementPage'));
const TenantCreditsPage = lazy(() => import('./pages/admin/ARPage/TenantCreditsPage'));
const ApInvoiceListPage = lazy(() => import('./pages/admin/APPage/ApInvoiceListPage'));
const ApInvoiceDetailPage = lazy(() => import('./pages/admin/APPage/ApInvoiceDetailPage'));
const PaymentVouchersPage = lazy(() => import('./pages/admin/APPage/PaymentVouchersPage'));
const ExpensesPage = lazy(() => import('./pages/admin/APPage/ExpensesPage'));
const ChartOfAccountsPage = lazy(() => import('./pages/admin/GLPage/ChartOfAccountsPage'));
const DepartmentCentersPage = lazy(() => import('./pages/admin/GLPage/DepartmentCentersPage'));
const CostCentersPage = lazy(() => import('./pages/admin/GLPage/CostCentersPage'));
const PaymentMethodSetupPage = lazy(() => import('./pages/admin/GLPage/PaymentMethodSetupPage'));
const JournalEntriesPage = lazy(() => import('./pages/admin/GLPage/JournalEntriesPage'));
const FiscalPeriodsPage = lazy(() => import('./pages/admin/GLPage/FiscalPeriodsPage'));
const TrialBalancePage = lazy(() => import('./pages/admin/GLPage/TrialBalancePage'));
const DetailedTrialBalancePage = lazy(() => import('./pages/admin/GLPage/DetailedTrialBalancePage'));
const ProfitAndLossPage = lazy(() => import('./pages/admin/GLPage/ProfitAndLossPage'));
const BalanceSheetPage = lazy(() => import('./pages/admin/GLPage/BalanceSheetPage'));
const CashFlowPage = lazy(() => import('./pages/admin/GLPage/CashFlowPage'));
const BudgetsPage = lazy(() => import('./pages/admin/AssetsPage/BudgetsPage'));
const AssetsListPage = lazy(() => import('./pages/admin/AssetsPage/AssetsListPage'));
const AssetDetailPage = lazy(() => import('./pages/admin/AssetsPage/AssetDetailPage'));
const BankAccountsPage = lazy(() => import('./pages/admin/BankingPage/BankAccountsPage'));
const GatewayTransactionsPage = lazy(() => import('./pages/admin/BankingPage/GatewayTransactionsPage'));
const ReconciliationPage = lazy(() => import('./pages/admin/BankingPage/ReconciliationPage'));
const WorkflowsPage = lazy(() => import('./pages/admin/WorkflowsPage/WorkflowsPage'));
const DesignerPage = lazy(() => import('./pages/admin/WorkflowsPage/DesignerPage'));
const WorkflowInstancePage = lazy(() => import('./pages/admin/WorkflowInstancePage/WorkflowInstancePage'));
const MyTasksPage = lazy(() => import('./pages/admin/MyTasksPage/MyTasksPage'));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage/UserDetailPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage/NotificationsPage'));
const NotificationPreferencesPage = lazy(() => import('./pages/NotificationsPage/NotificationPreferencesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const PositionsPage = lazy(() => import('./pages/admin/PositionsPage/PositionsPage'));
const NotificationAdminPage = lazy(() => import('./pages/admin/NotificationAdminPage/NotificationAdminPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage/VerifyEmailPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage/DocumentsPage'));
const SharedDocumentPage = lazy(() => import('./pages/SharedDocumentPage/SharedDocumentPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage/ReportsPage'));
const TicketListPage = lazy(() => import('./pages/admin/MaintenancePage/TicketListPage'));
const TicketDetailPage = lazy(() => import('./pages/admin/MaintenancePage/TicketDetailPage'));
const TechnicianSchedulePage = lazy(() => import('./pages/admin/MaintenancePage/TechnicianSchedulePage'));
const SlaConfigPage = lazy(() => import('./pages/admin/MaintenancePage/SlaConfigPage'));
const SlaReportPage = lazy(() => import('./pages/admin/MaintenancePage/SlaReportPage'));
const CategoriesPage = lazy(() => import('./pages/admin/MaintenancePage/CategoriesPage'));
const PmScheduleListPage = lazy(() => import('./pages/admin/MaintenancePage/PmScheduleListPage'));
const PmWorkOrderListPage = lazy(() => import('./pages/admin/MaintenancePage/PmWorkOrderListPage'));
const PmScheduleDetailPage = lazy(() => import('./pages/admin/MaintenancePage/PmScheduleDetailPage'));
const PmCalendarPage = lazy(() => import('./pages/admin/MaintenancePage/PmCalendarPage'));
const MaintenanceDashboard = lazy(() => import('./pages/admin/MaintenancePage/MaintenanceDashboard'));
const AssetRegistryPage = lazy(() => import('./pages/admin/FacilityPage/AssetRegistryPage'));
const FacilityAssetDetailPage = lazy(() => import('./pages/admin/FacilityPage/AssetDetailPage'));
const CamCostPage = lazy(() => import('./pages/admin/FacilityPage/CamCostPage'));
const FacilitySchedulePage = lazy(() => import('./pages/admin/FacilitySchedulePage/FacilitySchedulePage'));
const UtilitySystemsPage = lazy(() => import('./pages/admin/FacilityPage/UtilitySystemsPage'));
const QrScanLandingPage = lazy(() => import('./pages/admin/FacilityPage/QrScanLandingPage'));
const ItemCatalogPage = lazy(() => import('./pages/admin/InventoryPage/ItemCatalogPage'));
const InventoryDashboard = lazy(() => import('./pages/admin/InventoryPage/InventoryDashboard'));
const StockLevelsPage = lazy(() => import('./pages/admin/InventoryPage/StockLevelsPage'));
const StoreManagementPage = lazy(() => import('./pages/admin/InventoryPage/StoreManagementPage'));
const MovementsPage = lazy(() => import('./pages/admin/InventoryPage/MovementsPage'));
const PurchaseRequisitionsPage = lazy(() => import('./pages/admin/InventoryPage/PurchaseRequisitionsPage'));
const HousekeepingTasksPage = lazy(() => import('./pages/admin/HousekeepingPage/HousekeepingTasksPage'));
const HousekeepingDashboard = lazy(() => import('./pages/admin/HousekeepingPage/HousekeepingDashboard'));
const InspectionsPage = lazy(() => import('./pages/admin/HousekeepingPage/InspectionsPage'));
const ZoneManagementPage = lazy(() => import('./pages/admin/HousekeepingPage/ZoneManagementPage'));
const ScheduleManagementPage = lazy(() => import('./pages/admin/HousekeepingPage/ScheduleManagementPage'));
const SecurityIncidentsPage = lazy(() => import('./pages/admin/SecurityPage/SecurityIncidentsPage'));
const SecurityDashboard = lazy(() => import('./pages/admin/SecurityPage/SecurityDashboard'));
const IncidentDetailPage = lazy(() => import('./pages/admin/SecurityPage/IncidentDetailPage'));
const PatrolLogsPage = lazy(() => import('./pages/admin/SecurityPage/PatrolLogsPage'));
const PatrolScheduleManagement = lazy(() => import('./pages/admin/SecurityPage/PatrolScheduleManagement'));
const PatrolScanPage = lazy(() => import('./pages/admin/SecurityPage/PatrolScanPage'));
const AccessEventsPage = lazy(() => import('./pages/admin/SecurityPage/AccessEventsPage'));
const VisitorBlacklistPage = lazy(() => import('./pages/admin/SecurityPage/VisitorBlacklistPage'));
const PortalLayout = lazy(() => import('./pages/PortalPage/PortalLayout'));
const PortalDashboard = lazy(() => import('./pages/PortalPage/PortalDashboard'));
const PortalInvoices = lazy(() => import('./pages/PortalPage/PortalInvoices'));
const PaymentSuccessPage = lazy(() => import('./pages/PortalPage/PaymentSuccessPage'));
const PortalMaintenance = lazy(() => import('./pages/PortalPage/PortalMaintenance'));
const PortalLease = lazy(() => import('./pages/PortalPage/PortalLease'));
const PortalResidents = lazy(() => import('./pages/PortalPage/PortalResidents'));
const PortalProfile = lazy(() => import('./pages/PortalPage/PortalProfile'));
const PortalKyc = lazy(() => import('./pages/PortalPage/PortalKyc'));
const PortalVisitors = lazy(() => import('./pages/PortalPage/PortalVisitors'));
const PortalBookings = lazy(() => import('./pages/PortalPage/PortalBookings'));
const PortalCommunity = lazy(() => import('./pages/PortalPage/PortalCommunity'));
const PortalMoveRequests = lazy(() => import('./pages/PortalPage/PortalMoveRequests'));
const CommunityAdminPage = lazy(() => import('./pages/admin/CommunityAdminPage/CommunityAdminPage'));
const QuickActionsAdminPage = lazy(() => import('./pages/admin/QuickActionsAdminPage/QuickActionsAdminPage'));
const PortalAnalyticsPage = lazy(() => import('./pages/admin/PortalAnalyticsPage/PortalAnalyticsPage'));
const AccessCardsPage = lazy(() => import('./pages/admin/AccessCardsPage/AccessCardsPage'));
const PortalBrandingPage = lazy(() => import('./pages/admin/PortalBrandingPage/PortalBrandingPage'));
const MallDashboard = lazy(() => import('./pages/admin/MallDashboard'));
const ShopDirectoryPage = lazy(() => import('./pages/admin/ShopDirectoryPage'));
const PublicMallNavigationPage = lazy(() => import('./pages/PublicMallNavigationPage/PublicMallNavigationPage'));
const GtoManagementPage = lazy(() => import('./pages/admin/GtoManagementPage'));
const CamManagementPage = lazy(() => import('./pages/admin/CamManagementPage'));
const MallEventsPage = lazy(() => import('./pages/admin/MallEventsPage'));
const FootfallAnalyticsPage = lazy(() => import('./pages/admin/FootfallAnalyticsPage'));
const PosIntegrationPage = lazy(() => import('./pages/admin/PosIntegrationPage'));
const SmartMeterPage = lazy(() => import('./pages/admin/SmartMeterPage'));
const FundsPage = lazy(() => import('./pages/admin/FundsPage'));
const MeetingsPage = lazy(() => import('./pages/admin/MeetingsPage'));
const BylawsPage = lazy(() => import('./pages/admin/BylawsPage'));
const IntegrationsPage = lazy(() => import('./pages/admin/IntegrationsPage'));
const WebhooksPage = lazy(() => import('./pages/admin/WebhooksPage'));
const ApiKeysPage = lazy(() => import('./pages/admin/ApiKeysPage'));
const BmsPage = lazy(() => import('./pages/admin/BmsPage'));
const CronJobsPage = lazy(() => import('./pages/admin/CronJobsPage/CronJobsPage'));
const ExecutiveDashboardPage = lazy(() => import('./pages/admin/ExecutiveDashboardPage'));
const BiReportsPage = lazy(() => import('./pages/admin/BiReportsPage'));
const AnomalyDashboardPage = lazy(() => import('./pages/admin/AnomalyDashboardPage'));
const AdminCompaniesPage = lazy(() => import('./pages/admin/AdminCompaniesPage/AdminCompaniesPage'));

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const [refreshTokens] = useRefreshTokensMutation();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

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
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '45vh', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem' }}>
          Loading…
        </div>
      }
    >
    <Routes>
      {/* Public routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/mfa" element={<MfaVerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
      </Route>

      {/* SSO callback — outside PublicRoute (handles auth transition) */}
      <Route path="/sso/complete" element={<SsoCompletePage />} />

      {/* Public shared document viewer & Mall Indoor Navigation — no auth required */}
      <Route path="/shared/documents/:token" element={<SharedDocumentPage />} />
      <Route path="/mall/navigate" element={<PublicMallNavigationPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />

          {/* User & Role Management — requires users.read */}
          <Route element={<RequirePermission permission="users.read" />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UserDetailPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/roles/assign-permission" element={<AssignPermissionPage />} />
            <Route path="/admin/departments" element={<DepartmentsPage />} />
            <Route path="/admin/positions" element={<PositionsPage />} />
          </Route>

          {/* Company, SSO & Prefix Setup */}
          <Route element={<RequirePermission permission={['company.manage', 'company.read']} />}>
            <Route path="/admin/company" element={<CompanyPage />} />
            <Route path="/admin/sso" element={<SsoConfigPage />} />
            <Route path="/admin/prefix-setup" element={<PrefixSetupPage />} />
          </Route>

          {/* Properties — requires properties.read */}
          <Route element={<RequirePermission permission="properties.read" />}>
            <Route path="/admin/properties" element={<PropertiesPage />} />
            <Route path="/admin/properties/create" element={<CreatePropertyPage />} />
            <Route path="/admin/properties/:id" element={<PropertyDetailPage />} />
          </Route>

          {/* Tenants — requires tenants.read */}
          <Route element={<RequirePermission permission="tenants.read" />}>
            <Route path="/admin/tenants" element={<TenantListPage />} />
            <Route path="/admin/tenants/new" element={<CreateTenantPage />} />
            <Route path="/admin/tenants/merge" element={<MergeTenantPage />} />
            <Route path="/admin/tenants/kyc-requirements" element={<KycRequirementsPage />} />
            <Route path="/admin/tenants/:id" element={<TenantDetailPage />} />
          </Route>

          {/* Leases — requires leases.read */}
          <Route element={<RequirePermission permission="leases.read" />}>
            <Route path="/admin/leases" element={<LeaseListPage />} />
            <Route path="/admin/leases/new" element={<CreateLeasePage />} />
            <Route path="/admin/leases/templates" element={<LeaseTemplatesPage />} />
            <Route path="/admin/leases/clauses" element={<LeaseClausesPage />} />
            <Route path="/admin/leases/general-import" element={<GeneralImportPage />} />
            <Route path="/admin/leases/:id" element={<LeaseDetailPage />} />
          </Route>

          {/* CRM — leads and campaigns are gated independently */}
          <Route element={<RequirePermission permission="crm-leads.read" />}>
            <Route path="/admin/crm/leads" element={<LeadPipelinePage />} />
            <Route path="/admin/crm/leads/new" element={<CreateLeadPage />} />
            <Route path="/admin/crm/leads/:id" element={<CRMLeadDetailPage />} />
          </Route>
          <Route element={<RequirePermission permission="crm-campaigns.read" />}>
            <Route path="/admin/crm/campaigns" element={<CampaignsPage />} />
          </Route>

          {/* Parking — requires any parking sub-menu read permission */}
          <Route element={<RequirePermission permission={['parking-overview.read', 'parking-allocations.read', 'parking-visitors.read', 'parking-gate-logs.read', 'parking-vehicles.read']} />}>
            <Route path="/admin/parking" element={<ParkingOverviewPage />} />
            <Route path="/admin/parking/allocations" element={<AllocationManager />} />
            <Route path="/admin/parking/visitors" element={<VisitorParkingPage />} />
            <Route path="/admin/parking/gate-logs" element={<GateAccessLogsPage />} />
            <Route path="/admin/parking/vehicles" element={<VehicleRegistryPage />} />
          </Route>

          {/* Billing & Finance — requires any billing/AR/AP/finance sub-menu read permission */}
          <Route element={<RequirePermission permission={[
            'billing-dashboard.read', 'billing-invoices.read', 'billing-schedules.read', 'charge-category.read', 'billing-charge-types.read', 'currency-rate.read', 'meter.read', 'billing-settings.read',
            'ar-receipts.read', 'ar-aging.read', 'ar-collections.read', 'ar-refunds.read', 'ar-statements.read', 'ar-credits.read',
            'ap-invoices.read', 'ap-vouchers.read', 'ap-expenses.read',
            'finance-coa.read', 'finance-journal.read', 'finance-fiscal-periods.read', 'finance-trial-balance.read', 'finance-pnl.read', 'finance-balance-sheet.read', 'finance-cash-flow.read', 'finance-budgets.read', 'finance-assets.read', 'finance-banking.read', 'finance-gateway.read',
          ]} />}>
            <Route path="/admin/billing/invoices" element={<InvoiceListPage />} />
            <Route path="/admin/billing/invoices/new" element={<CreateInvoicePage />} />
            <Route path="/admin/billing/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="/admin/billing/schedules" element={<BillingSchedulesPage />} />
            <Route path="/admin/billing/dashboard" element={<BillingDashboardPage />} />
            <Route path="/admin/billing/charge-categories" element={<ChargeCategoriesPage />} />
            <Route path="/admin/billing/charge-types" element={<ChargeTypesPage />} />
            <Route path="/admin/billing/currency-rates" element={<CurrencyRatesPage />} />
            <Route path="/admin/billing/meter-setup" element={<MeterSetupPage />} />
            <Route path="/admin/billing/penalty-configs" element={<PenaltyConfigPage />} />
            <Route path="/admin/billing/tax-configs" element={<TaxConfigPage />} />
            <Route path="/admin/billing/settings" element={<BillingSettingsPage />} />
            <Route path="/admin/ar/receipts" element={<ReceiptsPage />} />
            <Route path="/admin/ar/aging" element={<AgingReportPage />} />
            <Route path="/admin/ar/collections" element={<CollectionDashboard />} />
            <Route path="/admin/ar/refunds" element={<RefundsPage />} />
            <Route path="/admin/ar/statements" element={<TenantStatementPage />} />
            <Route path="/admin/ar/credits" element={<TenantCreditsPage />} />
            <Route path="/admin/ap/invoices" element={<ApInvoiceListPage />} />
            <Route path="/admin/ap/invoices/:id" element={<ApInvoiceDetailPage />} />
            <Route path="/admin/ap/vouchers" element={<PaymentVouchersPage />} />
            <Route path="/admin/ap/expenses" element={<ExpensesPage />} />
            <Route path="/admin/gl/accounts" element={<ChartOfAccountsPage />} />
            <Route path="/admin/gl/department-centers" element={<DepartmentCentersPage />} />
            <Route path="/admin/gl/cost-centers" element={<CostCentersPage />} />
            <Route path="/admin/gl/payment-methods" element={<PaymentMethodSetupPage />} />
            <Route path="/admin/gl/journal-entries" element={<JournalEntriesPage />} />
            <Route path="/admin/gl/fiscal-periods" element={<FiscalPeriodsPage />} />
            <Route path="/admin/gl/trial-balance" element={<TrialBalancePage />} />
            <Route path="/admin/gl/detailed-trial-balance" element={<DetailedTrialBalancePage />} />
            <Route path="/admin/gl/pnl" element={<ProfitAndLossPage />} />
            <Route path="/admin/gl/balance-sheet" element={<BalanceSheetPage />} />
            <Route path="/admin/gl/cash-flow" element={<CashFlowPage />} />
            <Route path="/admin/budgets" element={<BudgetsPage />} />
            <Route path="/admin/assets" element={<AssetsListPage />} />
            <Route path="/admin/assets/:id" element={<AssetDetailPage />} />
            <Route path="/admin/banking" element={<BankAccountsPage />} />
            <Route path="/admin/banking/reconcile/:bankAccountId" element={<ReconciliationPage />} />
            <Route path="/admin/banking/gateway-transactions" element={<GatewayTransactionsPage />} />
          </Route>

          {/* Maintenance — requires any maintenance sub-menu read permission */}
          <Route element={<RequirePermission permission={['maintenance-dashboard.read', 'maintenance-tickets.read', 'maintenance-technicians.read', 'maintenance-sla.read', 'maintenance-pm.read', 'maintenance-pm-calendar.read']} />}>
            <Route path="/admin/maintenance" element={<MaintenanceDashboard />} />
            <Route path="/admin/maintenance/tickets" element={<TicketListPage />} />
            <Route path="/admin/maintenance/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/admin/maintenance/technicians" element={<TechnicianSchedulePage />} />
            <Route path="/admin/maintenance/sla-config" element={<SlaConfigPage />} />
            <Route path="/admin/maintenance/sla-report" element={<SlaReportPage />} />
            <Route path="/admin/maintenance/categories" element={<CategoriesPage />} />
            <Route path="/admin/maintenance/pm" element={<PmScheduleListPage />} />
            <Route path="/admin/maintenance/pm/calendar" element={<PmCalendarPage />} />
            <Route path="/admin/maintenance/pm/work-orders" element={<PmWorkOrderListPage />} />
            <Route path="/admin/maintenance/pm/:id" element={<PmScheduleDetailPage />} />
          </Route>

          {/* Facility — requires any facility sub-menu read permission */}
          <Route element={<RequirePermission permission={['facility-assets.read', 'facility-cam.read', 'facility-schedule.read']} />}>
            <Route path="/admin/facility/assets" element={<AssetRegistryPage />} />
            <Route path="/admin/facility/assets/:id/scan" element={<QrScanLandingPage />} />
            <Route path="/admin/facility/assets/:id" element={<FacilityAssetDetailPage />} />
            <Route path="/admin/facility/cam-costs" element={<CamCostPage />} />
            <Route path="/admin/facility/utility-systems" element={<UtilitySystemsPage />} />
            <Route path="/admin/facility/schedule" element={<FacilitySchedulePage />} />
          </Route>

          {/* Inventory — requires any inventory sub-menu read permission */}
          <Route element={<RequirePermission permission={['inventory-dashboard.read', 'inventory-items.read', 'inventory-stock.read', 'inventory-stores.read', 'inventory-movements.read', 'inventory-purchase-req.read']} />}>
            <Route path="/admin/inventory/dashboard" element={<InventoryDashboard />} />
            <Route path="/admin/inventory/items" element={<ItemCatalogPage />} />
            <Route path="/admin/inventory/stock" element={<StockLevelsPage />} />
            <Route path="/admin/inventory/stores" element={<StoreManagementPage />} />
            <Route path="/admin/inventory/movements" element={<MovementsPage />} />
            <Route path="/admin/inventory/purchase-requisitions" element={<PurchaseRequisitionsPage />} />
          </Route>

          <Route path="/admin/housekeeping/dashboard" element={<HousekeepingDashboard />} />
          <Route path="/admin/housekeeping" element={<HousekeepingTasksPage />} />
          <Route path="/admin/housekeeping/inspections" element={<InspectionsPage />} />
          <Route path="/admin/housekeeping/zones" element={<ZoneManagementPage />} />
          <Route path="/admin/housekeeping/schedules" element={<ScheduleManagementPage />} />
          <Route path="/admin/security/dashboard" element={<SecurityDashboard />} />
          <Route path="/admin/security/incidents" element={<SecurityIncidentsPage />} />
          <Route path="/admin/security/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/admin/security/patrol" element={<PatrolLogsPage />} />
          <Route path="/admin/security/patrol/schedules" element={<PatrolScheduleManagement />} />
          <Route path="/admin/security/patrol/scan" element={<PatrolScanPage />} />
          <Route path="/admin/security/access-events" element={<AccessEventsPage />} />
          <Route path="/admin/security/blacklist" element={<VisitorBlacklistPage />} />
          <Route path="/admin/visitors" element={<Navigate to="/admin/security/dashboard" replace />} />
          <Route path="/admin/workflows" element={<WorkflowsPage />} />
          <Route path="/admin/workflows/instances/:id" element={<WorkflowInstancePage />} />
          <Route path="/admin/notifications" element={<NotificationAdminPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* Module 6.1 — Mall */}
          <Route path="/admin/mall" element={<MallDashboard />} />
          <Route path="/admin/mall/shops" element={<ShopDirectoryPage />} />
          <Route path="/admin/mall/gto" element={<GtoManagementPage />} />
          <Route path="/admin/mall/cam" element={<CamManagementPage />} />
          <Route path="/admin/mall/events" element={<MallEventsPage />} />
          <Route path="/admin/mall/footfall" element={<FootfallAnalyticsPage />} />
          <Route path="/admin/mall/pos" element={<PosIntegrationPage />} />

          {/* Community Admin */}
          <Route path="/admin/community" element={<CommunityAdminPage />} />
          <Route path="/admin/portal/quick-actions" element={<QuickActionsAdminPage />} />
          <Route path="/admin/portal/analytics" element={<PortalAnalyticsPage />} />
          <Route path="/admin/access-cards" element={<AccessCardsPage />} />
          <Route path="/admin/portal/branding" element={<PortalBrandingPage />} />

          {/* Module 6.2 — Condo */}
          <Route path="/admin/condo/smart-meters" element={<SmartMeterPage />} />
          <Route path="/admin/condo/funds" element={<FundsPage />} />
          <Route path="/admin/condo/meetings" element={<MeetingsPage />} />
          <Route path="/admin/condo/bylaws" element={<BylawsPage />} />

          {/* Module 6.3 — BI & Analytics */}
          <Route path="/admin/bi" element={<ExecutiveDashboardPage />} />
          <Route path="/admin/bi/reports" element={<BiReportsPage />} />
          <Route path="/admin/bi/anomalies" element={<AnomalyDashboardPage />} />

          {/* Module 6.3 — Enterprise Integrations */}
          <Route path="/admin/developer/integrations" element={<IntegrationsPage />} />
          <Route path="/admin/developer/webhooks" element={<WebhooksPage />} />
          <Route path="/admin/developer/api-keys" element={<ApiKeysPage />} />
          <Route path="/admin/developer/bms" element={<BmsPage />} />
          <Route path="/admin/developer/cron-jobs" element={<CronJobsPage />} />

          {/* System Admin */}
          <Route path="/admin/system/companies" element={<AdminCompaniesPage />} />
        </Route>

        {/* Full-screen Workflow Designer & Mall Floor Plan Map — no sidebar layout */}
        <Route path="/admin/workflows/:id/design" element={<DesignerPage />} />
        <Route path="/admin/mall/shops/map" element={<ShopDirectoryPage fullScreenMap />} />

        {/* Portal — Tenant/Resident self-service */}
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/invoices" element={<PortalInvoices />} />
          <Route path="/portal/payments/success" element={<PaymentSuccessPage />} />
          <Route path="/portal/maintenance" element={<PortalMaintenance />} />
          <Route path="/portal/lease" element={<PortalLease />} />
          <Route path="/portal/residents" element={<PortalResidents />} />
          <Route path="/portal/profile" element={<PortalProfile />} />
          <Route path="/portal/kyc" element={<PortalKyc />} />
          <Route path="/portal/visitors" element={<PortalVisitors />} />
          <Route path="/portal/bookings" element={<PortalBookings />} />
          <Route path="/portal/community" element={<PortalCommunity />} />
          <Route path="/portal/move-requests" element={<PortalMoveRequests />} />
        </Route>
      </Route>

      {/* Route Aliases */}
      <Route path="/admin/facility-bookings" element={<Navigate to="/admin/facility/schedule" replace />} />
      <Route path="/admin/preventive-maintenance" element={<Navigate to="/admin/maintenance/pm" replace />} />
      <Route path="/admin/inventory" element={<Navigate to="/admin/inventory/dashboard" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
}

// ── Global Error Boundary (catches ALL React errors) ──
import { Component, type ReactNode as RN2 } from 'react';
class GlobalErrorBoundary extends Component<{ children: RN2 }, { hasError: boolean; error?: Error; info?: string }> {
  state = { hasError: false, error: undefined as Error | undefined, info: '' };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidMount() {
    if (import.meta.hot) {
      import.meta.hot.on('vite:afterUpdate', () => {
        if (this.state.hasError) {
          this.setState({ hasError: false, error: undefined, info: '' });
        }
      });
    }
  }
  componentDidCatch(error: Error, info: any) {
    if (reloadOnceOnStaleChunk(error)) return;
    this.setState({ info: info?.componentStack || '' });
    console.error('Global Error Boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 600, margin: '80px auto', fontFamily: 'system-ui' }}>
          <h2 style={{ color: '#ef4444' }}>⚠️ Application Error</h2>
          <p style={{ color: '#94a3b8' }}>The app encountered an error. This info helps debug:</p>
          <pre style={{
            background: '#1e293b', color: '#f8fafc', padding: 16, borderRadius: 8,
            overflow: 'auto', fontSize: '0.78rem', maxHeight: 300, whiteSpace: 'pre-wrap',
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
            {this.state.info && `\n\nComponent Stack:\n${this.state.info}`}
          </pre>
          <button onClick={() => window.location.href = '/login'}
            style={{ marginTop: 16, padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Back to Login
          </button>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 16, marginLeft: 8, padding: '8px 20px', background: '#334155', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <Provider store={store}>
        <LanguageProvider>
          <DialogProvider>
            <BrowserRouter>
              <AuthBootstrap>
                <AppRoutes />
              </AuthBootstrap>
              <Toaster
                position="top-right"
                containerStyle={{ zIndex: 100000 }}
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    fontSize: '14px',
                  },
                }}
              >
                {(t) => (
                  <ToastBar toast={t}>
                    {({ icon, message }) => (
                      <>
                        {icon}
                        {message}
                        {t.type !== 'loading' && (
                          <button
                            onClick={() => toast.dismiss(t.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                              padding: 4,
                              marginLeft: 4,
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </ToastBar>
                )}
              </Toaster>
            </BrowserRouter>
          </DialogProvider>
        </LanguageProvider>
      </Provider>
    </GlobalErrorBoundary>
  );
}
