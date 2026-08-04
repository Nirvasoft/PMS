import { createApi } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';
import { setCredentials, setMfaPending, clearAuth } from '../slices/authSlice';
import { baseQueryWithReauth } from './baseQuery';

interface LoginRequest {
  companyCode: string;
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface LoginSuccessData {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  user: {
    id: string;
    email: string;
    companyId: string;
    companyCode: string;
    companyName: string;
    roles: string[];
    permissions: string[];
    mustChangePassword: boolean;
  };
}

interface MfaChallengeData {
  mfaRequired: true;
  mfaToken: string;
  mfaTokenExpiresIn: number;
}

interface MfaVerifyRequest {
  mfaToken: string;
  code: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// SSO Config types
export interface SsoConfigSummary {
  id: string;
  name: string;
  provider: string;
  protocol: string;
  isEnabled: boolean;
  isDefault: boolean;
  domainRestriction: string | null;
  autoProvision: boolean;
  scopes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SsoConfigDetail extends SsoConfigSummary {
  clientId: string | null;
  clientSecret: string | null;
  issuerUrl: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  defaultRoleId: string | null;
  attributeMapping: Record<string, string>;
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Devices', 'AuditLogs', 'IpPolicies', 'PasswordPolicy', 'Me', 'SsoConfigs'],
  endpoints: (builder) => ({
    login: builder.mutation<ApiResponse<LoginSuccessData | MfaChallengeData>, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if ('mfaRequired' in data.data && data.data.mfaRequired) {
            dispatch(setMfaPending({ mfaToken: (data.data as MfaChallengeData).mfaToken }));
          } else {
            const d = data.data as LoginSuccessData;
            dispatch(setCredentials({ user: d.user, accessToken: d.accessToken, expiresIn: d.expiresIn }));
          }
        } catch { /* handled by component */ }
      },
    }),

    verifyMfa: builder.mutation<ApiResponse<LoginSuccessData>, MfaVerifyRequest>({
      query: (body) => ({ url: '/auth/mfa/verify', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const d = data.data;
          dispatch(setCredentials({ user: d.user, accessToken: d.accessToken, expiresIn: d.expiresIn }));
        } catch { /* handled by component */ }
      },
    }),

    logout: builder.mutation<void, { allDevices?: boolean }>({
      query: (body) => ({ url: '/auth/logout', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch { /* still clear */ }
        dispatch(clearAuth());
        dispatch(authApi.util.resetApiState());
      },
    }),

    refreshTokens: builder.mutation<ApiResponse<LoginSuccessData>, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
    }),

    getMe: builder.query<ApiResponse<Record<string, unknown>>, void>({
      query: () => '/auth/me',
      providesTags: ['Me'],
    }),

    changePassword: builder.mutation<ApiResponse<null>, { currentPassword: string; newPassword: string; confirmPassword: string }>({
      query: (body) => ({ url: '/auth/password/change', method: 'POST', body }),
    }),

    requestPasswordReset: builder.mutation<ApiResponse<{ message: string }>, { email: string }>({
      query: (body) => ({ url: '/auth/password/reset-request', method: 'POST', body }),
    }),

    resetPassword: builder.mutation<ApiResponse<null>, { token: string; newPassword: string; confirmPassword: string }>({
      query: (body) => ({ url: '/auth/password/reset', method: 'POST', body }),
    }),

    // MFA
    setupMfa: builder.mutation<ApiResponse<{ secret: string; qrCodeDataUrl: string; backupCodes: string[] }>, void>({
      query: () => ({ url: '/auth/mfa/setup', method: 'POST' }),
    }),

    enableMfa: builder.mutation<ApiResponse<{ mfaEnabled: boolean }>, { secret: string; code: string; backupCodes: string[] }>({
      query: (body) => ({ url: '/auth/mfa/enable', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),

    disableMfa: builder.mutation<ApiResponse<{ mfaEnabled: boolean }>, { code: string }>({
      query: (body) => ({ url: '/auth/mfa/disable', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),

    // Devices
    getDevices: builder.query<ApiResponse<Array<Record<string, unknown>>>, void>({
      query: () => '/auth/devices',
      providesTags: ['Devices'],
    }),

    revokeDevice: builder.mutation<void, string>({
      query: (id) => ({ url: `/auth/devices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Devices'],
    }),

    // Audit logs
    getAuditLogs: builder.query<{ success: boolean; data: Array<Record<string, unknown>>; meta: Record<string, number> }, Record<string, string>>({
      query: (params) => ({ url: '/auth/audit-logs', params }),
      providesTags: ['AuditLogs'],
    }),

    // IP Policies
    getIpPolicies: builder.query<ApiResponse<Array<Record<string, unknown>>>, void>({
      query: () => '/auth/ip-policies',
      providesTags: ['IpPolicies'],
    }),

    createIpPolicy: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/auth/ip-policies', method: 'POST', body }),
      invalidatesTags: ['IpPolicies'],
    }),

    deleteIpPolicy: builder.mutation<void, string>({
      query: (id) => ({ url: `/auth/ip-policies/${id}`, method: 'DELETE' }),
      invalidatesTags: ['IpPolicies'],
    }),

    // Password Policy
    getPasswordPolicy: builder.query<ApiResponse<Record<string, unknown> | null>, void>({
      query: () => '/auth/password-policy',
      providesTags: ['PasswordPolicy'],
    }),

    updatePasswordPolicy: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/auth/password-policy', method: 'PUT', body }),
      invalidatesTags: ['PasswordPolicy'],
    }),

    // Company Code Validation (public, pre-login)
    validateCompanyCode: builder.query<ApiResponse<{ name: string; logoUrl: string | null } | null>, string>({
      query: (code) => `/auth/company/validate?code=${encodeURIComponent(code)}`,
    }),

    // Company info (public, pre-login) — count + single company auto-fill
    getCompanyInfo: builder.query<ApiResponse<{ count: number; singleCompany: { code: string; name: string; logoUrl: string | null } | null }>, void>({
      query: () => '/auth/company/info',
    }),

    // SSO public — returns enabled providers for a company code (for login page buttons)
    getSsoProviders: builder.query<ApiResponse<{ id: string; name: string; provider: string; protocol: string; companyId: string }[]>, string>({
      query: (companyCode) => `/auth/sso/providers?companyCode=${encodeURIComponent(companyCode)}`,
    }),

    // ─── SSO Config Admin ────────────────────────

    getSsoConfigs: builder.query<ApiResponse<SsoConfigSummary[]>, void>({
      query: () => '/auth/sso/configs',
      providesTags: ['SsoConfigs'],
    }),

    getSsoConfig: builder.query<ApiResponse<SsoConfigDetail>, string>({
      query: (id) => `/auth/sso/configs/${id}`,
      providesTags: ['SsoConfigs'],
    }),

    createSsoConfig: builder.mutation<ApiResponse<SsoConfigDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/auth/sso/configs', method: 'POST', body }),
      invalidatesTags: ['SsoConfigs'],
    }),

    updateSsoConfig: builder.mutation<ApiResponse<SsoConfigDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/auth/sso/configs/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['SsoConfigs'],
    }),

    deleteSsoConfig: builder.mutation<void, string>({
      query: (id) => ({ url: `/auth/sso/configs/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SsoConfigs'],
    }),

    toggleSsoConfig: builder.mutation<ApiResponse<SsoConfigDetail>, { id: string; enabled: boolean }>({
      query: ({ id, enabled }) => ({ url: `/auth/sso/configs/${id}/toggle`, method: 'PATCH', body: { enabled } }),
      invalidatesTags: ['SsoConfigs'],
    }),
  }),
});

export const {
  useLoginMutation,
  useVerifyMfaMutation,
  useLogoutMutation,
  useRefreshTokensMutation,
  useGetMeQuery,
  useChangePasswordMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useSetupMfaMutation,
  useEnableMfaMutation,
  useDisableMfaMutation,
  useGetDevicesQuery,
  useRevokeDeviceMutation,
  useGetAuditLogsQuery,
  useGetIpPoliciesQuery,
  useCreateIpPolicyMutation,
  useDeleteIpPolicyMutation,
  useGetPasswordPolicyQuery,
  useUpdatePasswordPolicyMutation,
  useLazyValidateCompanyCodeQuery,
  useGetCompanyInfoQuery,
  // SSO
  useLazyGetSsoProvidersQuery,
  useGetSsoConfigsQuery,
  useGetSsoConfigQuery,
  useCreateSsoConfigMutation,
  useUpdateSsoConfigMutation,
  useDeleteSsoConfigMutation,
  useToggleSsoConfigMutation,
} = authApi;
