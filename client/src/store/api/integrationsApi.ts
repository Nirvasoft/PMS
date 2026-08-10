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
  tagTypes: ['Integrations', 'SyncLogs', 'Webhooks', 'Deliveries', 'ApiKeys', 'BmsDevices'],
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
    getEntityMap: builder.query<any, { integrationId?: string; entityType?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.integrationId) qs.set('integrationId', params.integrationId);
        if (params?.entityType) qs.set('entityType', params.entityType);
        return `/integrations/entity-map?${qs.toString()}`;
      },
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

    // ── BMS (Building Management System) ──
    getBmsSummary: builder.query<any, void>({
      query: () => '/bms/summary',
      providesTags: ['BmsDevices'],
    }),
    getBmsMeta: builder.query<any, void>({
      query: () => '/bms/meta',
    }),
    getBmsDevices: builder.query<any, { propertyId?: string; deviceType?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.propertyId) qs.set('propertyId', params.propertyId);
        if (params?.deviceType) qs.set('deviceType', params.deviceType);
        return `/bms/devices?${qs.toString()}`;
      },
      providesTags: ['BmsDevices'],
    }),
    getBmsDevice: builder.query<any, string>({
      query: (id) => `/bms/devices/${id}`,
      providesTags: ['BmsDevices'],
    }),
    createBmsDevice: builder.mutation<any, any>({
      query: (body) => ({ url: '/bms/devices', method: 'POST', body }),
      invalidatesTags: ['BmsDevices'],
    }),
    updateBmsDevice: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/bms/devices/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['BmsDevices'],
    }),
    deleteBmsDevice: builder.mutation<any, string>({
      query: (id) => ({ url: `/bms/devices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BmsDevices'],
    }),
    getBmsReadings: builder.query<any, { deviceId: string; pointName?: string; from?: string; to?: string; limit?: number }>({
      query: ({ deviceId, ...params }) => {
        const qs = new URLSearchParams();
        if (params.pointName) qs.set('pointName', params.pointName);
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        if (params.limit) qs.set('limit', String(params.limit));
        return `/bms/devices/${deviceId}/readings?${qs.toString()}`;
      },
    }),
    getBmsFaults: builder.query<any, string>({
      query: (deviceId) => `/bms/devices/${deviceId}/faults`,
    }),
    pollBmsDevice: builder.mutation<any, string>({
      query: (id) => ({ url: `/bms/devices/${id}/poll`, method: 'POST' }),
      invalidatesTags: ['BmsDevices'],
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
  useGetEntityMapQuery,
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
  // BMS
  useGetBmsSummaryQuery,
  useGetBmsMetaQuery,
  useGetBmsDevicesQuery,
  useGetBmsDeviceQuery,
  useCreateBmsDeviceMutation,
  useUpdateBmsDeviceMutation,
  useDeleteBmsDeviceMutation,
  useGetBmsReadingsQuery,
  useGetBmsFaultsQuery,
  usePollBmsDeviceMutation,
} = integrationsApi;

