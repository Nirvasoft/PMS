import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ── Types ────────────────────────────────────

export interface PortalResident {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  residentType: string;
}

export interface PortalUnit {
  id: string;
  unitNumber: string;
  unitType: string;
  floorNumber: number | null;
}

export interface PortalProperty {
  id: string;
  name: string;
  address: string;
  coverImageUrl: string | null;
  contacts: { role: string; name: string; phone: string }[];
}

export interface PortalLease {
  id: string;
  leaseNumber: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  currency: string;
  daysUntilExpiry: number | null;
  status: string;
}

export interface InvoiceSummary {
  outstanding: number;
  overdueCount: number;
  paidThisMonth: number;
  nextDueDate: string | null;
}

export interface PortalTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface PortalDashboardData {
  resident: PortalResident;
  unit: PortalUnit;
  property: PortalProperty;
  lease: PortalLease | null;
  invoiceSummary: InvoiceSummary;
  openTickets: PortalTicket[];
  recentAnnouncements: any[];
  quickActions: QuickAction[];
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  actionType: string;
  actionUrl?: string;
  sortOrder: number;
  isActive?: boolean;
  propertyId?: string;
  property?: { id: string; name: string };
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  currency: string;
  status: string;
  lines: { description: string; amount: number }[];
}

export interface PortalReceipt {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  allocations: { invoiceNumber: string; amount: number }[];
}

export interface PortalResidentFull {
  id: string;
  firstName: string;
  lastName: string;
  residentType: string;
  relationship: string | null;
  mobile: string | null;
  email: string | null;
  avatarUrl: string | null;
  hasPortalAccess: boolean;
  moveInDate: string | null;
  vehiclePlate: string | null;
  dateOfBirth: string | null;
  idType: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PortalLeaseDetail {
  id: string;
  leaseNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  currency: string;
  billingCycle: string;
  securityDeposit: number;
  depositPaid: boolean;
  escalationType: string | null;
  escalationValue: number | null;
  escalationFrequency: string | null;
  esignStatus: string;
  specialConditions: string | null;
  clauses: any;
  escalationSchedule: any[];
  property: { name: string; code: string | null };
  unit: { unitNumber: string };
}

export interface PortalProfile {
  resident: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    mobile: string | null;
    avatarUrl: string | null;
    vehiclePlate: string | null;
    residentType: string;
  };
  profile: {
    timezone: string;
    locale: string;
  } | null;
}

// ── API ──────────────────────────────────────

export const portalApi = createApi({
  reducerPath: 'portalApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['PortalDashboard', 'PortalInvoices', 'PortalMaintenance', 'PortalResidents', 'PortalLease', 'PortalProfile', 'PortalKyc', 'QuickActions', 'AccessCards', 'Branding'],
  endpoints: (builder) => ({
    // Dashboard
    getPortalDashboard: builder.query<PortalDashboardData, void>({
      query: () => '/portal/dashboard',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalDashboard'],
    }),

    // Invoices
    getPortalInvoices: builder.query<{ data: PortalInvoice[]; meta: any }, { status?: string; page?: number; limit?: number }>({
      query: (params) => ({ url: '/portal/invoices', params }),
      transformResponse: (r: any) => ({ data: r.data, meta: r.meta }),
      providesTags: ['PortalInvoices'],
    }),

    // Payment History
    getPortalPaymentHistory: builder.query<PortalReceipt[], void>({
      query: () => '/portal/payments/history',
      transformResponse: (r: any) => r.data,
    }),

    // Pay Invoice (Stripe Checkout)
    payPortalInvoice: builder.mutation<
      { checkoutUrl: string; sessionId: string; amount: number; currency: string },
      { invoiceId: string; returnUrl: string }
    >({
      query: ({ invoiceId, returnUrl }) => ({
        url: `/portal/invoices/${invoiceId}/pay`,
        method: 'POST',
        body: { returnUrl },
      }),
      transformResponse: (r: any) => r.data,
      invalidatesTags: ['PortalInvoices', 'PortalDashboard'],
    }),

    // Lease
    getPortalLease: builder.query<PortalLeaseDetail, void>({
      query: () => '/portal/lease',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalLease'],
    }),

    // Lease Documents
    getPortalLeaseDocuments: builder.query<any[], void>({
      query: () => '/portal/lease/documents',
      transformResponse: (r: any) => r.data,
    }),

    // Maintenance
    getPortalMaintenanceTickets: builder.query<any[], void>({
      query: () => '/portal/maintenance',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalMaintenance'],
    }),

    getPortalMaintenanceTicket: builder.query<any, string>({
      query: (id) => `/portal/maintenance/${id}`,
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalMaintenance'],
    }),

    submitPortalMaintenance: builder.mutation<any, {
      title: string; description: string; categoryId?: string; priority?: string;
      locationDetail?: string; requiresAccess?: boolean;
    }>({
      query: (body) => ({ url: '/portal/maintenance', method: 'POST', body }),
      invalidatesTags: ['PortalDashboard', 'PortalMaintenance'],
    }),

    ratePortalTicket: builder.mutation<any, { id: string; rating: number; comment?: string }>({
      query: ({ id, ...body }) => ({ url: `/portal/maintenance/${id}/rate`, method: 'POST', body }),
      invalidatesTags: ['PortalMaintenance'],
    }),

    // Residents
    getPortalResidents: builder.query<PortalResidentFull[], void>({
      query: () => '/portal/residents',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalResidents'],
    }),

    addPortalResident: builder.mutation<any, {
      firstName: string; lastName: string; residentType?: string; relationship?: string;
      dateOfBirth?: string; idType?: string; idNumber?: string; mobile?: string;
      email?: string; vehiclePlate?: string; moveInDate?: string; notes?: string;
    }>({
      query: (body) => ({ url: '/portal/residents', method: 'POST', body }),
      invalidatesTags: ['PortalResidents'],
    }),

    updatePortalResident: builder.mutation<any, { id: string; [key: string]: any }>({
      query: ({ id, ...body }) => ({ url: `/portal/residents/${id}`, method: 'PUT', body }),
      invalidatesTags: ['PortalResidents'],
    }),

    removePortalResident: builder.mutation<any, string>({
      query: (id) => ({ url: `/portal/residents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PortalResidents'],
    }),

    // Invite Resident to Portal
    inviteResidentToPortal: builder.mutation<
      { inviteUrl: string; email: string; expiresAt: string; residentName: string },
      { residentId: string; email: string }
    >({
      query: ({ residentId, email }) => ({
        url: `/portal/residents/${residentId}/invite-portal`,
        method: 'POST',
        body: { email },
      }),
      transformResponse: (r: any) => r.data,
      invalidatesTags: ['PortalResidents'],
    }),

    // Profile
    getPortalProfile: builder.query<PortalProfile, void>({
      query: () => '/portal/profile',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalProfile'],
    }),

    updatePortalProfile: builder.mutation<PortalProfile, { mobile?: string; avatarUrl?: string; timezone?: string; locale?: string }>({
      query: (body) => ({ url: '/portal/profile', method: 'PUT', body }),
      invalidatesTags: ['PortalProfile'],
    }),

    // ── KYC Self-Upload ─────────────────────────
    getPortalKyc: builder.query<{
      status: string;
      verifiedAt?: string;
      expiryDate?: string;
      documents: {
        id: string;
        requirementId: string;
        documentId?: string;
        docType: string;
        name: string;
        isRequired: boolean;
        status: string;
        submittedAt: string;
        reviewedAt?: string;
        rejectionReason?: string;
        expiryDate?: string;
        requirement: { name: string; description?: string; docType: string };
      }[];
    }, void>({
      query: () => '/portal/kyc',
      transformResponse: (r: any) => r.data,
      providesTags: ['PortalKyc'],
    }),

    submitPortalKycDocument: builder.mutation<any, { requirementId: string; documentId: string }>({
      query: (body) => ({ url: '/portal/kyc/documents', method: 'POST', body }),
      invalidatesTags: ['PortalKyc'],
    }),

    // ── Admin Quick Actions CRUD ────────────────
    getQuickActions: builder.query<QuickAction[], { propertyId?: string } | void>({
      query: (params) => ({ url: '/admin/portal/quick-actions', params: params || {} }),
      transformResponse: (r: any) => r.data,
      providesTags: ['QuickActions'],
    }),
    createQuickAction: builder.mutation<QuickAction, {
      propertyId: string; label: string; icon?: string;
      actionType: string; actionUrl?: string; sortOrder?: number;
    }>({
      query: (body) => ({ url: '/admin/portal/quick-actions', method: 'POST', body }),
      invalidatesTags: ['QuickActions', 'PortalDashboard'],
    }),
    updateQuickAction: builder.mutation<QuickAction, {
      id: string; label?: string; icon?: string; actionType?: string;
      actionUrl?: string; isActive?: boolean; sortOrder?: number;
    }>({
      query: ({ id, ...body }) => ({ url: `/admin/portal/quick-actions/${id}`, method: 'PUT', body }),
      invalidatesTags: ['QuickActions', 'PortalDashboard'],
    }),
    deleteQuickAction: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/portal/quick-actions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['QuickActions', 'PortalDashboard'],
    }),

    // ── Portal Session Tracking ─────────────────
    startPortalSession: builder.mutation<{ sessionId: string }, void>({
      query: () => ({ url: '/portal/session/start', method: 'POST' }),
      transformResponse: (r: any) => r.data,
    }),
    heartbeatSession: builder.mutation<void, string>({
      query: (id) => ({ url: `/portal/session/${id}/heartbeat`, method: 'POST' }),
    }),
    endPortalSession: builder.mutation<void, string>({
      query: (id) => ({ url: `/portal/session/${id}/end`, method: 'POST' }),
    }),

    // ── Admin Portal Analytics ──────────────────
    getPortalAnalytics: builder.query<PortalAnalyticsData, { startDate?: string; endDate?: string } | void>({
      query: (params) => ({ url: '/admin/portal/analytics', params: params || {} }),
      transformResponse: (r: any) => r.data,
    }),

    // ── Admin Access Cards ───────────────────────
    getAccessCards: builder.query<
      { data: AccessCard[]; meta: { total: number; page: number; limit: number } },
      { propertyId?: string; status?: string; cardType?: string; search?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/admin/access-cards', params: params || {} }),
      providesTags: ['AccessCards'],
    }),
    getAccessCardStats: builder.query<AccessCardStats, void>({
      query: () => '/admin/access-cards/stats',
      transformResponse: (r: any) => r.data,
      providesTags: ['AccessCards'],
    }),
    issueAccessCard: builder.mutation<AccessCard, {
      residentId: string; propertyId: string; cardNumber: string;
      cardType?: string; issuedAt?: string; expiresAt?: string; notes?: string;
    }>({
      query: (body) => ({ url: '/admin/access-cards', method: 'POST', body }),
      invalidatesTags: ['AccessCards'],
    }),
    updateAccessCard: builder.mutation<AccessCard, {
      id: string; status?: string; notes?: string; expiresAt?: string;
    }>({
      query: ({ id, ...body }) => ({ url: `/admin/access-cards/${id}`, method: 'PUT', body }),
      invalidatesTags: ['AccessCards'],
    }),

    // ── Portal Branding ──────────────────────────
    getPortalBranding: builder.query<PortalBranding, string>({
      query: (propertyId) => ({ url: '/admin/portal/branding', params: { propertyId } }),
      transformResponse: (r: any) => r.data,
      providesTags: ['Branding'],
    }),
    updatePortalBranding: builder.mutation<PortalBranding, { propertyId: string; data: Partial<PortalBranding> }>({
      query: ({ propertyId, data }) => ({ url: '/admin/portal/branding', method: 'PUT', params: { propertyId }, body: data }),
      transformResponse: (r: any) => r.data,
      invalidatesTags: ['Branding', 'PortalDashboard'],
    }),
  }),
});

export interface PortalAnalyticsData {
  period: { start: string; end: string };
  summary: {
    totalSessions: number;
    uniqueUsers: number;
    avgDurationMinutes: number;
    avgPages: number;
  };
  activeNow: number;
  dailyCounts: { date: string; count: number }[];
  topUsers: { userId: string; email: string; name: string; sessionCount: number; totalPages: number }[];
  peakHours: { hour: number; count: number }[];
}

export const {
  useGetPortalDashboardQuery,
  useGetPortalInvoicesQuery,
  useGetPortalPaymentHistoryQuery,
  usePayPortalInvoiceMutation,
  useGetPortalLeaseQuery,
  useGetPortalLeaseDocumentsQuery,
  useGetPortalMaintenanceTicketsQuery,
  useGetPortalMaintenanceTicketQuery,
  useSubmitPortalMaintenanceMutation,
  useRatePortalTicketMutation,
  useGetPortalResidentsQuery,
  useAddPortalResidentMutation,
  useUpdatePortalResidentMutation,
  useRemovePortalResidentMutation,
  useInviteResidentToPortalMutation,
  useGetPortalProfileQuery,
  useUpdatePortalProfileMutation,
  useGetPortalKycQuery,
  useSubmitPortalKycDocumentMutation,
  useGetQuickActionsQuery,
  useCreateQuickActionMutation,
  useUpdateQuickActionMutation,
  useDeleteQuickActionMutation,
  useStartPortalSessionMutation,
  useHeartbeatSessionMutation,
  useEndPortalSessionMutation,
  useGetPortalAnalyticsQuery,
  useGetAccessCardsQuery,
  useGetAccessCardStatsQuery,
  useIssueAccessCardMutation,
  useUpdateAccessCardMutation,
  useGetPortalBrandingQuery,
  useUpdatePortalBrandingMutation,
} = portalApi;

export interface PortalBranding {
  propertyId: string;
  propertyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  welcomeMessage: string;
  supportEmail: string | null;
  supportPhone: string | null;
  showOnlinePayment: boolean;
  showMaintenance: boolean;
  showCommunity: boolean;
  showBookings: boolean;
  customCss: string | null;
}

export interface AccessCard {
  id: string;
  cardNumber: string;
  cardType: string;
  issuedAt: string;
  expiresAt?: string;
  status: string;
  notes?: string;
  createdAt: string;
  resident?: { id: string; firstName: string; lastName: string; residentType: string };
  property?: { id: string; name: string };
  issuedBy?: { email: string; profile?: { firstName: string; lastName: string } };
}

export interface AccessCardStats {
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
  expiringSoon: number;
  total: number;
}
