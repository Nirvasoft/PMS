import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface LeaseListItem {
  id: string;
  leaseNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  leaseTermMonths: number;
  rentAmount: string;
  currency: string;
  esignStatus: string;
  daysUntilExpiry: number;
  createdAt: string;
  unit:     { id: string; unitNumber: string; unitType: string };
  property: { id: string; name: string };
  tenant:   { id: string; displayName: string; tenantType: string };
}

export interface LeaseDetail extends LeaseListItem {
  handoverDate: string | null;
  billingCycle: string;
  billingDay: number;
  paymentDueDays: number;
  securityDeposit: string;
  depositPaid: boolean;
  depositPaidAt: string | null;
  depositRefunded: boolean;
  depositRefundedAt: string | null;
  escalationType: string | null;
  escalationValue: string | null;
  escalationFrequency: string | null;
  escalationMonth: number | null;
  isRenewed: boolean;
  parentLeaseId: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  terminationType: string | null;
  earlyTerminationPenalty: string | null;
  esignEnvelopeId: string | null;
  esignCompletedAt: string | null;
  leaseDocumentUrl: string | null;
  workflowInstanceId: string | null;
  notes: string | null;
  specialConditions: string | null;
  clauses: unknown[];
  approvedAt: string | null;
  activatedAt: string | null;
  unit:     { id: string; unitNumber: string; unitType: string; areaSqft: number | null };
  property: { id: string; name: string; currency: string };
  tenant:   { id: string; displayName: string; tenantType: string; email: string | null; mobile: string | null };
  creator:  { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  approver: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  amendments: LeaseAmendment[];
  escalationSchedule: EscalationEntry[];
  esignRecipients: EsignRecipient[];
  renewalLeases: { id: string; leaseNumber: string; status: string; startDate: string; endDate: string }[];
  parentLease: { id: string; leaseNumber: string; status: string } | null;
}

export interface LeaseAmendment {
  id: string;
  leaseId: string;
  amendmentNumber: number;
  amendmentType: string;
  description: string;
  effectiveDate: string;
  newRentAmount: string | null;
  newEndDate: string | null;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  approver: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
}

export interface EscalationEntry {
  id: string;
  effectiveDate: string;
  newRent: string;
  applied: boolean;
  appliedAt: string | null;
}

export interface EsignRecipient {
  id: string;
  recipientType: string;
  name: string;
  email: string;
  status: string;
  signedAt: string | null;
}

export interface LeaseTemplate {
  id: string;
  name: string;
  propertyType: string | null;
  description: string | null;
  defaultTerms: Record<string, unknown>;
  clauses: unknown[];
  isActive: boolean;
  createdAt: string;
}

export interface LeaseClause {
  id: string;
  title: string;
  content: string;
  category: string | null;
  isStandard: boolean;
  isActive: boolean;
  createdAt: string;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const leasesApi = createApi({
  reducerPath: 'leasesApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Leases', 'LeaseAmendments', 'EsignStatus', 'LeaseTemplates', 'LeaseClauses'],
  endpoints: (builder) => ({

    getLeases: builder.query<PaginatedResponse<LeaseListItem>, {
      search?: string; propertyId?: string; unitId?: string; tenantId?: string;
      status?: string; expiringWithinDays?: number; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/leases', params }),
      providesTags: ['Leases'],
    }),

    getLease: builder.query<ApiResponse<LeaseDetail>, string>({
      query: (id) => `/leases/${id}`,
      providesTags: (_, __, id) => [{ type: 'Leases', id }],
    }),

    createLease: builder.mutation<ApiResponse<LeaseDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/leases', method: 'POST', body }),
      invalidatesTags: ['Leases'],
    }),

    updateLease: builder.mutation<ApiResponse<LeaseDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/leases/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leases', id }, 'Leases'],
    }),

    deleteLease: builder.mutation<void, string>({
      query: (id) => ({ url: `/leases/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Leases'],
    }),

    submitLease: builder.mutation<ApiResponse<{ leaseId: string; status: string }>, string>({
      query: (id) => ({ url: `/leases/${id}/submit`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),

    activateLease: builder.mutation<ApiResponse<LeaseDetail>, string>({
      query: (id) => ({ url: `/leases/${id}/activate`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),

    cancelLease: builder.mutation<ApiResponse<{ leaseId: string; status: string }>, { id: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/leases/${id}/cancel`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leases', id }, 'Leases'],
    }),

    terminateLease: builder.mutation<ApiResponse<{ earlyTerminationPenalty: number; penaltyBreakdown: string }>, {
      id: string; terminationDate: string; reason: string;
    }>({
      query: ({ id, ...data }) => ({ url: `/leases/${id}/terminate`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leases', id }, 'Leases'],
    }),

    createRenewal: builder.mutation<ApiResponse<LeaseDetail>, { id: string; startDate: string; endDate: string; rentAmount?: number; offerExpiresAt?: string }>({
      query: ({ id, ...data }) => ({ url: `/leases/${id}/renewal`, method: 'POST', body: data }),
      invalidatesTags: ['Leases'],
    }),

    acceptRenewal: builder.mutation<ApiResponse<LeaseDetail>, string>({
      query: (id) => ({ url: `/leases/${id}/renewal/accept`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),

    declineRenewal: builder.mutation<ApiResponse<LeaseDetail>, string>({
      query: (id) => ({ url: `/leases/${id}/renewal/decline`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),

    getAmendments: builder.query<ApiResponse<LeaseAmendment[]>, string>({
      query: (leaseId) => `/leases/${leaseId}/amendments`,
      providesTags: (_, __, id) => [{ type: 'LeaseAmendments', id }],
    }),

    createAmendment: builder.mutation<ApiResponse<LeaseAmendment>, { leaseId: string } & Record<string, unknown>>({
      query: ({ leaseId, ...data }) => ({ url: `/leases/${leaseId}/amendments`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leaseId }) => [{ type: 'LeaseAmendments', id: leaseId }, { type: 'Leases', id: leaseId }],
    }),

    approveAmendment: builder.mutation<ApiResponse<LeaseAmendment>, { leaseId: string; amendmentId: string }>({
      query: ({ leaseId, amendmentId }) => ({ url: `/leases/${leaseId}/amendments/${amendmentId}/approve`, method: 'POST' }),
      invalidatesTags: (_, __, { leaseId }) => [{ type: 'LeaseAmendments', id: leaseId }, { type: 'Leases', id: leaseId }],
    }),

    sendForSigning: builder.mutation<ApiResponse<{ envelopeId: string; status: string }>, { id: string; recipients: { recipientType: string; name: string; email: string }[]; emailSubject?: string }>({
      query: ({ id, ...data }) => ({ url: `/leases/${id}/esign/send`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'EsignStatus', id }, { type: 'Leases', id }],
    }),

    getEsignStatus: builder.query<ApiResponse<{ status: string; recipients: EsignRecipient[] }>, string>({
      query: (id) => `/leases/${id}/esign/status`,
      providesTags: (_, __, id) => [{ type: 'EsignStatus', id }],
    }),

    getLeaseTemplates: builder.query<ApiResponse<LeaseTemplate[]>, void>({
      query: () => '/lease-templates',
      providesTags: ['LeaseTemplates'],
    }),

    createLeaseTemplate: builder.mutation<ApiResponse<LeaseTemplate>, Record<string, unknown>>({
      query: (body) => ({ url: '/lease-templates', method: 'POST', body }),
      invalidatesTags: ['LeaseTemplates'],
    }),

    getLeaseClauses: builder.query<ApiResponse<LeaseClause[]>, void>({
      query: () => '/lease-clauses',
      providesTags: ['LeaseClauses'],
    }),

    createLeaseClause: builder.mutation<ApiResponse<LeaseClause>, Record<string, unknown>>({
      query: (body) => ({ url: '/lease-clauses', method: 'POST', body }),
      invalidatesTags: ['LeaseClauses'],
    }),

    deleteLeaseClause: builder.mutation<void, string>({
      query: (id) => ({ url: `/lease-clauses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['LeaseClauses'],
    }),
  }),
});

export const {
  useGetLeasesQuery,
  useGetLeaseQuery,
  useCreateLeaseMutation,
  useUpdateLeaseMutation,
  useDeleteLeaseMutation,
  useSubmitLeaseMutation,
  useActivateLeaseMutation,
  useCancelLeaseMutation,
  useTerminateLeaseMutation,
  useCreateRenewalMutation,
  useAcceptRenewalMutation,
  useDeclineRenewalMutation,
  useGetAmendmentsQuery,
  useCreateAmendmentMutation,
  useApproveAmendmentMutation,
  useSendForSigningMutation,
  useGetEsignStatusQuery,
  useGetLeaseTemplatesQuery,
  useCreateLeaseTemplateMutation,
  useGetLeaseClausesQuery,
  useCreateLeaseClauseMutation,
  useDeleteLeaseClauseMutation,
} = leasesApi;
