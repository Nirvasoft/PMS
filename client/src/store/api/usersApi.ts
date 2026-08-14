import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  errors: number;
  results: { email: string; status: string; error?: string }[];
}

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  department: { id: string; name: string } | null;
  roles: { id: string; name: string }[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mobile: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  employeeId: string | null;
  dateOfJoining: string | null;
  timezone: string;
  locale: string;
  department: { id: string; name: string } | null;
  position: { id: string; name: string; level: number } | null;
  roles: { id: string; name: string; propertyId: string | null; expiresAt: string | null }[];
  permissionOverrides: {
    id: string;
    permissionCode: string;
    permissionName: string;
    module: string;
    overrideType: 'grant' | 'revoke';
    reason: string | null;
    expiresAt: string | null;
  }[];
  effectivePermissions: string[];
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissionCount?: number;
  permissions?: { code: string; name: string; module: string; action: string }[];
}

export interface DepartmentNode {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  sortOrder: number;
  manager: { id: string; fullName: string } | null;
  userCount: number;
  children: DepartmentNode[];
}

export interface PermissionsByModule {
  [module: string]: { code: string; name: string; action: string; description: string | null }[];
}

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Users', 'Roles', 'Departments', 'Positions', 'Permissions', 'RoleTemplates', 'Invitations'],
  endpoints: (builder) => ({
    // ─── Users ──────────────────────────────
    getUsers: builder.query<PaginatedResponse<UserListItem>, Record<string, string>>({
      query: (params) => ({ url: '/users', params }),
      providesTags: ['Users'],
    }),

    getUser: builder.query<ApiResponse<UserDetail>, string>({
      query: (id) => `/users/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Users', id }],
    }),

    createUser: builder.mutation<ApiResponse<{ id: string; email: string }>, Record<string, unknown>>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),

    updateUser: builder.mutation<ApiResponse<UserDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Users', id }, 'Users'],
    }),

    deactivateUser: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/users/${id}/deactivate`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Users', id }, 'Users'],
    }),

    assignUserRole: builder.mutation<void, { userId: string; roleId: string; expiresAt?: string }>({
      query: ({ userId, ...body }) => ({ url: `/users/${userId}/roles`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }],
    }),

    removeUserRole: builder.mutation<void, { userId: string; roleId: string }>({
      query: ({ userId, roleId }) => ({ url: `/users/${userId}/roles/${roleId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }],
    }),

    reactivateUser: builder.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}/reactivate`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Users', id }, 'Users'],
    }),

    adminResetPassword: builder.mutation<ApiResponse<{ temporaryPassword: string }>, string>({
      query: (id) => ({ url: `/users/${id}/reset-password`, method: 'POST' }),
    }),

    importUsers: builder.mutation<ApiResponse<BulkImportResult>, File>({
      query: (file) => {
        const formData = new FormData();
        formData.append('csv', file);
        return { url: '/users/import', method: 'POST', body: formData };
      },
      // Refresh the user list so imported users appear without a page reload.
      invalidatesTags: ['Users'],
    }),

    uploadAvatar: builder.mutation<ApiResponse<{ avatarUrl: string }>, { userId: string; file: File }>({
      query: ({ userId, file }) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return { url: `/users/${userId}/avatar`, method: 'POST', body: formData };
      },
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }],
    }),

    // ─── Roles ──────────────────────────────
    getRoles: builder.query<ApiResponse<RoleItem[]>, { includePermissions?: boolean } | void>({
      query: (params) => ({
        url: '/roles',
        params: params ? { includePermissions: params.includePermissions ? 'true' : 'false' } : {},
      }),
      providesTags: ['Roles'],
    }),

    getRole: builder.query<ApiResponse<RoleItem>, string>({
      query: (id) => `/roles/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Roles', id }],
    }),

    createRole: builder.mutation<ApiResponse<RoleItem>, { name: string; description?: string; permissionCodes: string[] }>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Roles'],
    }),

    updateRole: builder.mutation<ApiResponse<RoleItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/roles/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Roles', id }, 'Roles'],
    }),

    deleteRole: builder.mutation<void, string>({
      query: (id) => ({ url: `/roles/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Roles'],
    }),

    getRoleTemplates: builder.query<ApiResponse<{ id: string; name: string; description: string; permissions: string[] }[]>, void>({
      query: () => '/role-templates',
      providesTags: ['RoleTemplates'],
    }),

    createRoleFromTemplate: builder.mutation<ApiResponse<RoleItem>, { templateId: string; name: string }>({
      query: (body) => ({ url: '/roles/from-template', method: 'POST', body }),
      invalidatesTags: ['Roles'],
    }),

    // ─── Permissions ────────────────────────
    getPermissions: builder.query<ApiResponse<PermissionsByModule>, { module?: string } | void>({
      query: (params) => ({ url: '/permissions', params: params || {} }),
      providesTags: ['Permissions'],
    }),

    // ─── Departments ────────────────────────
    getDepartmentTree: builder.query<ApiResponse<DepartmentNode[]>, void>({
      query: () => '/departments?tree=true',
      providesTags: ['Departments'],
    }),

    createDepartment: builder.mutation<ApiResponse<DepartmentNode>, Record<string, unknown>>({
      query: (body) => ({ url: '/departments', method: 'POST', body }),
      invalidatesTags: ['Departments'],
    }),

    updateDepartment: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/departments/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Departments'],
    }),

    deleteDepartment: builder.mutation<void, string>({
      query: (id) => ({ url: `/departments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Departments'],
    }),

    moveDepartment: builder.mutation<void, { id: string; newParentId: string | null }>({
      query: ({ id, newParentId }) => ({ url: `/departments/${id}/move`, method: 'POST', body: { newParentId } }),
      invalidatesTags: ['Departments'],
    }),

    // ─── Positions ──────────────────────────
    getPositions: builder.query<ApiResponse<{ id: string; name: string; level: number; departmentId?: string }[]>, void>({
      query: () => '/positions',
      providesTags: ['Positions'],
    }),

    createPosition: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/positions', method: 'POST', body }),
      invalidatesTags: ['Positions'],
    }),

    deletePosition: builder.mutation<void, string>({
      query: (id) => ({ url: `/positions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Positions'],
    }),

    // ─── Invitations ─────────────────────────
    getInvitations: builder.query<ApiResponse<{ id: string; email: string; role: { name: string } | null; inviter: { email: string }; expiresAt: string; acceptedAt: string | null; createdAt: string }[]>, void>({
      query: () => '/invitations',
      providesTags: ['Invitations'],
    }),

    sendInvitation: builder.mutation<ApiResponse<{ id: string; email: string; inviteUrl: string; expiresAt: string }>, { email: string; roleId?: string; departmentId?: string; message?: string }>({
      query: (body) => ({ url: '/invitations', method: 'POST', body }),
      invalidatesTags: ['Invitations'],
    }),

    revokeInvitation: builder.mutation<void, string>({
      query: (id) => ({ url: `/invitations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invitations'],
    }),

    acceptInvitation: builder.mutation<ApiResponse<{ id: string; email: string }>, { token: string; firstName: string; lastName: string; password: string }>({
      query: (body) => ({ url: '/invitations/accept', method: 'POST', body }),
    }),

    // ─── Permission Overrides ────────────────
    addPermissionOverride: builder.mutation<void, { userId: string; permissionCode: string; overrideType: 'grant' | 'revoke'; reason?: string; expiresAt?: string }>({
      query: ({ userId, ...body }) => ({ url: `/users/${userId}/permission-overrides`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }],
    }),

    removePermissionOverride: builder.mutation<void, { userId: string; overrideId: string }>({
      query: ({ userId, overrideId }) => ({ url: `/users/${userId}/permission-overrides/${overrideId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeactivateUserMutation,
  useAssignUserRoleMutation,
  useRemoveUserRoleMutation,
  useReactivateUserMutation,
  useAdminResetPasswordMutation,
  useGetRolesQuery,
  useGetRoleQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetRoleTemplatesQuery,
  useGetPermissionsQuery,
  useGetDepartmentTreeQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useGetPositionsQuery,
  useCreatePositionMutation,
  useDeletePositionMutation,
  useGetInvitationsQuery,
  useSendInvitationMutation,
  useRevokeInvitationMutation,
  useAcceptInvitationMutation,
  useAddPermissionOverrideMutation,
  useRemovePermissionOverrideMutation,
  useCreateRoleFromTemplateMutation,
  useMoveDepartmentMutation,
  useUploadAvatarMutation,
  useImportUsersMutation,
} = usersApi;
