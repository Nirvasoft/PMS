import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export interface Budget {
  id: string; companyId: string; propertyId: string | null; departmentId: string | null;
  fiscalYear: number; glAccountId: string; name: string | null;
  annualAmount: number; monthlyAmounts: Record<string, number> | null;
  status: string; approvedBy: string | null; createdBy: string; createdAt: string;
  glAccount: { code: string; name: string; accountType?: string };
}

export interface BudgetVarianceRow {
  budgetId: string; glAccountId: string; glAccountCode: string; accountName: string;
  accountType: string; budgetAmount: number; actualAmount: number;
  variance: number; variancePct: number; status: string;
}

export interface FixedAsset {
  id: string; companyId: string; propertyId: string | null;
  assetNumber: string; name: string; category: string; description: string | null;
  acquisitionDate: string; acquisitionCost: number; usefulLifeYears: number;
  residualValue: number; depreciationMethod: string; decliningRate: number | null;
  accumulatedDepreciation: number; netBookValue: number;
  currentLocation: string | null; responsiblePersonId: string | null;
  status: string; disposalDate: string | null; disposalAmount: number | null;
  serialNumber: string | null; warrantyExpiry: string | null; photoUrl: string | null;
  createdAt: string; updatedAt: string;
}

export interface DepreciationEntry {
  id: string; assetId: string; fiscalPeriodId: string;
  depreciationDate: string; amount: number; netBookValueAfter: number;
  glJournalId: string | null; createdAt: string;
  fiscalPeriod?: { name: string };
}

export const assetsApi = createApi({
  reducerPath: 'assetsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Budgets', 'BudgetVariance', 'Assets', 'DepSchedule'],
  endpoints: (b) => ({
    // ── Budgets ─────────────────────
    getBudgets: b.query<Budget[], Record<string, any>>({
      query: (params) => ({ url: '/budgets', params }),
      transformResponse: (r: any) => r.data,
      providesTags: ['Budgets'],
    }),
    createBudget: b.mutation<Budget, any>({
      query: (body) => ({ url: '/budgets', method: 'POST', body }),
      invalidatesTags: ['Budgets'],
    }),
    updateBudget: b.mutation<Budget, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/budgets/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Budgets'],
    }),
    deleteBudget: b.mutation<void, string>({
      query: (id) => ({ url: `/budgets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Budgets'],
    }),
    approveBudget: b.mutation<Budget, string>({
      query: (id) => ({ url: `/budgets/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Budgets'],
    }),
    getBudgetVariance: b.query<{ rows: BudgetVarianceRow[]; summary: any }, Record<string, any>>({
      query: (params) => ({ url: '/budgets/variance', params }),
      transformResponse: (r: any) => r.data,
      providesTags: ['BudgetVariance'],
    }),

    // ── Fixed Assets ────────────────
    getAssets: b.query<{ data: FixedAsset[]; meta: any }, Record<string, any>>({
      query: (params) => ({ url: '/assets', params }),
      transformResponse: (r: any) => ({ data: r.data, meta: r.meta }),
      providesTags: ['Assets'],
    }),
    getAsset: b.query<FixedAsset & { depreciationEntries: DepreciationEntry[]; transfers: any[] }, string>({
      query: (id) => `/assets/${id}`,
      transformResponse: (r: any) => r.data,
      providesTags: ['Assets'],
    }),
    createAsset: b.mutation<FixedAsset, any>({
      query: (body) => ({ url: '/assets', method: 'POST', body }),
      invalidatesTags: ['Assets'],
    }),
    updateAsset: b.mutation<FixedAsset, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/assets/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Assets'],
    }),
    transferAsset: b.mutation<FixedAsset, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/assets/${id}/transfer`, method: 'POST', body: data }),
      invalidatesTags: ['Assets'],
    }),
    disposeAsset: b.mutation<FixedAsset, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/assets/${id}/dispose`, method: 'POST', body: data }),
      invalidatesTags: ['Assets'],
    }),
    getDepreciationSchedule: b.query<DepreciationEntry[], string>({
      query: (id) => `/assets/${id}/depreciation-schedule`,
      transformResponse: (r: any) => r.data,
      providesTags: ['DepSchedule'],
    }),
    runDepreciation: b.mutation<any, void>({
      query: () => ({ url: '/assets/depreciation/run', method: 'POST' }),
      invalidatesTags: ['Assets', 'DepSchedule'],
    }),
  }),
});

export const {
  useGetBudgetsQuery, useCreateBudgetMutation, useUpdateBudgetMutation,
  useDeleteBudgetMutation, useApproveBudgetMutation, useGetBudgetVarianceQuery,
  useGetAssetsQuery, useGetAssetQuery, useCreateAssetMutation, useUpdateAssetMutation,
  useTransferAssetMutation, useDisposeAssetMutation,
  useGetDepreciationScheduleQuery, useRunDepreciationMutation,
} = assetsApi;
