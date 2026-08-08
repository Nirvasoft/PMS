import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

interface Visitor {
  id: string;
  visitorName: string;
  visitorIc?: string;
  visitorMobile?: string;
  visitorCompany?: string;
  visitPurpose?: string;
  validFrom: string;
  validTo: string;
  qrToken: string;
  passType: string;
  status: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  vehiclePlate?: string;
  createdAt: string;
}

interface BlacklistEntry {
  id: string;
  visitorName?: string;
  visitorIc?: string;
  visitorMobile?: string;
  reason: string;
  isActive: boolean;
  addedAt: string;
  addedByUser?: { email: string; profile?: { firstName: string; lastName: string } };
}

export const visitorsApi = createApi({
  reducerPath: 'visitorsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      return headers;
    },
  }),
  tagTypes: ['Visitors', 'Blacklist'],
  endpoints: (builder) => ({
    getPortalVisitors: builder.query<
      { data: Visitor[]; meta: { total: number; page: number; limit: number } },
      { status?: string; page?: number; limit?: number } | void
    >({
      query: (params) => ({ url: '/portal/visitors', params: params || {} }),
      providesTags: ['Visitors'],
    }),
    preRegisterVisitor: builder.mutation<any, {
      propertyId: string;
      hostUnitId: string;
      visitorName: string;
      visitorIc?: string;
      visitorMobile?: string;
      visitorCompany?: string;
      visitPurpose?: string;
      validFrom: string;
      validTo: string;
      passType?: string;
      maxUses?: number;
      vehiclePlate?: string;
      notes?: string;
    }>({
      query: (body) => ({ url: '/visitors/pre-register', method: 'POST', body }),
      invalidatesTags: ['Visitors'],
    }),
    cancelVisitor: builder.mutation<void, string>({
      query: (id) => ({ url: `/visitors/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Visitors'],
    }),
    respondWalkIn: builder.mutation<void, {
      approvalId: string;
      response: 'approved' | 'rejected';
      reason?: string;
    }>({
      query: (body) => ({ url: '/visitors/walkin/respond', method: 'POST', body }),
      invalidatesTags: ['Visitors'],
    }),

    // ── Blacklist CRUD ──────────────────────────
    getBlacklist: builder.query<
      { data: BlacklistEntry[]; meta: { total: number; page: number; limit: number } },
      { search?: string; isActive?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/visitors/blacklist', params: params || {} }),
      providesTags: ['Blacklist'],
    }),
    createBlacklistEntry: builder.mutation<BlacklistEntry, {
      propertyId?: string;
      visitorName?: string;
      visitorIc?: string;
      visitorMobile?: string;
      reason: string;
    }>({
      query: (body) => ({ url: '/visitors/blacklist', method: 'POST', body }),
      invalidatesTags: ['Blacklist'],
    }),
    updateBlacklistEntry: builder.mutation<BlacklistEntry, {
      id: string;
      visitorName?: string;
      visitorIc?: string;
      visitorMobile?: string;
      reason?: string;
      isActive?: boolean;
    }>({
      query: ({ id, ...body }) => ({ url: `/visitors/blacklist/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Blacklist'],
    }),
    deleteBlacklistEntry: builder.mutation<void, string>({
      query: (id) => ({ url: `/visitors/blacklist/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Blacklist'],
    }),
  }),
});

export const {
  useGetPortalVisitorsQuery,
  usePreRegisterVisitorMutation,
  useCancelVisitorMutation,
  useRespondWalkInMutation,
  useGetBlacklistQuery,
  useCreateBlacklistEntryMutation,
  useUpdateBlacklistEntryMutation,
  useDeleteBlacklistEntryMutation,
} = visitorsApi;
