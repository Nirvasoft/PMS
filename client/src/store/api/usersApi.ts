import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';
import { organizationApi } from './organizationApi';

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
  roles: {
    id: string; name: string; propertyId: string | null; expiresAt: string | null;
    scopedProperties: { id: string; name: string }[];
  }[];
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
  properties?: { id: string; name: string }[];
  propertyIds?: string[];
  floorNumbers?: number[];
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
      // Also provides the generic 'Users' tag: a role-permission change (updateRole)
      // only knows the role id, not which users hold it, so it can only invalidate the
      // generic tag — without this, an open UserDetailPage's Effective Permissions
      // would stay stale after editing that user's role elsewhere (e.g. Assign Permission).
      providesTags: (_r, _e, id) => [{ type: 'Users', id }, 'Users'],
    }),

    createUser: builder.mutation<ApiResponse<{ id: string; email: string }>, Record<string, unknown>>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      // 'Roles' too: creating a user can assign roles at creation time, changing their user counts.
      invalidatesTags: ['Users', 'Roles'],
      // Keep the Organization Summary user count live without a page reload.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
    }),

    updateUser: builder.mutation<ApiResponse<UserDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Users', id }, 'Users'],
    }),

    deactivateUser: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/users/${id}/deactivate`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Users', id }, 'Users'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
    }),

    assignUserRole: builder.mutation<void, { userId: string; roleId: string; expiresAt?: string }>({
      query: ({ userId, ...body }) => ({ url: `/users/${userId}/roles`, method: 'POST', body }),
      // 'Roles' too: assigning a role changes that role's displayed user count on the Roles page.
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }, 'Users', 'Roles'],
    }),

    removeUserRole: builder.mutation<void, { userId: string; roleId: string }>({
      query: ({ userId, roleId }) => ({ url: `/users/${userId}/roles/${roleId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }, 'Users', 'Roles'],
    }),

    reactivateUser: builder.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}/reactivate`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Users', id }, 'Users'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
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
      // 'Roles' too: the CSV can assign a role per row, changing role user counts.
      invalidatesTags: ['Users', 'Roles'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
    }),

    uploadAvatar: builder.mutation<ApiResponse<{ avatarUrl: string }>, { userId: string; file: File }>({
      query: ({ userId, file }) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return { url: `/users/${userId}/avatar`, method: 'POST', body: formData };
      },
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Users', id: userId }, 'Users'],
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

    createRole: builder.mutation<ApiResponse<RoleItem>, { name: string; description?: string; permissionCodes: string[]; propertyIds?: string[]; floorNumbers?: number[] }>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Roles'],
    }),

    updateRole: builder.mutation<ApiResponse<RoleItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/roles/${id}`, method: 'PUT', body: data }),
      // 'Users' too: renaming a role would otherwise leave stale role-name chips on the Users list.
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Roles', id }, 'Roles', 'Users'],
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
