import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

export const biApi = createApi({
  reducerPath: 'biApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1/bi',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      return headers;
    },
  }),
  tagTypes: ['ExecutiveSummary', 'Forecasts', 'Anomalies', 'BiReports'],
  endpoints: (builder) => ({
    // ── Executive Summary ──
    getExecutiveSummary: builder.query<any, { propertyIds?: string; dateRange?: string }>({
      query: (params) => ({ url: '/executive-summary', params }),
      providesTags: ['ExecutiveSummary'],
    }),

    // ── Forecasts ──
    getOccupancyForecast: builder.query<any, { propertyId?: string; period?: string }>({
      query: (params) => ({ url: '/forecasts/occupancy', params }),
      providesTags: ['Forecasts'],
    }),
    getRevenueForecast: builder.query<any, { propertyId?: string; period?: string }>({
      query: (params) => ({ url: '/forecasts/revenue', params }),
      providesTags: ['Forecasts'],
    }),

    // ── Anomalies ──
    getAnomalies: builder.query<any, { propertyId?: string; acknowledged?: string; page?: number }>({
      query: (params) => ({ url: '/anomalies', params }),
      providesTags: ['Anomalies'],
    }),
    detectAnomalies: builder.mutation<any, void>({
      query: () => ({ url: '/anomalies/detect', method: 'POST' }),
      invalidatesTags: ['Anomalies'],
    }),
    acknowledgeAnomaly: builder.mutation<any, string>({
      query: (id) => ({ url: `/anomalies/${id}/acknowledge`, method: 'POST' }),
      invalidatesTags: ['Anomalies'],
    }),
    markFalsePositive: builder.mutation<any, string>({
      query: (id) => ({ url: `/anomalies/${id}/false-positive`, method: 'POST' }),
      invalidatesTags: ['Anomalies'],
    }),

    // ── Saved Reports ──
    getBiReports: builder.query<any, { reportType?: string; page?: number }>({
      query: (params) => ({ url: '/reports', params }),
      providesTags: ['BiReports'],
    }),
    createBiReport: builder.mutation<any, any>({
      query: (body) => ({ url: '/reports', method: 'POST', body }),
      invalidatesTags: ['BiReports'],
    }),
    runBiReport: builder.query<any, string>({
      query: (id) => `/reports/${id}/run`,
    }),
    deleteBiReport: builder.mutation<any, string>({
      query: (id) => ({ url: `/reports/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BiReports'],
    }),
  }),
});

export const {
  useGetExecutiveSummaryQuery,
  useGetOccupancyForecastQuery, useGetRevenueForecastQuery,
  useGetAnomaliesQuery, useDetectAnomaliesMutation,
  useAcknowledgeAnomalyMutation, useMarkFalsePositiveMutation,
  useGetBiReportsQuery, useCreateBiReportMutation,
  useLazyRunBiReportQuery, useDeleteBiReportMutation,
} = biApi;
