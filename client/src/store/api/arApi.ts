import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface ReceiptListItem {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  amount: string;
  currency: string;
  status: string;
  notes: string | null;
  createdAt: string;
  tenant: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string };
  property: { id: string; name: string } | null;
  _count: { allocations: number };
}

export interface ReceiptAllocationDetail {
  id: string;
  amount: string;
  invoice: { id: string; invoiceNumber: string; totalAmount: string; paidAmount: string; status: string };
}

export interface ReceiptDetail extends Omit<ReceiptListItem, '_count'> {
  exchangeRate: string;
  baseCurrencyAmount: string | null;
  bankAccountId: string | null;
  attachmentUrl: string | null;
  allocations: ReceiptAllocationDetail[];
}

export interface AgingRow {
  tenantId: string;
  tenantName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface AgingReport {
  summary: { current: number; days1to30: number; days31to60: number; days61to90: number; over90: number; total: number };
  rows: AgingRow[];
  generatedAt: string;
}

export interface CollectionSummary {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface StatementTransaction {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TenantStatement {
  tenant: { id: string; displayName: string };
  period: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  transactions: StatementTransaction[];
}

export interface RefundListItem {
  id: string;
  refundType: string;
  amount: string;
  currency: string;
  reason: string;
  status: string;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  paymentReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  tenant: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string };
}

export interface TenantCreditItem {
  id: string;
  amount: string;
  currency: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  usedAmount: string;
  balance: number;
  createdAt: string;
}

export interface TenantCreditWithTenant extends TenantCreditItem {
  tenant: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string };
}

export interface CreditsSummary {
  totalIssued: number;
  totalUsed: number;
  totalAvailable: number;
  totalCredits: number;
  activeCredits: number;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface OutstandingByPropertyItem {
  propertyId: string;
  propertyName: string;
  outstanding: number;
  invoiceCount: number;
}

export interface OverdueTrendPoint {
  month: string;
  overdueAmount: number;
  overdueCount: number;
}

// ─── API ─────────────────────────────────────

export const arApi = createApi({
  reducerPath: 'arApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Receipts', 'AgingReport', 'Refunds', 'TenantCredits', 'CollectionSummary'],
  endpoints: (builder) => ({

    // ── Receipts ──────────────────────────
    getReceipts: builder.query<PaginatedResponse<ReceiptListItem>, {
      tenantId?: string; propertyId?: string; status?: string;
      from?: string; to?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/receipts', params }),
      providesTags: ['Receipts'],
    }),

    getReceipt: builder.query<ApiResponse<ReceiptDetail>, string>({
      query: (id) => `/receipts/${id}`,
      providesTags: (_, __, id) => [{ type: 'Receipts', id }],
    }),

    createReceipt: builder.mutation<ApiResponse<ReceiptDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/receipts', method: 'POST', body }),
      invalidatesTags: ['Receipts', 'CollectionSummary', 'AgingReport'],
    }),

    reverseReceipt: builder.mutation<ApiResponse<{ id: string; status: string }>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/receipts/${id}/reverse`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Receipts', 'CollectionSummary', 'AgingReport'],
    }),

    // ── AR Reports ────────────────────────
    getAgingReport: builder.query<ApiResponse<AgingReport>, { propertyId?: string; asOfDate?: string }>({
      query: (params) => ({ url: '/ar/aging-report', params }),
      providesTags: ['AgingReport'],
    }),

    getCollectionSummary: builder.query<ApiResponse<CollectionSummary>, { propertyId?: string }>({
      query: (params) => ({ url: '/ar/collection-summary', params }),
      providesTags: ['CollectionSummary'],
    }),

    getOutstandingByProperty: builder.query<ApiResponse<OutstandingByPropertyItem[]>, void>({
      query: () => '/ar/outstanding-by-property',
      providesTags: ['CollectionSummary'],
    }),

    getOverdueTrend: builder.query<ApiResponse<OverdueTrendPoint[]>, void>({
      query: () => '/ar/overdue-trend',
      providesTags: ['CollectionSummary'],
    }),

    // ── Tenant Statement ──────────────────
    getTenantStatement: builder.query<ApiResponse<TenantStatement>, { tenantId: string; from: string; to: string }>({
      query: ({ tenantId, ...params }) => ({ url: `/tenants/${tenantId}/statement`, params }),
    }),

    getTenantStatementPdf: builder.query<ApiResponse<{ url: string }>, { tenantId: string; from: string; to: string }>({
      query: ({ tenantId, ...params }) => ({ url: `/tenants/${tenantId}/statement/pdf`, params }),
    }),

    // ── Refunds ───────────────────────────
    getRefunds: builder.query<PaginatedResponse<RefundListItem>, {
      tenantId?: string; status?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/refunds', params }),
      providesTags: ['Refunds'],
    }),

    createRefund: builder.mutation<ApiResponse<RefundListItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/refunds', method: 'POST', body }),
      invalidatesTags: ['Refunds'],
    }),

    approveRefund: builder.mutation<ApiResponse<RefundListItem>, string>({
      query: (id) => ({ url: `/refunds/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Refunds'],
    }),

    rejectRefund: builder.mutation<ApiResponse<RefundListItem>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/refunds/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Refunds'],
    }),

    markRefundPaid: builder.mutation<ApiResponse<RefundListItem>, { id: string; paymentReference: string; paidAt?: string }>({
      query: ({ id, ...body }) => ({ url: `/refunds/${id}/mark-paid`, method: 'POST', body }),
      invalidatesTags: ['Refunds'],
    }),

    // ── Tenant Credits ────────────────────
    getTenantCredits: builder.query<ApiResponse<TenantCreditItem[]>, string>({
      query: (tenantId) => `/tenants/${tenantId}/credits`,
      providesTags: ['TenantCredits'],
    }),

    getCredits: builder.query<PaginatedResponse<TenantCreditWithTenant>, {
      tenantId?: string; sourceType?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/credits', params }),
      providesTags: ['TenantCredits'],
    }),

    getCreditsSummary: builder.query<ApiResponse<CreditsSummary>, void>({
      query: () => '/credits/summary',
      providesTags: ['TenantCredits'],
    }),

    createCredit: builder.mutation<ApiResponse<TenantCreditWithTenant>, {
      tenantId: string; amount: number; currency: string;
      sourceType: string; description?: string;
    }>({
      query: (body) => ({ url: '/credits', method: 'POST', body }),
      invalidatesTags: ['TenantCredits'],
    }),

    applyCredit: builder.mutation<ApiResponse<{ creditId: string; invoiceId: string; appliedAmount: number; newStatus: string }>, {
      creditId: string; invoiceId: string; amount: number;
    }>({
      query: ({ creditId, ...body }) => ({ url: `/credits/${creditId}/apply`, method: 'POST', body }),
      invalidatesTags: ['TenantCredits'],
    }),
  }),
});

export const {
  useGetReceiptsQuery,
  useGetReceiptQuery,
  useCreateReceiptMutation,
  useReverseReceiptMutation,
  useGetAgingReportQuery,
  useGetCollectionSummaryQuery,
  useGetOutstandingByPropertyQuery,
  useGetOverdueTrendQuery,
  useGetTenantStatementQuery,
  useLazyGetTenantStatementQuery,
  useLazyGetTenantStatementPdfQuery,
  useGetRefundsQuery,
  useCreateRefundMutation,
  useApproveRefundMutation,
  useRejectRefundMutation,
  useMarkRefundPaidMutation,
  useGetTenantCreditsQuery,
  useGetCreditsQuery,
  useGetCreditsSummaryQuery,
  useCreateCreditMutation,
  useApplyCreditMutation,
} = arApi;
