import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CompanyDetail {
  id: string;
  name: string;
  legalName: string | null;
  companyType: string;
  registrationNo: string | null;
  taxId: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  timezone: string | null;
  currency: string | null;
  logoUrl: string | null;
  isActive: boolean;
  settings: Record<string, unknown>;
  subsidiaries: { id: string; name: string; companyType: string; isActive: boolean; country: string }[];
  _count: { branches: number; properties: number; users: number; regions: number; businessUnits: number };
}

export interface BranchItem {
  id: string; name: string; code: string | null;
  phone: string | null; email: string | null;
  addressLine1: string | null; city: string | null; country: string;
  isActive: boolean;
  manager: { id: string; profile: { firstName: string; lastName: string } | null } | null;
  _count: { properties: number };
}

export interface RegionItem {
  id: string; name: string; code: string | null; description: string | null;
  isActive: boolean;
  manager: { id: string; profile: { firstName: string; lastName: string } | null } | null;
  _count: { regionProperties: number };
}

export interface BusinessUnitItem {
  id: string; name: string; code: string | null; isActive: boolean;
  branch: { id: string; name: string } | null;
  manager: { id: string; profile: { firstName: string; lastName: string } | null } | null;
  _count: { properties: number };
}

export interface PropertyItem {
  id: string; name: string; code: string | null;
  propertyType: string; status: string;
  addressLine1: string | null; city: string | null; country: string | null;
  totalAreaSqft: string | null; yearBuilt: number | null;
  description: string | null; imageUrl: string | null;
  isActive: boolean;
  branch: { id: string; name: string } | null;
  businessUnit: { id: string; name: string } | null;
  regions: { id: string; name: string }[];
}

export interface PropertyStats {
  total: number; active: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export const organizationApi = createApi({
  reducerPath: 'organizationApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Company', 'Branches', 'Regions', 'BusinessUnits', 'Properties'],
  endpoints: (builder) => ({
    // ─── Company ────────────────────────────
    getCompany: builder.query<ApiResponse<CompanyDetail>, void>({
      query: () => '/company',
      providesTags: ['Company'],
    }),
    updateCompany: builder.mutation<ApiResponse<CompanyDetail>, Record<string, unknown>>({
      query: (body) => ({ url: '/company', method: 'PUT', body }),
      invalidatesTags: ['Company'],
    }),
    updateCompanySettings: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/company/settings', method: 'PUT', body }),
      invalidatesTags: ['Company'],
    }),
    uploadLogo: builder.mutation<ApiResponse<{ logoUrl: string }>, File>({
      query: (file) => {
        const fd = new FormData();
        fd.append('logo', file);
        return { url: '/company/logo', method: 'POST', body: fd };
      },
      invalidatesTags: ['Company'],
    }),
    getCompanyHierarchy: builder.query<ApiResponse<Record<string, unknown>>, void>({
      query: () => '/company/hierarchy',
      providesTags: ['Company'],
    }),

    // ─── Branches ───────────────────────────
    getBranches: builder.query<ApiResponse<BranchItem[]>, void>({
      query: () => '/branches',
      providesTags: ['Branches'],
    }),
    createBranch: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/branches', method: 'POST', body }),
      invalidatesTags: ['Branches', 'Company'],
    }),
    updateBranch: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/branches/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Branches'],
    }),
    deleteBranch: builder.mutation<void, string>({
      query: (id) => ({ url: `/branches/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Branches', 'Company'],
    }),

    // ─── Regions ────────────────────────────
    getRegions: builder.query<ApiResponse<RegionItem[]>, void>({
      query: () => '/regions',
      providesTags: ['Regions'],
    }),
    createRegion: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/regions', method: 'POST', body }),
      invalidatesTags: ['Regions'],
    }),
    updateRegion: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/regions/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Regions'],
    }),
    deleteRegion: builder.mutation<void, string>({
      query: (id) => ({ url: `/regions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Regions'],
    }),

    // ─── Business Units ─────────────────────
    getBusinessUnits: builder.query<ApiResponse<BusinessUnitItem[]>, void>({
      query: () => '/business-units',
      providesTags: ['BusinessUnits'],
    }),
    createBusinessUnit: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/business-units', method: 'POST', body }),
      invalidatesTags: ['BusinessUnits'],
    }),
    updateBusinessUnit: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/business-units/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['BusinessUnits'],
    }),
    deleteBusinessUnit: builder.mutation<void, string>({
      query: (id) => ({ url: `/business-units/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BusinessUnits'],
    }),

    // ─── Region Properties ───────────────────
    getRegionProperties: builder.query<ApiResponse<PropertyItem[]>, string>({
      query: (regionId) => `/regions/${regionId}/properties`,
      providesTags: (_r, _e, id) => [{ type: 'Regions', id }],
    }),
    addRegionProperty: builder.mutation<void, { regionId: string; propertyId: string }>({
      query: ({ regionId, propertyId }) => ({ url: `/regions/${regionId}/properties`, method: 'POST', body: { propertyId } }),
      invalidatesTags: ['Regions'],
    }),
    removeRegionProperty: builder.mutation<void, { regionId: string; propertyId: string }>({
      query: ({ regionId, propertyId }) => ({ url: `/regions/${regionId}/properties/${propertyId}`, method: 'DELETE' }),
      invalidatesTags: ['Regions'],
    }),

    // ─── Admin Provisioning ──────────────────
    getAdminCompanies: builder.query<ApiResponse<Array<Record<string, unknown>>>, void>({
      query: () => '/admin/companies',
      providesTags: ['Company'],
    }),
    provisionCompany: builder.mutation<ApiResponse<Record<string, unknown>>, Record<string, unknown>>({
      query: (body) => ({ url: '/admin/companies/provision', method: 'POST', body }),
      invalidatesTags: ['Company'],
    }),
    deactivateCompany: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/companies/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: ['Company'],
    }),
    activateCompany: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/companies/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Company'],
    }),

    // ─── Properties ─────────────────────────
    getProperties: builder.query<PaginatedResponse<PropertyItem>, Record<string, string>>({
      query: (params) => ({ url: '/properties', params }),
      providesTags: ['Properties'],
    }),
    getProperty: builder.query<ApiResponse<PropertyItem>, string>({
      query: (id) => `/properties/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Properties', id }],
    }),
    createProperty: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ url: '/properties', method: 'POST', body }),
      invalidatesTags: ['Properties', 'Company'],
    }),
    updateProperty: builder.mutation<void, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/properties/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Properties', id }, 'Properties'],
    }),
    deleteProperty: builder.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Properties', 'Company'],
    }),
    getPropertyStats: builder.query<ApiResponse<PropertyStats>, void>({
      query: () => '/properties/stats',
      providesTags: ['Properties'],
    }),
  }),
});

export const {
  useGetCompanyQuery,
  useUpdateCompanyMutation,
  useUpdateCompanySettingsMutation,
  useUploadLogoMutation,
  useGetCompanyHierarchyQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useGetRegionsQuery,
  useCreateRegionMutation,
  useUpdateRegionMutation,
  useDeleteRegionMutation,
  useGetRegionPropertiesQuery,
  useAddRegionPropertyMutation,
  useRemoveRegionPropertyMutation,
  useGetBusinessUnitsQuery,
  useCreateBusinessUnitMutation,
  useUpdateBusinessUnitMutation,
  useDeleteBusinessUnitMutation,
  useGetPropertiesQuery,
  useGetPropertyQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
  useGetPropertyStatsQuery,
  useGetAdminCompaniesQuery,
  useProvisionCompanyMutation,
  useDeactivateCompanyMutation,
  useActivateCompanyMutation,
} = organizationApi;
