import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

export interface BankAccount {
  id: string; companyId: string; propertyId: string | null;
  bankName: string; accountName: string; accountNumber: string;
  accountType: string; currency: string;
  openingBalance: number; currentBalance: number;
  swiftCode: string | null; iban: string | null;
  branchName: string | null; branchCode: string | null;
  glAccountId: string | null; isActive: boolean;
  createdAt: string; updatedAt: string;
}

export interface BankStatementImport {
  id: string; bankAccountId: string; importDate: string;
  filename: string | null; format: string;
  fromDate: string; toDate: string;
  totalCredits: number | null; totalDebits: number | null;
  transactionCount: number | null; status: string;
  _count?: { lines: number };
}

export interface BankStatementLine {
  id: string; importId: string; bankAccountId: string;
  transactionDate: string; valueDate: string | null;
  description: string | null; reference: string | null;
  creditAmount: number; debitAmount: number; balance: number | null;
  matchStatus: string; matchedEntityType: string | null;
  matchedEntityId: string | null; matchConfidence: number | null;
  matchedAt: string | null;
}

export interface ReconciliationSummary {
  total: number; matched: number; autoMatched: number;
  excluded: number; unmatched: number;
}

export interface GatewayTransaction {
  id: string; companyId: string; propertyId: string | null;
  gateway: string; gatewayTxnId: string; gatewayStatus: string;
  amount: string; currency: string; feeAmount: string; netAmount: string | null;
  paymentMethod: string | null; payerEmail: string | null; payerName: string | null;
  tenantId: string | null; invoiceId: string | null; receiptId: string | null;
  metadata: any; initiatedAt: string; completedAt: string | null;
  failedAt: string | null; failureReason: string | null;
  tenant?: { id: string; firstName: string | null; lastName: string | null; companyName: string | null; tenantType: string } | null;
  invoice?: { id: string; invoiceNumber: string; totalAmount: string; status: string } | null;
}

export interface GatewaySummary {
  totalTransactions: number; completedCount: number;
  failedCount: number; pendingCount: number; refundedCount: number;
  totalCompleted: number; totalFees: number; totalNet: number;
}

export const bankingApi = createApi({
  reducerPath: 'bankingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['BankAccounts', 'StatementLines', 'Imports', 'ReconSummary', 'GatewayTxns'],
  endpoints: (b) => ({
    // ── Bank Accounts ────────────
    getBankAccounts: b.query<BankAccount[], void>({
      query: () => '/banking/bank-accounts',
      transformResponse: (r: any) => r.data,
      providesTags: ['BankAccounts'],
    }),
    createBankAccount: b.mutation<BankAccount, any>({
      query: (body) => ({ url: '/banking/bank-accounts', method: 'POST', body }),
      invalidatesTags: ['BankAccounts'],
    }),
    updateBankAccount: b.mutation<BankAccount, { id: string; data: any }>({
      query: ({ id, data }) => ({ url: `/banking/bank-accounts/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['BankAccounts'],
    }),
    getBalance: b.query<any, string>({
      query: (id) => `/banking/bank-accounts/${id}/balance`,
      transformResponse: (r: any) => r.data,
    }),

    // ── Statement Import ─────────
    importStatement: b.mutation<BankStatementImport, { bankAccountId: string; data: any }>({
      query: ({ bankAccountId, data }) => ({
        url: `/banking/bank-accounts/${bankAccountId}/reconcile`, method: 'POST', body: data,
      }),
      invalidatesTags: ['StatementLines', 'Imports', 'ReconSummary'],
    }),
    getImports: b.query<BankStatementImport[], string>({
      query: (bankAccountId) => `/banking/bank-accounts/${bankAccountId}/imports`,
      transformResponse: (r: any) => r.data,
      providesTags: ['Imports'],
    }),
    getStatementLines: b.query<{ data: BankStatementLine[]; meta: any }, { bankAccountId: string } & Record<string, any>>({
      query: ({ bankAccountId, ...params }) => ({
        url: `/banking/bank-accounts/${bankAccountId}/statement-lines`, params,
      }),
      transformResponse: (r: any) => ({ data: r.data, meta: r.meta }),
      providesTags: ['StatementLines'],
    }),
    getReconciliationSummary: b.query<ReconciliationSummary, string>({
      query: (bankAccountId) => `/banking/bank-accounts/${bankAccountId}/reconciliation-summary`,
      transformResponse: (r: any) => r.data,
      providesTags: ['ReconSummary'],
    }),

    // ── Matching ─────────────────
    matchLine: b.mutation<BankStatementLine, { lineId: string; entityType: string; entityId: string }>({
      query: ({ lineId, ...body }) => ({ url: `/banking/bank-statement-lines/${lineId}/match`, method: 'POST', body }),
      invalidatesTags: ['StatementLines', 'ReconSummary'],
    }),
    excludeLine: b.mutation<BankStatementLine, string>({
      query: (lineId) => ({ url: `/banking/bank-statement-lines/${lineId}/exclude`, method: 'POST' }),
      invalidatesTags: ['StatementLines', 'ReconSummary'],
    }),
    unmatchLine: b.mutation<BankStatementLine, string>({
      query: (lineId) => ({ url: `/banking/bank-statement-lines/${lineId}/unmatch`, method: 'POST' }),
      invalidatesTags: ['StatementLines', 'ReconSummary'],
    }),

    // ── Payment Gateway ────────────
    getGatewayTransactions: b.query<{ data: GatewayTransaction[]; meta: any }, {
      gateway?: string; status?: string; tenantId?: string;
      from?: string; to?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/banking/gateway-transactions', params: params as any }),
      transformResponse: (r: any) => ({ data: r.data, meta: r.meta }),
      providesTags: ['GatewayTxns'],
    }),
    getGatewayTransaction: b.query<GatewayTransaction, string>({
      query: (id) => `/banking/gateway-transactions/${id}`,
      transformResponse: (r: any) => r.data,
      providesTags: (_, __, id) => [{ type: 'GatewayTxns', id }],
    }),
    getGatewaySummary: b.query<GatewaySummary, void>({
      query: () => '/banking/gateway-transactions/summary',
      transformResponse: (r: any) => r.data,
      providesTags: ['GatewayTxns'],
    }),
    initiatePayment: b.mutation<{ transactionId: string; checkoutUrl: string; sessionId: string }, {
      gateway: string; invoiceId: string; tenantId: string;
      amount: number; currency: string; returnUrl: string;
      payerEmail?: string; payerName?: string;
    }>({
      query: (body) => ({ url: '/banking/gateway-transactions/initiate', method: 'POST', body }),
      invalidatesTags: ['GatewayTxns'],
    }),
    confirmGatewayPayment: b.mutation<GatewayTransaction, { id: string; data?: any }>({
      query: ({ id, data }) => ({ url: `/banking/gateway-transactions/${id}/confirm`, method: 'POST', body: data }),
      invalidatesTags: ['GatewayTxns'],
    }),
    refundGatewayPayment: b.mutation<GatewayTransaction, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/banking/gateway-transactions/${id}/refund`, method: 'POST', body: { reason } }),
      invalidatesTags: ['GatewayTxns'],
    }),
  }),
});

export const {
  useGetBankAccountsQuery, useCreateBankAccountMutation, useUpdateBankAccountMutation,
  useGetBalanceQuery, useImportStatementMutation, useGetImportsQuery,
  useGetStatementLinesQuery, useGetReconciliationSummaryQuery,
  useMatchLineMutation, useExcludeLineMutation, useUnmatchLineMutation,
  useGetGatewayTransactionsQuery, useGetGatewayTransactionQuery,
  useGetGatewaySummaryQuery, useInitiatePaymentMutation,
  useConfirmGatewayPaymentMutation, useRefundGatewayPaymentMutation,
} = bankingApi;
