import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export type GeneralImportType = 'meter' | 'unit' | 'lease';

export interface GeneralImportPreview {
  type: GeneralImportType;
  columns: { key: string; header: string }[];
  /** For 'error' rows `errors` are problems; for 'valid'/'skip' rows they are informational notes. */
  rows: { rowNo: number; data: Record<string, string>; status: 'valid' | 'skip' | 'error'; errors: string[] }[];
  total: number;
  validCount: number;
  skipCount: number;
  errorCount: number;
}

export interface GeneralImportResult {
  type: GeneralImportType;
  total: number;
  /** Rows inserted into the target table (meter_setups for meter imports). */
  imported: number;
  /** Rows skipped because they already exist (meter_setups). */
  skipped: number;
  /** utility_meters rows created to connect a meter to a unit. */
  linked: number;
  linkSkipped: number;
  notes: { rowNo: number; message: string }[];
  failed: { rowNo: number; errors: string[] }[];
}

interface Args { propertyId: string; type: GeneralImportType; formData: FormData }

export const generalImportApi = createApi({
  reducerPath: 'generalImportApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    previewGeneralImport: builder.mutation<ApiResponse<GeneralImportPreview>, Args>({
      query: ({ propertyId, type, formData }) => ({
        url: `/properties/${propertyId}/general-import/${type}/preview`,
        method: 'POST',
        body: formData,
      }),
    }),
    importGeneralImport: builder.mutation<ApiResponse<GeneralImportResult>, Args>({
      query: ({ propertyId, type, formData }) => ({
        url: `/properties/${propertyId}/general-import/${type}/import`,
        method: 'POST',
        body: formData,
      }),
    }),
    // Sample is binary, so it's fetched through the same reauth-aware base query as a blob.
    downloadGeneralImportSample: builder.mutation<Blob, { propertyId: string; type: GeneralImportType }>({
      query: ({ propertyId, type }) => ({
        url: `/properties/${propertyId}/general-import/${type}/sample`,
        method: 'GET',
        responseHandler: (response) => response.blob(),
        cache: 'no-cache',
      }),
    }),
  }),
});

export const {
  usePreviewGeneralImportMutation,
  useImportGeneralImportMutation,
  useDownloadGeneralImportSampleMutation,
} = generalImportApi;
