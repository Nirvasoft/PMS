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
  tagTypes: ['Visitors'],
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
  }),
});

export const {
  useGetPortalVisitorsQuery,
  usePreRegisterVisitorMutation,
  useCancelVisitorMutation,
  useRespondWalkInMutation,
} = visitorsApi;
