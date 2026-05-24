import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

export const condoApi = createApi({
  reducerPath: 'condoApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1/condo',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      return headers;
    },
  }),
  tagTypes: ['SmartReadings', 'SmartDevices', 'Funds', 'FundTransactions', 'Meetings', 'MeetingDetail', 'Bylaws', 'Violations'],
  endpoints: (builder) => ({
    // ── Smart Meters ──
    getMeterReadings: builder.query<any, { meterId: string; from?: string; to?: string }>({
      query: ({ meterId, ...params }) => ({ url: `/meters/${meterId}/readings`, params }),
      providesTags: ['SmartReadings'],
    }),
    addMeterReading: builder.mutation<any, { meterId: string; data: any }>({
      query: ({ meterId, data }) => ({ url: `/meters/${meterId}/readings`, method: 'POST', body: data }),
      invalidatesTags: ['SmartReadings'],
    }),
    getSmartDevices: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/meters/devices', params }),
      providesTags: ['SmartDevices'],
    }),
    upsertSmartDevice: builder.mutation<any, { meterId: string; data: any }>({
      query: ({ meterId, data }) => ({ url: `/meters/${meterId}/device`, method: 'PUT', body: data }),
      invalidatesTags: ['SmartDevices'],
    }),

    // ── Funds ──
    getFunds: builder.query<any, { propertyId: string; year?: number }>({
      query: (params) => ({ url: '/funds', params }),
      providesTags: ['Funds'],
    }),
    createFund: builder.mutation<any, any>({
      query: (body) => ({ url: '/funds', method: 'POST', body }),
      invalidatesTags: ['Funds'],
    }),
    getFundTransactions: builder.query<any, { fundId: string; from?: string; to?: string; type?: string; page?: number }>({
      query: ({ fundId, ...params }) => ({ url: `/funds/${fundId}/transactions`, params }),
      providesTags: ['FundTransactions'],
    }),
    addFundTransaction: builder.mutation<any, { fundId: string; data: any }>({
      query: ({ fundId, data }) => ({ url: `/funds/${fundId}/transactions`, method: 'POST', body: data }),
      invalidatesTags: ['Funds', 'FundTransactions'],
    }),

    // ── Meetings ──
    getMeetings: builder.query<any, { propertyId?: string; year?: number; meetingType?: string }>({
      query: (params) => ({ url: '/meetings', params }),
      providesTags: ['Meetings'],
    }),
    createMeeting: builder.mutation<any, any>({
      query: (body) => ({ url: '/meetings', method: 'POST', body }),
      invalidatesTags: ['Meetings'],
    }),
    getMeetingDetail: builder.query<any, string>({
      query: (id) => `/meetings/${id}`,
      providesTags: ['MeetingDetail'],
    }),
    updateMeetingStatus: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/meetings/${id}/status`, method: 'PATCH', body: data }),
      invalidatesTags: ['Meetings', 'MeetingDetail'],
    }),
    addResolution: builder.mutation<any, { meetingId: string; data: any }>({
      query: ({ meetingId, data }) => ({ url: `/meetings/${meetingId}/resolutions`, method: 'POST', body: data }),
      invalidatesTags: ['MeetingDetail'],
    }),
    castVote: builder.mutation<any, { meetingId: string; resolutionId: string; data: any }>({
      query: ({ meetingId, resolutionId, data }) => ({
        url: `/meetings/${meetingId}/resolutions/${resolutionId}/vote`, method: 'POST', body: data,
      }),
      invalidatesTags: ['MeetingDetail'],
    }),
    submitProxy: builder.mutation<any, { meetingId: string; data: any }>({
      query: ({ meetingId, data }) => ({ url: `/meetings/${meetingId}/proxies`, method: 'POST', body: data }),
      invalidatesTags: ['MeetingDetail'],
    }),
    getMeetingResults: builder.query<any, string>({
      query: (id) => `/meetings/${id}/results`,
    }),

    // ── Bylaws ──
    getBylaws: builder.query<any, { propertyId?: string; category?: string; isActive?: boolean }>({
      query: (params) => ({ url: '/bylaws', params }),
      providesTags: ['Bylaws'],
    }),
    createBylaw: builder.mutation<any, any>({
      query: (body) => ({ url: '/bylaws', method: 'POST', body }),
      invalidatesTags: ['Bylaws'],
    }),
    updateBylaw: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/bylaws/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Bylaws'],
    }),

    // ── Violations ──
    getViolations: builder.query<any, { propertyId?: string; bylawId?: string; status?: string; page?: number }>({
      query: (params) => ({ url: '/violations', params }),
      providesTags: ['Violations'],
    }),
    createViolation: builder.mutation<any, any>({
      query: (body) => ({ url: '/violations', method: 'POST', body }),
      invalidatesTags: ['Violations'],
    }),
    fineViolation: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/violations/${id}/fine`, method: 'POST', body: data }),
      invalidatesTags: ['Violations'],
    }),
    appealViolation: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/violations/${id}/appeal`, method: 'POST', body: data }),
      invalidatesTags: ['Violations'],
    }),
    resolveViolation: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/violations/${id}/resolve`, method: 'POST', body: data }),
      invalidatesTags: ['Violations'],
    }),
  }),
});

export const {
  useGetMeterReadingsQuery, useAddMeterReadingMutation,
  useGetSmartDevicesQuery, useUpsertSmartDeviceMutation,
  useGetFundsQuery, useCreateFundMutation,
  useGetFundTransactionsQuery, useAddFundTransactionMutation,
  useGetMeetingsQuery, useCreateMeetingMutation,
  useGetMeetingDetailQuery, useUpdateMeetingStatusMutation,
  useAddResolutionMutation, useCastVoteMutation, useSubmitProxyMutation,
  useGetMeetingResultsQuery,
  useGetBylawsQuery, useCreateBylawMutation, useUpdateBylawMutation,
  useGetViolationsQuery, useCreateViolationMutation,
  useFineViolationMutation, useAppealViolationMutation, useResolveViolationMutation,
} = condoApi;
