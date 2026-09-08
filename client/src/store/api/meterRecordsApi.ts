import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ImportMeterRecordsResult {
  imported: number;
  billingSchedulesCreated: number;
  skipped: number;
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

// ─── API ───────────────────────────────────────────
// The imported rows are a backend-only audit log (meter_record_list) and aren't surfaced
// in any persistent UI list — previewMeterRecords is a dry-run parse just for the one-time
// confirmation step between picking a file and committing the import.

export const meterRecordsApi = createApi({
  reducerPath: 'meterRecordsApi',
  baseQuery: baseQueryWithReauth,
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
    }),
  }),
});

export const { usePreviewMeterRecordsMutation, useImportMeterRecordsMutation } = meterRecordsApi;
