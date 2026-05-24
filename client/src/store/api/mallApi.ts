import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

export const mallApi = createApi({
  reducerPath: 'mallApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1/mall',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      return headers;
    },
  }),
  tagTypes: ['Shops', 'GtoSubmissions', 'CamPools', 'CamBillings', 'Events', 'Footfall', 'MallDashboard'],
  endpoints: (builder) => ({
    // ── Mall Config ──
    getMallProperty: builder.query<any, { propertyId: string }>({
      query: ({ propertyId }) => `/properties/${propertyId}/config`,
    }),
    upsertMallProperty: builder.mutation<any, { propertyId: string; data: any }>({
      query: ({ propertyId, data }) => ({
        url: `/properties/${propertyId}/config`, method: 'PUT', body: data,
      }),
      invalidatesTags: ['MallDashboard'],
    }),

    // ── Shops ──
    getShops: builder.query<any, {
      propertyId?: string; tradeCategory?: string; shopZone?: string;
      isAnchor?: boolean; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/shops', params }),
      providesTags: ['Shops'],
    }),
    getShopProfile: builder.query<any, string>({
      query: (unitId) => `/shops/${unitId}`,
      providesTags: ['Shops'],
    }),
    upsertShopProfile: builder.mutation<any, { unitId: string; data: any }>({
      query: ({ unitId, data }) => ({
        url: `/shops/${unitId}/profile`, method: 'PUT', body: data,
      }),
      invalidatesTags: ['Shops'],
    }),
    getTenantMix: builder.query<any, { propertyId: string }>({
      query: ({ propertyId }) => ({ url: '/tenant-mix', params: { propertyId } }),
      providesTags: ['Shops'],
    }),
    getAvailableUnits: builder.query<any, { propertyId: string }>({
      query: ({ propertyId }) => ({ url: '/shops/available-units', params: { propertyId } }),
    }),

    // ── Commercial Leases ──
    getCommercialLease: builder.query<any, string>({
      query: (leaseId) => `/commercial-leases/${leaseId}`,
    }),
    upsertCommercialLease: builder.mutation<any, { leaseId: string; data: any }>({
      query: ({ leaseId, data }) => ({
        url: `/commercial-leases/${leaseId}`, method: 'PUT', body: data,
      }),
    }),

    // ── GTO Submissions ──
    getGtoSubmissions: builder.query<any, {
      propertyId?: string; leaseId?: string; month?: number;
      year?: number; verified?: boolean; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/gto', params }),
      providesTags: ['GtoSubmissions'],
    }),
    submitGto: builder.mutation<any, any>({
      query: (body) => ({ url: '/gto', method: 'POST', body }),
      invalidatesTags: ['GtoSubmissions', 'MallDashboard'],
    }),
    verifyGto: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({
        url: `/gto/${id}/verify`, method: 'POST', body: data,
      }),
      invalidatesTags: ['GtoSubmissions'],
    }),
    getGtoSummary: builder.query<any, { propertyId: string; month: number; year: number }>({
      query: (params) => ({ url: '/gto/summary', params }),
      providesTags: ['GtoSubmissions'],
    }),

    // ── CAM ──
    getCamPools: builder.query<any, { propertyId: string; year: number }>({
      query: (params) => ({ url: '/cam/pools', params }),
      providesTags: ['CamPools'],
    }),
    createCamPool: builder.mutation<any, any>({
      query: (body) => ({ url: '/cam/pools', method: 'POST', body }),
      invalidatesTags: ['CamPools'],
    }),
    updateCamPool: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/cam/pools/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['CamPools'],
    }),
    getCamBillings: builder.query<any, {
      propertyId?: string; month?: number; year?: number; unitId?: string;
    }>({
      query: (params) => ({ url: '/cam/billing', params }),
      providesTags: ['CamBillings'],
    }),
    getCamReconciliations: builder.query<any, { propertyId: string; year: number }>({
      query: (params) => ({ url: '/cam/reconciliations', params }),
      providesTags: ['CamBillings'],
    }),

    // ── Events ──
    getMallEvents: builder.query<any, {
      propertyId?: string; status?: string; from?: string; to?: string;
      page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/events', params }),
      providesTags: ['Events'],
    }),
    getMallEventDetail: builder.query<any, string>({
      query: (id) => `/events/${id}`,
      providesTags: ['Events'],
    }),
    createMallEvent: builder.mutation<any, any>({
      query: (body) => ({ url: '/events', method: 'POST', body }),
      invalidatesTags: ['Events', 'MallDashboard'],
    }),
    updateMallEvent: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/events/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Events'],
    }),
    createBooth: builder.mutation<any, { eventId: string; data: any }>({
      query: ({ eventId, data }) => ({
        url: `/events/${eventId}/booths`, method: 'POST', body: data,
      }),
      invalidatesTags: ['Events'],
    }),

    // ── Footfall ──
    getFootfallSensors: builder.query<any, { propertyId: string }>({
      query: ({ propertyId }) => ({ url: '/footfall/sensors', params: { propertyId } }),
      providesTags: ['Footfall'],
    }),
    createFootfallSensor: builder.mutation<any, any>({
      query: (body) => ({ url: '/footfall/sensors', method: 'POST', body }),
      invalidatesTags: ['Footfall'],
    }),

    // ── Dashboard ──
    getMallDashboard: builder.query<any, { propertyId: string }>({
      query: ({ propertyId }) => ({ url: '/dashboard', params: { propertyId } }),
      providesTags: ['MallDashboard'],
    }),
  }),
});

export const {
  useGetMallPropertyQuery,
  useUpsertMallPropertyMutation,
  useGetShopsQuery,
  useGetShopProfileQuery,
  useUpsertShopProfileMutation,
  useGetTenantMixQuery,
  useGetAvailableUnitsQuery,
  useGetCommercialLeaseQuery,
  useUpsertCommercialLeaseMutation,
  useGetGtoSubmissionsQuery,
  useSubmitGtoMutation,
  useVerifyGtoMutation,
  useGetGtoSummaryQuery,
  useGetCamPoolsQuery,
  useCreateCamPoolMutation,
  useUpdateCamPoolMutation,
  useGetCamBillingsQuery,
  useGetCamReconciliationsQuery,
  useGetMallEventsQuery,
  useGetMallEventDetailQuery,
  useCreateMallEventMutation,
  useUpdateMallEventMutation,
  useCreateBoothMutation,
  useGetFootfallSensorsQuery,
  useCreateFootfallSensorMutation,
  useGetMallDashboardQuery,
} = mallApi;
