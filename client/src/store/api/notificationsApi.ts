import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> { success: boolean; data: T; }

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  icon: string;
  actionType: string | null;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPref {
  templateCode: string;
  name: string;
  channels: string[];
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
}

export interface NotificationLogItem {
  id: string;
  templateCode: string | null;
  channel: string;
  subject: string | null;
  body: string | null;
  status: string;
  provider: string | null;
  errorMessage: string | null;
  retryCount: number;
  sentAt: string | null;
  entityType: string | null;
  createdAt: string;
  recipient: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
  } | null;
}

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  channels: string[];
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  bodyPush: string | null;
  variables: { name: string; type: string; required: boolean }[];
  isCritical: boolean;
  isActive: boolean;
}

interface PaginatedNotifications {
  success: boolean;
  data: InAppNotification[];
  meta: { total: number; page: number; limit: number; totalPages: number; unreadCount: number };
}

interface PaginatedLogs {
  success: boolean;
  data: NotificationLogItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['InAppNotifications', 'Preferences', 'Templates', 'Logs'],
  endpoints: (builder) => ({
    // In-app notifications
    getInAppNotifications: builder.query<PaginatedNotifications, { isRead?: string; page?: string; limit?: string }>({
      query: (params) => ({ url: '/notifications/in-app', params }),
      providesTags: ['InAppNotifications'],
    }),

    markAsRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/in-app/${id}/read`, method: 'PUT' }),
      invalidatesTags: ['InAppNotifications'],
    }),

    markAllRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/in-app/read-all', method: 'POST' }),
      invalidatesTags: ['InAppNotifications'],
    }),

    deleteNotification: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/in-app/${id}`, method: 'DELETE' }),
      invalidatesTags: ['InAppNotifications'],
    }),

    // Preferences
    getPreferences: builder.query<ApiResponse<{ preferences: NotificationPref[]; quietHoursStart: string | null; quietHoursEnd: string | null }>, void>({
      query: () => '/notifications/preferences',
      providesTags: ['Preferences'],
    }),

    updatePreferences: builder.mutation<void, { preferences: Partial<NotificationPref>[]; quietHoursStart?: string; quietHoursEnd?: string }>({
      query: (body) => ({ url: '/notifications/preferences', method: 'PUT', body }),
      invalidatesTags: ['Preferences'],
    }),

    // Logs (admin)
    getNotificationLogs: builder.query<PaginatedLogs, Record<string, string>>({
      query: (params) => ({ url: '/notifications/logs', params }),
      providesTags: ['Logs'],
    }),

    retryNotification: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/logs/${id}/retry`, method: 'POST' }),
      invalidatesTags: ['Logs'],
    }),

    // Send
    sendNotification: builder.mutation<ApiResponse<{ queued: number }>, {
      templateCode: string; recipientIds: string[]; channels?: string[];
      variables?: Record<string, unknown>; entityType?: string; entityId?: string;
    }>({
      query: (body) => ({ url: '/notifications/send', method: 'POST', body }),
      invalidatesTags: ['InAppNotifications', 'Logs'],
    }),

    // Templates
    getNotificationTemplates: builder.query<ApiResponse<NotificationTemplate[]>, void>({
      query: () => '/notification-templates',
      providesTags: ['Templates'],
    }),
  }),
});

export const {
  useGetInAppNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllReadMutation,
  useDeleteNotificationMutation,
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useGetNotificationLogsQuery,
  useRetryNotificationMutation,
  useSendNotificationMutation,
  useGetNotificationTemplatesQuery,
} = notificationsApi;
