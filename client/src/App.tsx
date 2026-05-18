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
import UsersPage from './pages/admin/UsersPage/UsersPage';
import RolesPage from './pages/admin/RolesPage/RolesPage';
import DepartmentsPage from './pages/admin/DepartmentsPage/DepartmentsPage';
import CompanyPage from './pages/admin/CompanyPage/CompanyPage';
import PropertiesPage from './pages/admin/PropertiesPage/PropertiesPage';
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
          <Route path="/admin/workflows" element={<WorkflowsPage />} />
          <Route path="/admin/positions" element={<PositionsPage />} />
          <Route path="/admin/notifications" element={<NotificationAdminPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
        </Route>

        {/* Full-screen Workflow Designer — no sidebar layout */}
        <Route path="/admin/workflows/:id/design" element={<DesignerPage />} />
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
