import { createApi } from '@reduxjs/toolkit/query/react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export type GeneralImportType = 'meter' | 'unit' | 'lease' | 'tenant' | 'lead' | 'invoice' | 'charge';

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
  skippedLeases?: number;
  unitChargesCount?: number;
  billingSchedulesCount?: number;
  unitStatusUpdated?: number;
}

interface Args { propertyId: string; type: GeneralImportType; formData: FormData }

interface ImportJobStatus<T> {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  result?: T;
  error?: { message: string; code?: string };
}

async function runAsyncImportJob<T>(
  action: 'preview' | 'import',
  { propertyId, type, formData }: Args,
  signal: AbortSignal,
  baseQuery: (arg: { url: string; method: string; body?: FormData }) => Promise<{ data?: unknown; error?: FetchBaseQueryError }>,
): Promise<{ data: ApiResponse<T> } | { error: FetchBaseQueryError }> {
  const startRes = await baseQuery({
    url: `/properties/${propertyId}/general-import/${type}/${action}?async=1`,
    method: 'POST',
    body: formData,
  });
  if (startRes.error) return { error: startRes.error };

  const startPayload = startRes.data as ApiResponse<ImportJobStatus<T> & T> | undefined;
  const jobId = startPayload?.data?.jobId;
  if (!jobId) {
    return { data: startRes.data as ApiResponse<T> };
  }

  let transientErrors = 0;
  while (!signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (signal.aborted) break;

    const pollRes = await baseQuery({
      url: `/properties/${propertyId}/general-import/${type}/jobs/${jobId}`,
      method: 'GET',
    });

    if (pollRes.error) {
      transientErrors++;
      if (transientErrors >= 10) {
        return { error: pollRes.error };
      }
      continue;
    }
    transientErrors = 0;

    const job = (pollRes.data as ApiResponse<ImportJobStatus<T>> | undefined)?.data;
    if (!job) continue;

    if (job.status === 'completed' && job.result) {
      return { data: { success: true, data: job.result } };
    }
    if (job.status === 'failed') {
      return {
        error: {
          status: 400,
          data: { error: job.error || { message: `Failed to ${action} file` } },
        },
      };
    }
  }

  return {
    error: {
      status: 'CUSTOM_ERROR',
      error: 'Import request aborted',
    },
  };
}

export const generalImportApi = createApi({
  reducerPath: 'generalImportApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    previewGeneralImport: builder.mutation<ApiResponse<GeneralImportPreview>, Args>({
      queryFn: (args, api, _extraOptions, baseQuery) =>
        runAsyncImportJob<GeneralImportPreview>('preview', args, api.signal, baseQuery),
    }),
    importGeneralImport: builder.mutation<ApiResponse<GeneralImportResult>, Args>({
      queryFn: (args, api, _extraOptions, baseQuery) =>
        runAsyncImportJob<GeneralImportResult>('import', args, api.signal, baseQuery),
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
