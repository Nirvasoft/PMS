import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface GlAccount {
  id: string; companyId: string; parentId: string | null;
  code: string; name: string; accountType: string; accountSubtype: string | null;
  normalBalance: string; isControl: boolean; isActive: boolean;
  description: string | null; sortOrder: number;
  children?: GlAccount[];
}

interface FiscalPeriod {
  id: string; companyId: string; fiscalYear: number; periodNumber: number;
  name: string; startDate: string; endDate: string; status: string;
  closedAt: string | null; closedBy: string | null;
}

interface JournalEntryLine {
  id: string; accountId: string; description: string;
  debit: number; credit: number; sortOrder: number;
  account: { code: string; name: string; accountType?: string };
}

interface JournalEntry {
  id: string; companyId: string; journalNumber: string;
  entryDate: string; fiscalPeriodId: string; entryType: string;
  description: string; status: string; totalDebit: number; totalCredit: number;
  isReversal: boolean; reversalOfId: string | null; reversedById: string | null;
  createdBy: string; createdAt: string;
  lines: JournalEntryLine[];
  fiscalPeriod?: { name: string } | FiscalPeriod;
}

interface TrialBalanceRow {
  accountId: string; code: string; name: string;
  accountType: string; accountSubtype: string | null; normalBalance: string;
  totalDebit: number; totalCredit: number; netBalance: number;
}

interface TrialBalance {
  rows: TrialBalanceRow[];
  summary: { totalDebit: number; totalCredit: number; isBalanced: boolean };
  generatedAt: string;
}

interface PnL {
  income: TrialBalanceRow[]; expense: TrialBalanceRow[];
  totalIncome: number; totalExpense: number; netProfit: number;
  period: { fromDate: string; toDate: string }; generatedAt: string;
}

interface BalanceSheet {
  assets: TrialBalanceRow[]; liabilities: TrialBalanceRow[]; equity: TrialBalanceRow[];
  retainedEarnings: number; totalAssets: number; totalLiabilities: number;
  totalEquity: number; totalLiabilitiesAndEquity: number; isBalanced: boolean;
  asOfDate: string; generatedAt: string;
}

interface CashFlowSection {
  items: Array<{ description: string; amount: number }>;
  cashIn: number; cashOut: number; net: number;
}

interface CashFlow {
  period: { fromDate: string; toDate: string };
  netIncome: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashChange: number;
  generatedAt: string;
}

export const glApi = createApi({
  reducerPath: 'glApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['GlAccounts', 'FiscalPeriods', 'JournalEntries', 'TrialBalance', 'PnL', 'BalanceSheet', 'CashFlow'],
  endpoints: (b) => ({
    // ── Chart of Accounts ──────────
    getGlAccounts: b.query<GlAccount[], { accountType?: string; tree?: boolean }>({
      query: (params) => ({ url: '/gl/accounts', params: params as any }),
      transformResponse: (r: any) => r.data,
      providesTags: ['GlAccounts'],
    }),
    createGlAccount: b.mutation<GlAccount, Partial<GlAccount>>({
      query: (body) => ({ url: '/gl/accounts', method: 'POST', body }),
      invalidatesTags: ['GlAccounts'],
    }),
    updateGlAccount: b.mutation<GlAccount, { id: string; data: Partial<GlAccount> }>({
      query: ({ id, data }) => ({ url: `/gl/accounts/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['GlAccounts'],
    }),
    seedCOA: b.mutation<{ seeded: boolean; count: number }, void>({
      query: () => ({ url: '/gl/accounts/seed', method: 'POST' }),
      invalidatesTags: ['GlAccounts'],
    }),

    // ── Fiscal Periods ─────────────
    getFiscalPeriods: b.query<FiscalPeriod[], void>({
      query: () => '/gl/fiscal-periods',
      transformResponse: (r: any) => r.data,
      providesTags: ['FiscalPeriods'],
    }),
    createFiscalPeriod: b.mutation<FiscalPeriod, any>({
      query: (body) => ({ url: '/gl/fiscal-periods', method: 'POST', body }),
      invalidatesTags: ['FiscalPeriods'],
    }),
    generateFiscalYear: b.mutation<{ created: number }, number>({
      query: (year) => ({ url: '/gl/fiscal-periods/generate', method: 'POST', body: { year } }),
      invalidatesTags: ['FiscalPeriods'],
    }),
    closeFiscalPeriod: b.mutation<FiscalPeriod, string>({
      query: (id) => ({ url: `/gl/fiscal-periods/${id}/close`, method: 'POST' }),
      invalidatesTags: ['FiscalPeriods'],
    }),
    reopenFiscalPeriod: b.mutation<FiscalPeriod, string>({
      query: (id) => ({ url: `/gl/fiscal-periods/${id}/reopen`, method: 'POST' }),
      invalidatesTags: ['FiscalPeriods'],
    }),

    // ── Journal Entries ────────────
    getJournalEntries: b.query<{ data: JournalEntry[]; meta: any }, Record<string, any>>({
      query: (params) => ({ url: '/gl/journal-entries', params }),
      transformResponse: (r: any) => ({ data: r.data, meta: r.meta }),
      providesTags: ['JournalEntries'],
    }),
    getJournalEntry: b.query<JournalEntry, string>({
      query: (id) => `/gl/journal-entries/${id}`,
      transformResponse: (r: any) => r.data,
    }),
    createJournalEntry: b.mutation<JournalEntry, any>({
      query: (body) => ({ url: '/gl/journal-entries', method: 'POST', body }),
      invalidatesTags: ['JournalEntries'],
    }),
    postJournalEntry: b.mutation<JournalEntry, string>({
      query: (id) => ({ url: `/gl/journal-entries/${id}/post`, method: 'POST' }),
      invalidatesTags: ['JournalEntries', 'TrialBalance', 'PnL', 'BalanceSheet'],
    }),
    reverseJournalEntry: b.mutation<JournalEntry, string>({
      query: (id) => ({ url: `/gl/journal-entries/${id}/reverse`, method: 'POST' }),
      invalidatesTags: ['JournalEntries', 'TrialBalance', 'PnL', 'BalanceSheet'],
    }),

    // ── Reports ────────────────────
    getTrialBalance: b.query<TrialBalance, { fromDate?: string; toDate?: string; propertyId?: string }>({
      query: (params) => ({ url: '/gl/trial-balance', params: params as any }),
      transformResponse: (r: any) => r.data,
      providesTags: ['TrialBalance'],
    }),
    getPnL: b.query<PnL, { fromDate?: string; toDate?: string; propertyId?: string; compareFromDate?: string; compareToDate?: string }>({
      query: (params) => ({ url: '/gl/reports/pnl', params: params as any }),
      transformResponse: (r: any) => r.data,
      providesTags: ['PnL'],
    }),
    getBalanceSheet: b.query<BalanceSheet, { asOfDate?: string; propertyId?: string }>({
      query: (params) => ({ url: '/gl/reports/balance-sheet', params: params as any }),
      transformResponse: (r: any) => r.data,
      providesTags: ['BalanceSheet'],
    }),
    getCashFlow: b.query<CashFlow, { fromDate?: string; toDate?: string; propertyId?: string }>({
      query: (params) => ({ url: '/gl/reports/cash-flow', params: params as any }),
      transformResponse: (r: any) => r.data,
      providesTags: ['CashFlow'],
    }),
  }),
});

export const {
  useGetGlAccountsQuery, useCreateGlAccountMutation, useUpdateGlAccountMutation, useSeedCOAMutation,
  useGetFiscalPeriodsQuery, useCreateFiscalPeriodMutation, useGenerateFiscalYearMutation,
  useCloseFiscalPeriodMutation, useReopenFiscalPeriodMutation,
  useGetJournalEntriesQuery, useGetJournalEntryQuery,
  useCreateJournalEntryMutation, usePostJournalEntryMutation, useReverseJournalEntryMutation,
  useGetTrialBalanceQuery, useGetPnLQuery, useGetBalanceSheetQuery, useGetCashFlowQuery,
} = glApi;

export type { GlAccount, FiscalPeriod, JournalEntry, JournalEntryLine, TrialBalanceRow, TrialBalance, PnL, BalanceSheet, CashFlow };
