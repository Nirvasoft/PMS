import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseUrl = (import.meta as any).env?.VITE_API_URL || '/api/v1';

export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  baseQuery: fetchBaseQuery({
    baseUrl,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Integrations', 'SyncLogs', 'Webhooks', 'Deliveries', 'ApiKeys'],
  endpoints: (builder) => ({

    // ── Integrations ──
    getIntegrationTypes: builder.query<any, void>({
      query: () => '/integrations/types',
    }),
    getIntegrations: builder.query<any, void>({
      query: () => '/integrations',
      providesTags: ['Integrations'],
    }),
    createIntegration: builder.mutation<any, any>({
      query: (body) => ({ url: '/integrations', method: 'POST', body }),
      invalidatesTags: ['Integrations'],
    }),
    updateIntegration: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/integrations/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Integrations'],
    }),
    deleteIntegration: builder.mutation<any, string>({
      query: (id) => ({ url: `/integrations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Integrations'],
    }),
    testIntegration: builder.mutation<any, string>({
      query: (id) => ({ url: `/integrations/${id}/test`, method: 'POST' }),
      invalidatesTags: ['Integrations'],
    }),
    triggerSync: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/integrations/${id}/sync`, method: 'POST', body: data }),
      invalidatesTags: ['Integrations', 'SyncLogs'],
    }),
    getSyncLogs: builder.query<any, { integrationId: string; page?: number }>({
      query: ({ integrationId, page = 1 }) => `/integrations/${integrationId}/sync-logs?page=${page}`,
      providesTags: ['SyncLogs'],
    }),

    // ── Webhooks ──
    getWebhookEvents: builder.query<any, void>({
      query: () => '/developer/webhook-events',
    }),
    getWebhooks: builder.query<any, void>({
      query: () => '/developer/webhooks',
      providesTags: ['Webhooks'],
    }),
    createWebhook: builder.mutation<any, any>({
      query: (body) => ({ url: '/developer/webhooks', method: 'POST', body }),
      invalidatesTags: ['Webhooks'],
    }),
    updateWebhook: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/developer/webhooks/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Webhooks'],
    }),
    deleteWebhook: builder.mutation<any, string>({
      query: (id) => ({ url: `/developer/webhooks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Webhooks'],
    }),
    testWebhook: builder.mutation<any, string>({
      query: (id) => ({ url: `/developer/webhooks/${id}/test`, method: 'POST' }),
    }),
    getDeliveries: builder.query<any, { endpointId: string; page?: number }>({
      query: ({ endpointId, page = 1 }) => `/developer/webhooks/${endpointId}/deliveries?page=${page}`,
      providesTags: ['Deliveries'],
    }),
    retryDelivery: builder.mutation<any, string>({
      query: (id) => ({ url: `/developer/webhooks/deliveries/${id}/retry`, method: 'POST' }),
      invalidatesTags: ['Deliveries'],
    }),

    // ── API Keys ──
    getApiKeyScopes: builder.query<any, void>({
      query: () => '/developer/api-key-scopes',
    }),
    getApiKeys: builder.query<any, void>({
      query: () => '/developer/api-keys',
      providesTags: ['ApiKeys'],
    }),
    createApiKey: builder.mutation<any, any>({
      query: (body) => ({ url: '/developer/api-keys', method: 'POST', body }),
      invalidatesTags: ['ApiKeys'],
    }),
    deleteApiKey: builder.mutation<any, string>({
      query: (id) => ({ url: `/developer/api-keys/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ApiKeys'],
    }),
    revokeApiKey: builder.mutation<any, string>({
      query: (id) => ({ url: `/developer/api-keys/${id}/revoke`, method: 'POST' }),
      invalidatesTags: ['ApiKeys'],
    }),
  }),
});

export const {
  useGetIntegrationTypesQuery,
  useGetIntegrationsQuery,
  useCreateIntegrationMutation,
  useUpdateIntegrationMutation,
  useDeleteIntegrationMutation,
  useTestIntegrationMutation,
  useTriggerSyncMutation,
  useGetSyncLogsQuery,
  useGetWebhookEventsQuery,
  useGetWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useTestWebhookMutation,
  useGetDeliveriesQuery,
  useRetryDeliveryMutation,
  useGetApiKeyScopesQuery,
  useGetApiKeysQuery,
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
  useRevokeApiKeyMutation,
} = integrationsApi;
