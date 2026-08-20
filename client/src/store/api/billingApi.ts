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

export interface MeterSetup {
  id: string;
  propertyId: string;
  floorId: string | null;
  meterType: string;
  meterNo: string;
  mainMeterId: string | null;
  horsePower: string | null;
  unitLostPct: string | null;
  category: string;
  factor: string | null;
  maintenanceFee: string | null;
  usageType: string | null;
  isActive: boolean;
  property: { id: string; name: string; code: string | null };
  floor: { id: string; floorNumber: number; floorLabel: string } | null;
  mainMeter: { id: string; meterNo: string; meterType: string } | null;
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
  receiptAllocations: {
    id: string;
    amount: string;
    allocatedAt: string;
    receipt: {
      id: string;
      receiptNumber: string;
      receiptDate: string;
      paymentMethod: string;
      paymentReference: string | null;
      amount: string;
      currency: string;
      status: string;
    };
  }[];
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
  tagTypes: ['Invoices', 'BillingSchedules', 'ChargeTypes', 'PenaltyConfigs', 'TaxConfigs', 'MeterSetups'],
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

    updateChargeType: builder.mutation<ApiResponse<ChargeType>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/billing/charge-types/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['ChargeTypes'],
    }),

    // ── Meter Setup ───────────────────────
    getMeterSetups: builder.query<ApiResponse<MeterSetup[]>, { propertyId?: string } | void>({
      query: (params) => ({ url: '/billing/meter-setup', params: params || {} }),
      providesTags: ['MeterSetups'],
    }),

    createMeterSetup: builder.mutation<ApiResponse<MeterSetup>, Record<string, unknown>>({
      query: (body) => ({ url: '/billing/meter-setup', method: 'POST', body }),
      invalidatesTags: ['MeterSetups'],
    }),

    updateMeterSetup: builder.mutation<ApiResponse<MeterSetup>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/billing/meter-setup/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['MeterSetups'],
    }),

    deleteMeterSetup: builder.mutation<void, string>({
      query: (id) => ({ url: `/billing/meter-setup/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MeterSetups'],
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

    getInvoicePdf: builder.query<string, string>({
      query: (id) => ({
        url: `/invoices/${id}/pdf`,
        responseHandler: async (response) => {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        },
        cache: 'no-cache',
      }),
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
  useUpdateChargeTypeMutation,
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
  useGetMeterSetupsQuery,
  useCreateMeterSetupMutation,
  useUpdateMeterSetupMutation,
  useDeleteMeterSetupMutation,
} = billingApi;
