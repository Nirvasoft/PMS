import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const pmApi = createApi({
  reducerPath: 'pmApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['PmSchedules', 'PmWorkOrders'],
  endpoints: (builder) => ({
    // ── Schedules ──────────────────────────────
    getPmSchedules: builder.query<any, {
      propertyId?: string; status?: string; frequencyType?: string;
      search?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/pm/schedules', params }),
      providesTags: ['PmSchedules'],
    }),
    getPmScheduleById: builder.query<any, string>({
      query: (id) => `/pm/schedules/${id}`,
      providesTags: ['PmSchedules'],
    }),
    createPmSchedule: builder.mutation<any, any>({
      query: (body) => ({ url: '/pm/schedules', method: 'POST', body }),
      invalidatesTags: ['PmSchedules'],
    }),
    updatePmSchedule: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/pm/schedules/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['PmSchedules'],
    }),
    pausePmSchedule: builder.mutation<any, string>({
      query: (id) => ({ url: `/pm/schedules/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['PmSchedules'],
    }),
    resumePmSchedule: builder.mutation<any, string>({
      query: (id) => ({ url: `/pm/schedules/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['PmSchedules'],
    }),
    generatePmWorkOrder: builder.mutation<any, string>({
      query: (id) => ({ url: `/pm/schedules/${id}/generate`, method: 'POST' }),
      invalidatesTags: ['PmSchedules', 'PmWorkOrders'],
    }),
    getPmScheduleHistory: builder.query<any, string>({
      query: (id) => `/pm/schedules/${id}/history`,
      providesTags: ['PmWorkOrders'],
    }),

    // ── Work Orders ───────────────────────────
    getPmWorkOrders: builder.query<any, {
      scheduleId?: string; status?: string; propertyId?: string;
      from?: string; to?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/pm/work-orders', params }),
      providesTags: ['PmWorkOrders'],
    }),
    getPmWorkOrderById: builder.query<any, string>({
      query: (id) => `/pm/work-orders/${id}`,
      providesTags: ['PmWorkOrders'],
    }),
    completePmWorkOrder: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/pm/work-orders/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['PmWorkOrders', 'PmSchedules'],
    }),

    // ── Upcoming ──────────────────────────────
    getUpcomingPm: builder.query<any, { propertyId?: string; days?: number }>({
      query: (params) => ({ url: '/pm/upcoming', params }),
      providesTags: ['PmSchedules'],
    }),
  }),
});

export const {
  useGetPmSchedulesQuery,
  useGetPmScheduleByIdQuery,
  useCreatePmScheduleMutation,
  useUpdatePmScheduleMutation,
  usePausePmScheduleMutation,
  useResumePmScheduleMutation,
  useGeneratePmWorkOrderMutation,
  useGetPmScheduleHistoryQuery,
  useGetPmWorkOrdersQuery,
  useGetPmWorkOrderByIdQuery,
  useCompletePmWorkOrderMutation,
  useGetUpcomingPmQuery,
} = pmApi;
