import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export const facilityApi = createApi({
  reducerPath: 'facilityApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['FacilityAssets', 'CamCosts', 'FacilityStats'],
  endpoints: (builder) => ({
    // ── Assets ──────────────────────────────
    getFacilityAssets: builder.query<any, {
      propertyId?: string; assetType?: string; status?: string;
      serviceOverdue?: boolean; search?: string;
      page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/facility/assets', params }),
      providesTags: ['FacilityAssets'],
    }),
    getFacilityAssetById: builder.query<any, string>({
      query: (id) => `/facility/assets/${id}`,
      providesTags: ['FacilityAssets'],
    }),
    createFacilityAsset: builder.mutation<any, any>({
      query: (body) => ({ url: '/facility/assets', method: 'POST', body }),
      invalidatesTags: ['FacilityAssets', 'FacilityStats'],
    }),
    updateFacilityAsset: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/facility/assets/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['FacilityAssets', 'FacilityStats'],
    }),
    deleteFacilityAsset: builder.mutation<any, string>({
      query: (id) => ({ url: `/facility/assets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FacilityAssets', 'FacilityStats'],
    }),
    getServiceDueAssets: builder.query<any, { propertyId?: string; days?: number }>({
      query: (params) => ({ url: '/facility/assets/service-due', params }),
    }),
    getWarrantyExpiringAssets: builder.query<any, { days?: number }>({
      query: (params) => ({ url: '/facility/assets/warranty-expiring', params }),
    }),

    // ── CAM Costs ───────────────────────────
    getCamCosts: builder.query<any, {
      propertyId?: string; year?: number; month?: number;
      page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/facility/cam-costs', params }),
      providesTags: ['CamCosts'],
    }),
    createCamCost: builder.mutation<any, any>({
      query: (body) => ({ url: '/facility/cam-costs', method: 'POST', body }),
      invalidatesTags: ['CamCosts'],
    }),
    getCamCostSummary: builder.query<any, { propertyId: string; year: number; month: number }>({
      query: (params) => ({ url: '/facility/cam-costs/summary', params }),
      providesTags: ['CamCosts'],
    }),

    // ── Stats ───────────────────────────────
    getFacilityStats: builder.query<any, { propertyId?: string }>({
      query: (params) => ({ url: '/facility/stats', params }),
      providesTags: ['FacilityStats'],
    }),

    // ── Scan / Service History ──────────────
    scanFacilityAsset: builder.query<any, string>({
      query: (id) => `/facility/assets/${id}/scan`,
    }),
    getAssetServiceHistory: builder.query<any, string>({
      query: (assetId) => `/pm/work-orders/asset-history/${assetId}`,
    }),
  }),
});

export const {
  useGetFacilityAssetsQuery,
  useGetFacilityAssetByIdQuery,
  useCreateFacilityAssetMutation,
  useUpdateFacilityAssetMutation,
  useDeleteFacilityAssetMutation,
  useGetServiceDueAssetsQuery,
  useGetWarrantyExpiringAssetsQuery,
  useGetCamCostsQuery,
  useCreateCamCostMutation,
  useGetCamCostSummaryQuery,
  useGetFacilityStatsQuery,
  useScanFacilityAssetQuery,
  useGetAssetServiceHistoryQuery,
} = facilityApi;
