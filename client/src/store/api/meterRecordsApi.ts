import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ImportMeterRecordsResult {
  imported: number;
  billingSchedulesCreated: number;
  billingSchedulesUpdated: number;
  skipped: number;
  duplicatesSkipped: number;
}

export interface MeterRecordPreviewRow {
  meterNo: string;
  unitCode: string;
  meterType: string;
  category: string;
  rate: number;
  startUnit: number;
  endUnit: number;
  quantity: number;
  startDate: string;
  endDate: string;
  billDate: string;
  tenant: string;
  willBill: boolean;
}

export interface MeterRecordReportRow {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  currency: string;
  unitId: string | null;
  unitNumber: string;
  floor: string;
  tenantCode: string;
  tenantName: string;
  meterNo: string;
  meterType: string;
  category: string;
  rate: number;
  startUnit: number;
  endUnit: number;
  totalUnit: number;
  amount: number;
  startDate: string;
  endDate: string;
  billDate: string;
}

export interface MeterRecordReportFilters {
  floors: string[];
  units: Array<{ unitNumber: string; floor: string }>;
  tenants: Array<{ code: string; name: string }>;
  meterTypes: string[];
  categories: string[];
}

export interface MeterRecordReportQueryParams {
  propertyId?: string;
  billDateFrom?: string;
  billDateTo?: string;
  startDateFrom?: string;
  endDateTo?: string;
  floor?: string;
  unitNumber?: string;
  tenantCode?: string;
  meterType?: string;
  category?: string;
  meterNo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface MeterRecordsReportResponse {
  success: boolean;
  data: MeterRecordReportRow[];
  total: number;
}

// ─── API ───────────────────────────────────────────

export const meterRecordsApi = createApi({
  reducerPath: 'meterRecordsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['MeterRecord'],
  endpoints: (builder) => ({
    previewMeterRecords: builder.mutation<ApiResponse<MeterRecordPreviewRow[]>, { propertyId: string; formData: FormData }>({
      query: ({ propertyId, formData }) => ({
        url: `/properties/${propertyId}/meter-records/preview`,
        method: 'POST',
        body: formData,
      }),
    }),
    importMeterRecords: builder.mutation<ApiResponse<ImportMeterRecordsResult>, { propertyId: string; formData: FormData }>({
      query: ({ propertyId, formData }) => ({
        url: `/properties/${propertyId}/meter-records/import`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['MeterRecord'],
    }),
    getMeterRecordReportFilters: builder.query<ApiResponse<MeterRecordReportFilters>, { propertyId?: string } | void>({
      query: (params) => ({
        url: '/meter-records/filters',
        params: params?.propertyId ? { propertyId: params.propertyId } : undefined,
      }),
      providesTags: ['MeterRecord'],
    }),
    getMeterRecordsReport: builder.query<MeterRecordsReportResponse, MeterRecordReportQueryParams | void>({
      query: (params) => {
        const clean: Record<string, string> = {};
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              clean[k] = String(v).trim();
            }
          });
        }
        return {
          url: '/meter-records',
          params: clean,
        };
      },
      providesTags: ['MeterRecord'],
    }),
  }),
});

export const {
  usePreviewMeterRecordsMutation,
  useImportMeterRecordsMutation,
  useGetMeterRecordReportFiltersQuery,
  useLazyGetMeterRecordsReportQuery,
} = meterRecordsApi;
