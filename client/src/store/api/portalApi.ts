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
  tagTypes: ['PortalDashboard', 'PortalInvoices', 'PortalMaintenance', 'PortalResidents', 'PortalLease', 'PortalProfile'],
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
  }),
});

export const {
  useGetPortalDashboardQuery,
  useGetPortalInvoicesQuery,
  useGetPortalPaymentHistoryQuery,
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
  useGetPortalProfileQuery,
  useUpdatePortalProfileMutation,
} = portalApi;
