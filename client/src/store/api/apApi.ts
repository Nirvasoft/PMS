import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface ApInvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  glAccountCode: string | null;
  chargeType: { id: string; code: string; name: string } | null;
}

export interface ApInvoiceListItem {
  id: string;
  apInvoiceNumber: string;
  vendorName: string;
  vendorInvoiceNo: string | null;
  invoiceDate: string;
  dueDate: string;
  description: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  currency: string;
  status: string;
  costCenter: string | null;
  poReference: string | null;
  createdAt: string;
  property: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  creator: { id: string; email: string; profile?: { firstName: string; lastName: string } };
  _count: { pvAllocations: number };
}

export interface ApInvoiceDetail extends ApInvoiceListItem {
  lines: ApInvoiceLineItem[];
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  attachmentUrl: string | null;
  notes: string | null;
  approver: { id: string; email: string; profile?: { firstName: string; lastName: string } } | null;
  pvAllocations: Array<{
    id: string;
    amount: string;
    voucher: { id: string; voucherNumber: string; status: string; totalAmount: string; paidAt: string | null };
  }>;
}

export interface PaymentVoucherListItem {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  paymentMethod: string;
  vendorName: string;
  totalAmount: string;
  currency: string;
  paymentReference: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
  allocations: Array<{
    id: string;
    amount: string;
    apInvoice: { id: string; apInvoiceNumber: string; vendorName: string };
  }>;
  bankAccount: { id: string; bankName: string; accountNumber: string } | null;
  creator: { id: string; email: string; profile?: { firstName: string; lastName: string } };
}

export interface ExpenseListItem {
  id: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  receiptUrl: string | null;
  status: string;
  createdAt: string;
  property: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  submitter: { id: string; email: string; profile?: { firstName: string; lastName: string } };
  approver: { id: string; email: string; profile?: { firstName: string; lastName: string } } | null;
  approvedAt: string | null;
}

export interface DuePaymentsReport {
  totalDue: number;
  invoices: Array<{
    id: string;
    apInvoiceNumber: string;
    vendorName: string;
    dueDate: string;
    totalAmount: string;
    paidAmount: string;
    outstanding: number;
    daysUntilDue: number;
    currency: string;
  }>;
}

export interface ExpenseReport {
  totalAmount: number;
  totalCount: number;
  breakdown: Array<{
    label: string;
    total: number;
    count: number;
    percentage: number;
  }>;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const apApi = createApi({
  reducerPath: 'apApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['ApInvoices', 'PaymentVouchers', 'Expenses'],
  endpoints: (builder) => ({
    // ── AP Invoices ──
    getApInvoices: builder.query<PaginatedResponse<ApInvoiceListItem>, Record<string, string | undefined>>({
      query: (params) => ({ url: '/ap/invoices', params }),
      providesTags: ['ApInvoices'],
    }),
    getApInvoice: builder.query<{ data: ApInvoiceDetail }, string>({
      query: (id) => `/ap/invoices/${id}`,
      providesTags: ['ApInvoices'],
    }),
    createApInvoice: builder.mutation<{ data: ApInvoiceDetail }, Record<string, unknown>>({
      query: (body) => ({ url: '/ap/invoices', method: 'POST', body }),
      invalidatesTags: ['ApInvoices'],
    }),
    approveApInvoice: builder.mutation<void, string>({
      query: (id) => ({ url: `/ap/invoices/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['ApInvoices'],
    }),
    rejectApInvoice: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/ap/invoices/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['ApInvoices'],
    }),

    // ── Payment Vouchers ──
    getPaymentVouchers: builder.query<PaginatedResponse<PaymentVoucherListItem>, Record<string, string | undefined>>({
      query: (params) => ({ url: '/ap/payment-vouchers', params }),
      providesTags: ['PaymentVouchers'],
    }),
    createPaymentVoucher: builder.mutation<{ data: PaymentVoucherListItem }, Record<string, unknown>>({
      query: (body) => ({ url: '/ap/payment-vouchers', method: 'POST', body }),
      invalidatesTags: ['PaymentVouchers', 'ApInvoices'],
    }),
    markVoucherPaid: builder.mutation<void, { id: string; paymentReference: string; paidAt?: string }>({
      query: ({ id, ...body }) => ({ url: `/ap/payment-vouchers/${id}/mark-paid`, method: 'POST', body }),
      invalidatesTags: ['PaymentVouchers', 'ApInvoices'],
    }),

    // ── Expenses ──
    getExpenses: builder.query<PaginatedResponse<ExpenseListItem>, Record<string, string | undefined>>({
      query: (params) => ({ url: '/expenses', params }),
      providesTags: ['Expenses'],
    }),
    createExpense: builder.mutation<{ data: ExpenseListItem }, Record<string, unknown>>({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
    }),
    approveExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/expenses/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Expenses'],
    }),

    // ── Reports ──
    getDuePayments: builder.query<{ data: DuePaymentsReport }, Record<string, string | undefined>>({
      query: (params) => ({ url: '/ap/due-payments', params }),
    }),
    getExpenseReport: builder.query<{ data: ExpenseReport }, Record<string, string | undefined>>({
      query: (params) => ({ url: '/ap/expense-report', params }),
    }),
  }),
});

export const {
  useGetApInvoicesQuery,
  useGetApInvoiceQuery,
  useCreateApInvoiceMutation,
  useApproveApInvoiceMutation,
  useRejectApInvoiceMutation,
  useGetPaymentVouchersQuery,
  useCreatePaymentVoucherMutation,
  useMarkVoucherPaidMutation,
  useGetExpensesQuery,
  useCreateExpenseMutation,
  useApproveExpenseMutation,
  useGetDuePaymentsQuery,
  useGetExpenseReportQuery,
} = apApi;
