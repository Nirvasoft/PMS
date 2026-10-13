import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export type Prefix2Format = 'none' | 'yymm' | 'mmyy';

export interface SequenceItem {
  id: string;
  typeKey: string;
  label: string;
  module: string;
  locationId: string;
  prefix1: string;
  prefix2: Prefix2Format;
  padLength: number;
  currentVal: number;
  isCustom: boolean;
  samplePreview: string;
  mode?: 'auto' | 'manual';
}

export interface BulkSavePayload {
  locationId: string;
  items: Array<{
    typeKey: string;
    prefix1: string;
    prefix2: Prefix2Format;
    padLength: number;
    mode?: 'auto' | 'manual';
  }>;
}

export const sequenceApi = createApi({
  reducerPath: 'sequenceApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Sequence'],
  endpoints: (builder) => ({
    getSequences: builder.query<SequenceItem[], { locationId?: string; module?: string } | void>({
      query: (params) => ({
        url: '/sequences',
        params: params ? { locationId: params.locationId, module: params.module } : undefined,
      }),
      transformResponse: (response: { success: boolean; data: SequenceItem[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Sequence' as const, id })),
              { type: 'Sequence', id: 'LIST' },
            ]
          : [{ type: 'Sequence', id: 'LIST' }],
    }),

    bulkSaveSequences: builder.mutation<SequenceItem[], BulkSavePayload>({
      query: (body) => ({
        url: '/sequences/bulk-save',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Sequence', id: 'LIST' }],
    }),

    deleteSequence: builder.mutation<{ deleted: boolean }, { typeKey: string; locationId?: string }>({
      query: ({ typeKey, locationId = 'all' }) => ({
        url: `/sequences/${typeKey}`,
        method: 'DELETE',
        params: { locationId },
      }),
      invalidatesTags: [{ type: 'Sequence', id: 'LIST' }],
    }),

    resetSequence: builder.mutation<void, { key: string; value?: number; locationId?: string }>({
      query: ({ key, value = 0, locationId }) => ({
        url: `/sequences/${key}/reset`,
        method: 'POST',
        body: { value, locationId },
      }),
      invalidatesTags: [{ type: 'Sequence', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetSequencesQuery,
  useBulkSaveSequencesMutation,
  useDeleteSequenceMutation,
  useResetSequenceMutation,
} = sequenceApi;
