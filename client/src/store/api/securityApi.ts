import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const securityApi = createApi({
  reducerPath: 'securityApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['SecurityIncidents', 'PatrolCheckpoints', 'PatrolLogs', 'AccessEvents'],
  endpoints: (builder) => ({
    getSecurityIncidents: builder.query<any, any>({
      query: (params) => ({ url: '/security/incidents', params }),
      providesTags: ['SecurityIncidents'],
    }),
    getSecurityIncidentById: builder.query<any, string>({
      query: (id) => `/security/incidents/${id}`,
      providesTags: ['SecurityIncidents'],
    }),
    createSecurityIncident: builder.mutation<any, any>({
      query: (body) => ({ url: '/security/incidents', method: 'POST', body }),
      invalidatesTags: ['SecurityIncidents'],
    }),
    updateSecurityIncident: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/security/incidents/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['SecurityIncidents'],
    }),
    resolveSecurityIncident: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/security/incidents/${id}/resolve`, method: 'POST', body: data }),
      invalidatesTags: ['SecurityIncidents'],
    }),
    getPatrolCheckpoints: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/security/patrol/checkpoints', params }),
      providesTags: ['PatrolCheckpoints'],
    }),
    createPatrolCheckpoint: builder.mutation<any, any>({
      query: (body) => ({ url: '/security/patrol/checkpoints', method: 'POST', body }),
      invalidatesTags: ['PatrolCheckpoints'],
    }),
    getPatrolLogs: builder.query<any, any>({
      query: (params) => ({ url: '/security/patrol/logs', params }),
      providesTags: ['PatrolLogs'],
    }),
    getSecurityStats: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/security/stats', params }),
    }),
    // Gap 13: Access control events
    getAccessEvents: builder.query<any, any>({
      query: (params) => ({ url: '/security/access-events', params }),
      providesTags: ['AccessEvents'],
    }),
  }),
});

export const {
  useGetSecurityIncidentsQuery, useGetSecurityIncidentByIdQuery,
  useCreateSecurityIncidentMutation, useUpdateSecurityIncidentMutation,
  useResolveSecurityIncidentMutation,
  useGetPatrolCheckpointsQuery, useCreatePatrolCheckpointMutation,
  useGetPatrolLogsQuery,
  useGetSecurityStatsQuery,
  useGetAccessEventsQuery,
} = securityApi;
