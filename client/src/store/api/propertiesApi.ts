import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';
import { organizationApi } from './organizationApi';

// ─── Types ────────────────────────────────────

export interface PropertyType {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface FacilityType {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  category: string;
}

export interface PropertyPhoto {
  id: string;
  propertyId: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
}

export interface PropertyFacility {
  id: string;
  propertyId: string;
  facilityTypeId: string;
  facilityType: FacilityType;
  name: string | null;
  description: string | null;
  floor: string | null;
  capacity: number | null;
  operatingHours: Record<string, string> | null;
  isBookable: boolean;
  bookingAdvanceDays: number;
  isActive: boolean;
}

export interface PropertyContact {
  id: string;
  propertyId: string;
  role: string;
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface PropertyStatusHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedByUser: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  changedAt: string;
}

export interface PropertyStats {
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  maintenanceUnits: number;
  occupancyRate: number;
  activeLeases: number;
  expiringLeases: number;
}

export interface PropertyListItem {
  id: string;
  name: string;
  code: string | null;
  propertyType: string;
  status: string;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  geoLat: number | null;
  geoLng: number | null;
  coverImageUrl: string | null;
  totalUnits: number;
  totalFloors: number | null;
  manager: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  regions: Array<{ id: string; name: string }>;
  createdAt: string;
}

export interface PropertyDetail extends PropertyListItem {
  legalName: string | null;
  registrationNo: string | null;
  addressLine2: string | null;
  state: string | null;
  postalCode: string | null;
  yearBuilt: number | null;
  totalAreaSqm: number | null;
  totalAreaSqft: number | null;
  billingCycle: string;
  billingDay: number;
  currency: string;
  timezone: string;
  description: string | null;
  settings: Record<string, unknown>;
  photos: PropertyPhoto[];
  facilities: PropertyFacility[];
  contacts: PropertyContact[];
  updatedAt: string;
  branch: { id: string; name: string } | null;
}

export interface PropertyQueryParams {
  search?: string;
  status?: string;
  propertyType?: string;
  branchId?: string;
  regionId?: string;
  page?: number;
  limit?: number;
}

export interface FloorSetup {
  id: string;
  propertyId: string;
  floorNumber: number;
  floorLabel: string;
  isActive: boolean;
  property: { id: string; name: string; code: string | null };
}

export interface CreatePropertyDto {
  name: string;
  code?: string;
  propertyType: string;
  legalName?: string;
  registrationNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  geoLat?: number;
  geoLng?: number;
  yearBuilt?: number;
  totalFloors?: number;
  totalAreaSqm?: number;
  totalAreaSqft?: number;
  managerId?: string;
  billingCycle?: string;
  billingDay?: number;
  currency?: string;
  timezone?: string;
  description?: string;
  branchId?: string;
  businessUnitId?: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ─── API ──────────────────────────────────────

export const propertiesApi = createApi({
  reducerPath: 'propertiesApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Properties', 'PropertyPhotos', 'PropertyFacilities', 'PropertyContacts', 'PropertyStatus', 'FacilityTypes', 'FloorSetups'],
  endpoints: (builder) => ({
    // Catalog
    getPropertyTypes: builder.query<ApiResponse<PropertyType[]>, void>({
      query: () => '/properties/types',
    }),
    getFacilityTypes: builder.query<ApiResponse<FacilityType[]>, void>({
      query: () => '/facility-types',
      providesTags: ['FacilityTypes'],
    }),

    // Properties list/detail
    getProperties: builder.query<PaginatedResponse<PropertyListItem>, PropertyQueryParams>({
      query: (params) => ({ url: '/properties', params }),
      providesTags: ['Properties'],
    }),
    getProperty: builder.query<ApiResponse<PropertyDetail>, string>({
      query: (id) => `/properties/${id}`,
      providesTags: (_, __, id) => [{ type: 'Properties', id }],
    }),
    getPropertyStats: builder.query<ApiResponse<PropertyStats>, string>({
      query: (id) => `/properties/${id}/stats`,
    }),
    getCompanyPropertyStats: builder.query<ApiResponse<unknown>, void>({
      query: () => '/properties/stats',
    }),

    // CRUD
    createProperty: builder.mutation<ApiResponse<PropertyDetail>, CreatePropertyDto>({
      query: (body) => ({ url: '/properties', method: 'POST', body }),
      invalidatesTags: ['Properties'],
      // Keep the Organization Summary property count live without a page reload.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
    }),
    updateProperty: builder.mutation<ApiResponse<PropertyDetail>, { id: string; data: Partial<CreatePropertyDto> }>({
      query: ({ id, data }) => ({ url: `/properties/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Properties', id }, 'Properties'],
    }),
    deleteProperty: builder.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Properties'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(organizationApi.util.invalidateTags(['Company']));
        } catch { /* mutation failed — nothing to invalidate */ }
      },
    }),

    // Status
    updatePropertyStatus: builder.mutation<ApiResponse<PropertyDetail>, { id: string; status: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/properties/${id}/status`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Properties', id }, 'Properties', { type: 'PropertyStatus', id }],
    }),
    getStatusHistory: builder.query<ApiResponse<PropertyStatusHistory[]>, string>({
      query: (id) => `/properties/${id}/status-history`,
      providesTags: (_, __, id) => [{ type: 'PropertyStatus', id }],
    }),

    // Photos
    getPhotos: builder.query<ApiResponse<PropertyPhoto[]>, string>({
      query: (id) => `/properties/${id}/photos`,
      providesTags: (_, __, id) => [{ type: 'PropertyPhotos', id }],
    }),
    uploadPhotos: builder.mutation<ApiResponse<PropertyPhoto[]>, { propertyId: string; formData: FormData }>({
      query: ({ propertyId, formData }) => ({ url: `/properties/${propertyId}/photos`, method: 'POST', body: formData }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }, { type: 'Properties', id: propertyId }],
    }),
    reorderPhotos: builder.mutation<void, { propertyId: string; order: string[] }>({
      query: ({ propertyId, order }) => ({ url: `/properties/${propertyId}/photos/order`, method: 'PUT', body: { order } }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }],
    }),
    setCoverPhoto: builder.mutation<void, { propertyId: string; photoId: string }>({
      query: ({ propertyId, photoId }) => ({ url: `/properties/${propertyId}/photos/${photoId}/cover`, method: 'PUT' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }, { type: 'Properties', id: propertyId }],
    }),
    deletePhoto: builder.mutation<void, { propertyId: string; photoId: string }>({
      query: ({ propertyId, photoId }) => ({ url: `/properties/${propertyId}/photos/${photoId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyPhotos', id: propertyId }, { type: 'Properties', id: propertyId }],
    }),

    // Facilities
    getFacilities: builder.query<ApiResponse<PropertyFacility[]>, string>({
      query: (id) => `/properties/${id}/facilities`,
      providesTags: (_, __, id) => [{ type: 'PropertyFacilities', id }],
    }),
    addFacility: builder.mutation<ApiResponse<PropertyFacility>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/facilities`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyFacilities', id: propertyId }],
    }),
    updateFacility: builder.mutation<ApiResponse<PropertyFacility>, { propertyId: string; facilityId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, facilityId, data }) => ({ url: `/properties/${propertyId}/facilities/${facilityId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyFacilities', id: propertyId }],
    }),
    removeFacility: builder.mutation<void, { propertyId: string; facilityId: string }>({
      query: ({ propertyId, facilityId }) => ({ url: `/properties/${propertyId}/facilities/${facilityId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyFacilities', id: propertyId }],
    }),

    // Contacts
    getContacts: builder.query<ApiResponse<PropertyContact[]>, string>({
      query: (id) => `/properties/${id}/contacts`,
      providesTags: (_, __, id) => [{ type: 'PropertyContacts', id }],
    }),
    addContact: builder.mutation<ApiResponse<PropertyContact>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/contacts`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyContacts', id: propertyId }],
    }),
    updateContact: builder.mutation<ApiResponse<PropertyContact>, { propertyId: string; contactId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, contactId, data }) => ({ url: `/properties/${propertyId}/contacts/${contactId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyContacts', id: propertyId }],
    }),
    removeContact: builder.mutation<void, { propertyId: string; contactId: string }>({
      query: ({ propertyId, contactId }) => ({ url: `/properties/${propertyId}/contacts/${contactId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'PropertyContacts', id: propertyId }],
    }),

    // ── Nearby Search ──
    getNearbyProperties: builder.query<{ success: boolean; data: Array<{
      id: string; name: string; code: string | null;
      propertyType: string; status: string;
      addressLine1: string | null; city: string | null; country: string | null;
      geoLat: number; geoLng: number; coverImageUrl: string | null;
      distanceKm: number;
    }> }, { lat: number; lng: number; radiusKm?: number; excludePropertyId?: string; limit?: number }>({
      query: (params) => ({ url: '/properties/nearby', params }),
      providesTags: ['Properties'],
    }),

    // ── Floor Setup ──
    getFloorSetups: builder.query<ApiResponse<FloorSetup[]>, { propertyId?: string; floorNumber?: number } | void>({
      query: (params) => ({ url: '/floor-setup', params: params || {} }),
      providesTags: ['FloorSetups'],
    }),
    createFloorSetup: builder.mutation<ApiResponse<FloorSetup>, Record<string, unknown>>({
      query: (body) => ({ url: '/floor-setup', method: 'POST', body }),
      invalidatesTags: ['FloorSetups'],
    }),
    updateFloorSetup: builder.mutation<ApiResponse<FloorSetup>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/floor-setup/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['FloorSetups'],
    }),
    deleteFloorSetup: builder.mutation<void, string>({
      query: (id) => ({ url: `/floor-setup/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FloorSetups'],
    }),
  }),
});

export const {
  useGetPropertyTypesQuery,
  useGetFacilityTypesQuery,
  useGetPropertiesQuery,
  useGetPropertyQuery,
  useGetPropertyStatsQuery,
  useGetCompanyPropertyStatsQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
  useUpdatePropertyStatusMutation,
  useGetStatusHistoryQuery,
  useGetPhotosQuery,
  useUploadPhotosMutation,
  useReorderPhotosMutation,
  useSetCoverPhotoMutation,
  useDeletePhotoMutation,
  useGetFacilitiesQuery,
  useAddFacilityMutation,
  useUpdateFacilityMutation,
  useRemoveFacilityMutation,
  useGetContactsQuery,
  useAddContactMutation,
  useUpdateContactMutation,
  useRemoveContactMutation,
  useGetNearbyPropertiesQuery,
  useGetFloorSetupsQuery,
  useCreateFloorSetupMutation,
  useUpdateFloorSetupMutation,
  useDeleteFloorSetupMutation,
} = propertiesApi;
