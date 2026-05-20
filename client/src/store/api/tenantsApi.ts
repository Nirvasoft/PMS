import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ──────────────────────────────────────

export interface TenantListItem {
  id: string;
  tenantType: 'individual' | 'company';
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  mobile: string | null;
  kycStatus: string;
  isBlacklisted: boolean;
  avatarUrl: string | null;
  tags: string[];
  source: string | null;
  activeLeases: number;
  createdAt: string;
}

export interface EmergencyContact {
  id: string;
  tenantId: string;
  name: string;
  relationship: string;
  phone: string;
  mobile: string | null;
  email: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface KycDocumentItem {
  id: string;
  requirementId: string;
  documentId: string | null;
  docType: string;
  name: string;
  isRequired: boolean;
  status: string;
  reviewedBy: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expiryDate: string | null;
  submittedAt: string;
}

export interface KycSummary {
  status: string;
  submitted: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface TenantDetail {
  id: string;
  tenantType: 'individual' | 'company';
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  idExpiryDate: string | null;
  companyName: string | null;
  companyRegNo: string | null;
  companyType: string | null;
  gstRegNo: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  contactPersonName: string | null;
  contactPersonPhone: string | null;
  contactPersonEmail: string | null;
  contactPersonRole: string | null;
  kycStatus: string;
  kycVerifiedAt: string | null;
  kycExpiryDate: string | null;
  isBlacklisted: boolean;
  blacklistedAt: string | null;
  avatarUrl: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  emergencyContacts: EmergencyContact[];
  kycDocuments: KycDocumentItem[];
  kycSummary: KycSummary;
  _count: { tenantNotes: number };
}

export interface KycDetail {
  status: string;
  verifiedAt: string | null;
  expiryDate: string | null;
  documents: KycDocumentItem[];
}

export interface TenantNote {
  id: string;
  tenantId: string;
  content: string;
  isPinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; email: string; profile: { firstName: string; lastName: string } | null };
}

export interface BlacklistLogEntry {
  id: string;
  action: string;
  reason: string;
  scope: string;
  notes: string | null;
  actionedAt: string;
  actionedByUser: { id: string; email: string; profile: { firstName: string; lastName: string } | null };
}

export interface LeaseHistoryItem {
  id: string;
  leaseNumber: string;
  unitNumber: string;
  propertyName: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  currency: string;
  billingCycle: string;
  status: string;
}

export interface KycRequirement {
  id: string;
  companyId: string;
  tenantType: string;
  docType: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  validityDays: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────────

export const tenantsApi = createApi({
  reducerPath: 'tenantsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Tenants', 'TenantKyc', 'EmergencyContacts', 'TenantNotes', 'BlacklistLog', 'KycRequirements'],
  endpoints: (builder) => ({

    // ── Tenants CRUD ──
    getTenants: builder.query<PaginatedResponse<TenantListItem>, {
      search?: string; tenantType?: string; kycStatus?: string;
      isBlacklisted?: boolean; tags?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/tenants', params }),
      providesTags: ['Tenants'],
    }),
    getTenant: builder.query<ApiResponse<TenantDetail>, string>({
      query: (id) => `/tenants/${id}`,
      providesTags: (_, __, id) => [{ type: 'Tenants', id }],
    }),
    createTenant: builder.mutation<ApiResponse<TenantDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/tenants', method: 'POST', body }),
      invalidatesTags: ['Tenants'],
    }),
    updateTenant: builder.mutation<ApiResponse<TenantDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/tenants/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    deleteTenant: builder.mutation<void, string>({
      query: (id) => ({ url: `/tenants/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Tenants'],
    }),
    uploadAvatar: builder.mutation<ApiResponse<{ avatarUrl: string }>, { id: string; file: File }>({
      query: ({ id, file }) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return {
          url: `/tenants/${id}/avatar`,
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),

    // ── Blacklisted list ──
    getBlacklisted: builder.query<PaginatedResponse<TenantListItem>, { page?: number; limit?: number }>({
      query: (params) => ({ url: '/tenants/blacklisted', params }),
      providesTags: ['Tenants'],
    }),

    // ── Merge ──
    mergeTenants: builder.mutation<ApiResponse<{ mergedInto: string; message: string }>, { primaryTenantId: string; duplicateTenantId: string; confirmActiveLeasesTransfer?: boolean }>({
      query: (body) => ({ url: '/tenants/merge', method: 'POST', body }),
      invalidatesTags: ['Tenants'],
    }),

    // ── Lease History ──
    getLeaseHistory: builder.query<ApiResponse<LeaseHistoryItem[]>, string>({
      query: (id) => `/tenants/${id}/lease-history`,
      providesTags: (_, __, id) => [{ type: 'Tenants', id }],
    }),

    // ── KYC ──
    getTenantKyc: builder.query<ApiResponse<KycDetail>, string>({
      query: (id) => `/tenants/${id}/kyc`,
      providesTags: (_, __, id) => [{ type: 'TenantKyc', id }],
    }),
    submitKycDocument: builder.mutation<ApiResponse<unknown>, { tenantId: string; requirementId: string; documentId: string }>({
      query: ({ tenantId, ...body }) => ({ url: `/tenants/${tenantId}/kyc/documents`, method: 'POST', body }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantKyc', id: tenantId }, { type: 'Tenants', id: tenantId }],
    }),
    reviewKycDocument: builder.mutation<ApiResponse<unknown>, { tenantId: string; kycDocId: string; decision: string; rejectionReason?: string }>({
      query: ({ tenantId, kycDocId, ...data }) => ({ url: `/tenants/${tenantId}/kyc/documents/${kycDocId}/review`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantKyc', id: tenantId }, { type: 'Tenants', id: tenantId }],
    }),

    // ── Blacklist ──
    blacklistTenant: builder.mutation<ApiResponse<unknown>, { id: string; reason: string; scope?: string; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/tenants/${id}/blacklist`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    whitelistTenant: builder.mutation<ApiResponse<unknown>, { id: string; reason: string; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/tenants/${id}/whitelist`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    getBlacklistHistory: builder.query<ApiResponse<BlacklistLogEntry[]>, string>({
      query: (id) => `/tenants/${id}/blacklist-history`,
      providesTags: (_, __, id) => [{ type: 'BlacklistLog', id }],
    }),

    // ── Emergency Contacts ──
    getEmergencyContacts: builder.query<ApiResponse<EmergencyContact[]>, string>({
      query: (id) => `/tenants/${id}/emergency-contacts`,
      providesTags: (_, __, id) => [{ type: 'EmergencyContacts', id }],
    }),
    addEmergencyContact: builder.mutation<ApiResponse<EmergencyContact>, { tenantId: string; data: Record<string, unknown> }>({
      query: ({ tenantId, data }) => ({ url: `/tenants/${tenantId}/emergency-contacts`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'EmergencyContacts', id: tenantId }],
    }),
    updateEmergencyContact: builder.mutation<ApiResponse<EmergencyContact>, { tenantId: string; contactId: string; data: Record<string, unknown> }>({
      query: ({ tenantId, contactId, data }) => ({ url: `/tenants/${tenantId}/emergency-contacts/${contactId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'EmergencyContacts', id: tenantId }],
    }),
    deleteEmergencyContact: builder.mutation<void, { tenantId: string; contactId: string }>({
      query: ({ tenantId, contactId }) => ({ url: `/tenants/${tenantId}/emergency-contacts/${contactId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'EmergencyContacts', id: tenantId }],
    }),

    // ── Notes ──
    getTenantNotes: builder.query<ApiResponse<TenantNote[]>, string>({
      query: (id) => `/tenants/${id}/notes`,
      providesTags: (_, __, id) => [{ type: 'TenantNotes', id }],
    }),
    addTenantNote: builder.mutation<ApiResponse<TenantNote>, { tenantId: string; content: string; isPinned?: boolean }>({
      query: ({ tenantId, ...data }) => ({ url: `/tenants/${tenantId}/notes`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantNotes', id: tenantId }],
    }),
    updateTenantNote: builder.mutation<ApiResponse<TenantNote>, { tenantId: string; noteId: string; content?: string; isPinned?: boolean }>({
      query: ({ tenantId, noteId, ...data }) => ({ url: `/tenants/${tenantId}/notes/${noteId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantNotes', id: tenantId }],
    }),
    deleteTenantNote: builder.mutation<void, { tenantId: string; noteId: string }>({
      query: ({ tenantId, noteId }) => ({ url: `/tenants/${tenantId}/notes/${noteId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantNotes', id: tenantId }],
    }),

    // ── KYC Requirements ──
    getKycRequirements: builder.query<ApiResponse<KycRequirement[]>, { tenantType?: string } | void>({
      query: (params) => ({ url: '/kyc-requirements', params: params || {} }),
      providesTags: ['KycRequirements'],
    }),
    createKycRequirement: builder.mutation<ApiResponse<KycRequirement>, Record<string, unknown>>({
      query: (body) => ({ url: '/kyc-requirements', method: 'POST', body }),
      invalidatesTags: ['KycRequirements'],
    }),
    deleteKycRequirement: builder.mutation<void, string>({
      query: (id) => ({ url: `/kyc-requirements/${id}`, method: 'DELETE' }),
      invalidatesTags: ['KycRequirements'],
    }),
  }),
});

export const {
  useGetTenantsQuery,
  useGetTenantQuery,
  useCreateTenantMutation,
  useUpdateTenantMutation,
  useDeleteTenantMutation,
  useUploadAvatarMutation,
  useGetBlacklistedQuery,
  useMergeTenantsMutation,
  useGetLeaseHistoryQuery,
  useGetTenantKycQuery,
  useSubmitKycDocumentMutation,
  useReviewKycDocumentMutation,
  useBlacklistTenantMutation,
  useWhitelistTenantMutation,
  useGetBlacklistHistoryQuery,
  useGetEmergencyContactsQuery,
  useAddEmergencyContactMutation,
  useUpdateEmergencyContactMutation,
  useDeleteEmergencyContactMutation,
  useGetTenantNotesQuery,
  useAddTenantNoteMutation,
  useUpdateTenantNoteMutation,
  useDeleteTenantNoteMutation,
  useGetKycRequirementsQuery,
  useCreateKycRequirementMutation,
  useDeleteKycRequirementMutation,
} = tenantsApi;
