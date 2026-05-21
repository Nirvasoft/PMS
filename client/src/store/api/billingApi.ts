import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface ChargeType {
  id: string;
  code: string;
  name: string;
  category: string;
  glAccountCode: string | null;
  isTaxable: boolean;
  taxRate: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface BillingSchedule {
  id: string;
  description: string | null;
  amount: string;
  currency: string;
  billingCycle: string;
  billingDay: number;
  paymentDueDays: number;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  status: string;
  invoiceCount: number;
  chargeType: { id: string; code: string; name: string; category: string };
  tenant: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string };
  unit: { id: string; unitNumber: string } | null;
  property: { id: string; name: string };
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  periodFrom: string | null;
  periodTo: string | null;
  chargeType: { id: string; code: string; name: string; category: string };
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  penaltyAmount: string;
  currency: string;
  tenant: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string };
  unit: { id: string; unitNumber: string } | null;
  property: { id: string; name: string };
  outstandingAmount: number;
  _count: { lines: number };
}

export interface InvoiceDetail extends InvoiceListItem {
  periodFrom: string | null;
  periodTo: string | null;
  discountAmount: string;
  gracePeriodDays: number;
  penaltyAppliedAt: string | null;
  originalInvoiceId: string | null;
  creditReason: string | null;
  notes: string | null;
  voidReason: string | null;
  lines: InvoiceLine[];
  creditNotes: { id: string; invoiceNumber: string; totalAmount: string; status: string }[];
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const billingApi = createApi({
  reducerPath: 'billingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Invoices', 'BillingSchedules', 'ChargeTypes', 'PenaltyConfigs', 'TaxConfigs'],
  endpoints: (builder) => ({

    // ── Charge Types ──────────────────────
    getChargeTypes: builder.query<ApiResponse<ChargeType[]>, void>({
      query: () => '/billing/charge-types',
      providesTags: ['ChargeTypes'],
    }),

    createChargeType: builder.mutation<ApiResponse<ChargeType>, Record<string, unknown>>({
      query: (body) => ({ url: '/billing/charge-types', method: 'POST', body }),
      invalidatesTags: ['ChargeTypes'],
    }),

    // ── Billing Schedules ─────────────────
    getBillingSchedules: builder.query<PaginatedResponse<BillingSchedule>, {
      leaseId?: string; tenantId?: string; propertyId?: string; status?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/billing/schedules', params }),
      providesTags: ['BillingSchedules'],
    }),

    createBillingSchedule: builder.mutation<ApiResponse<BillingSchedule>, Record<string, unknown>>({
      query: (body) => ({ url: '/billing/schedules', method: 'POST', body }),
      invalidatesTags: ['BillingSchedules'],
    }),

    pauseSchedule: builder.mutation<ApiResponse<BillingSchedule>, string>({
      query: (id) => ({ url: `/billing/schedules/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['BillingSchedules'],
    }),

    resumeSchedule: builder.mutation<ApiResponse<BillingSchedule>, string>({
      query: (id) => ({ url: `/billing/schedules/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['BillingSchedules'],
    }),

    cancelSchedule: builder.mutation<ApiResponse<BillingSchedule>, string>({
      query: (id) => ({ url: `/billing/schedules/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['BillingSchedules'],
    }),

    updateSchedule: builder.mutation<ApiResponse<BillingSchedule>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/billing/schedules/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['BillingSchedules'],
    }),

    // ── Invoices ──────────────────────────
    getInvoices: builder.query<PaginatedResponse<InvoiceListItem>, {
      tenantId?: string; leaseId?: string; propertyId?: string; status?: string;
      from?: string; to?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/invoices', params }),
      providesTags: ['Invoices'],
    }),

    getInvoice: builder.query<ApiResponse<InvoiceDetail>, string>({
      query: (id) => `/invoices/${id}`,
      providesTags: (_, __, id) => [{ type: 'Invoices', id }],
    }),

    createInvoice: builder.mutation<ApiResponse<InvoiceDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/invoices', method: 'POST', body }),
      invalidatesTags: ['Invoices'],
    }),

    voidInvoice: builder.mutation<ApiResponse<InvoiceDetail>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/invoices/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Invoices', id }, 'Invoices'],
    }),

    createCreditNote: builder.mutation<ApiResponse<InvoiceDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/invoices/${id}/credit-note`, method: 'POST', body: data }),
      invalidatesTags: ['Invoices'],
    }),

    getInvoicePdf: builder.query<ApiResponse<{ url: string }>, string>({
      query: (id) => `/invoices/${id}/pdf`,
    }),

    sendInvoice: builder.mutation<ApiResponse<{ invoiceId: string; status: string; sentTo: string; pdfUrl: string }>, string>({
      query: (id) => ({ url: `/invoices/${id}/send`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Invoices', id }, 'Invoices'],
    }),

    // ── Manual Billing Run ────────────────
    runBilling: builder.mutation<ApiResponse<{ processed: number; generated: number; errors: string[] }>, void>({
      query: () => ({ url: '/billing/run', method: 'POST' }),
      invalidatesTags: ['Invoices', 'BillingSchedules'],
    }),

    // ── Penalty Configs ───────────────────
    getPenaltyConfigs: builder.query<ApiResponse<any[]>, void>({
      query: () => '/billing/penalty-configs',
      providesTags: ['PenaltyConfigs'],
    }),

    createPenaltyConfig: builder.mutation<ApiResponse<any>, Record<string, unknown>>({
      query: (body) => ({ url: '/billing/penalty-configs', method: 'POST', body }),
      invalidatesTags: ['PenaltyConfigs'],
    }),

    // ── Tax Configs ───────────────────────
    getTaxConfigs: builder.query<ApiResponse<any[]>, void>({
      query: () => '/billing/tax-configs',
      providesTags: ['TaxConfigs'],
    }),

    createTaxConfig: builder.mutation<ApiResponse<any>, Record<string, unknown>>({
      query: (body) => ({ url: '/billing/tax-configs', method: 'POST', body }),
      invalidatesTags: ['TaxConfigs'],
    }),
  }),
});

export const {
  useGetChargeTypesQuery,
  useCreateChargeTypeMutation,
  useGetBillingSchedulesQuery,
  useCreateBillingScheduleMutation,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useCancelScheduleMutation,
  useUpdateScheduleMutation,
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useCreateInvoiceMutation,
  useVoidInvoiceMutation,
  useCreateCreditNoteMutation,
  useLazyGetInvoicePdfQuery,
  useSendInvoiceMutation,
  useRunBillingMutation,
  useGetPenaltyConfigsQuery,
  useCreatePenaltyConfigMutation,
  useGetTaxConfigsQuery,
  useCreateTaxConfigMutation,
} = billingApi;
