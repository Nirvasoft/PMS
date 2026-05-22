import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const housekeepingApi = createApi({
  reducerPath: 'housekeepingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['HkZones', 'HkSchedules', 'HkTasks', 'HkInspections'],
  endpoints: (builder) => ({
    getHkZones: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/housekeeping/zones', params }),
      providesTags: ['HkZones'],
    }),
    createHkZone: builder.mutation<any, any>({
      query: (body) => ({ url: '/housekeeping/zones', method: 'POST', body }),
      invalidatesTags: ['HkZones'],
    }),
    getHkSchedules: builder.query<any, any>({
      query: (params) => ({ url: '/housekeeping/schedules', params }),
      providesTags: ['HkSchedules'],
    }),
    createHkSchedule: builder.mutation<any, any>({
      query: (body) => ({ url: '/housekeeping/schedules', method: 'POST', body }),
      invalidatesTags: ['HkSchedules'],
    }),
    getHkTasks: builder.query<any, any>({
      query: (params) => ({ url: '/housekeeping/tasks', params }),
      providesTags: ['HkTasks'],
    }),
    startHkTask: builder.mutation<any, string>({
      query: (id) => ({ url: `/housekeeping/tasks/${id}/start`, method: 'POST' }),
      invalidatesTags: ['HkTasks'],
    }),
    completeHkTask: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/housekeeping/tasks/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['HkTasks'],
    }),
    getHkInspections: builder.query<any, any>({
      query: (params) => ({ url: '/housekeeping/inspections', params }),
      providesTags: ['HkInspections'],
    }),
    createHkInspection: builder.mutation<any, any>({
      query: (body) => ({ url: '/housekeeping/inspections', method: 'POST', body }),
      invalidatesTags: ['HkInspections'],
    }),
    getHkStats: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/housekeeping/stats', params }),
    }),
  }),
});

export const {
  useGetHkZonesQuery, useCreateHkZoneMutation,
  useGetHkSchedulesQuery, useCreateHkScheduleMutation,
  useGetHkTasksQuery, useStartHkTaskMutation, useCompleteHkTaskMutation,
  useGetHkInspectionsQuery, useCreateHkInspectionMutation,
  useGetHkStatsQuery,
} = housekeepingApi;
