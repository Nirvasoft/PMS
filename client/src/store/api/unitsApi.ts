import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ─────────────────────────────────────────

export interface UnitType {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
}

export interface TowerSection {
  id: string;
  towerId: string;
  name: string;
  code: string | null;
  sortOrder: number;
}

export interface Tower {
  id: string;
  propertyId: string;
  name: string;
  code: string | null;
  description: string | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  isActive: boolean;
  sortOrder: number;
  sections: TowerSection[];
  unitStats?: {
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    maintenance: number;
    not_for_rent: number;
  };
}

export interface UnitAmenity {
  id: string;
  unitId: string;
  amenity: string;
  notes: string | null;
}

export interface UtilityMeter {
  id: string;
  unitId: string;
  meterType: string;
  meterSerialNo: string;
  meterProvider: string | null;
  location: string | null;
  lastReading: number | null;
  lastReadingDate: string | null;
  isSmartMeter: boolean;
  isActive: boolean;
  installedAt: string | null;
}

export interface UnitStatusHistory {
  id: string;
  unitId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedByUser: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  changedAt: string;
}

export interface UnitLease {
  id: string;
  leaseNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  currency: string;
  billingCycle: string;
  leaseTermMonths: number;
  tenant: {
    id: string;
    tenantType: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    email: string | null;
  };
}

export interface UnitListItem {
  id: string;
  unitNumber: string;
  unitType: string;
  floorNumber: number | null;
  floorLabel: string | null;
  areaSqft: number | null;
  areaSqm: number | null;
  bedroomCount: number;
  bathroomCount: number;
  direction: string | null;
  status: string;
  furnishing: string;
  tower: { id: string; name: string; code: string | null } | null;
  section: { id: string; name: string } | null;
  meters: Array<{ meterType: string; meterSerialNo: string }>;
  amenities: Array<{ amenity: string }>;
}

export interface UnitDetail extends UnitListItem {
  ownershipType: string;
  ownerName: string | null;
  ownerContact: string | null;
  floorPlanUrl: string | null;
  description: string | null;
  notes: string | null;
  unitTypeRef: UnitType | null;
  statusHistory: UnitStatusHistory[];
  meters: UtilityMeter[];
  amenities: UnitAmenity[];
  leases: UnitLease[];
}

export interface FloorPlanMatrix {
  floors: Array<{
    floorNumber: number;
    floorLabel: string;
    units: Array<{
      id: string;
      unitNumber: string;
      unitType: string;
      areaSqft: number | null;
      status: string;
      furnishing: string;
      tower: { id: string; name: string } | null;
    }>;
  }>;
}

export interface UnitStats {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  not_for_rent: number;
  occupancyRate: number;
}

export interface BulkCreateResult {
  created: number;
  units: Array<{ id: string; unitNumber: string }>;
}

export interface UnitQueryParams {
  propertyId: string;
  towerId?: string;
  sectionId?: string;
  status?: string;
  unitType?: string;
  floor?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateUnitDto {
  unitNumber: string;
  unitTypeId?: string;
  unitType: string;
  towerId?: string;
  sectionId?: string;
  floorNumber?: number;
  floorLabel?: string;
  areaSqft?: number;
  areaSqm?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  direction?: string;
  furnishing?: string;
  ownershipType?: string;
  ownerName?: string;
  description?: string;
  notes?: string;
  amenities?: string[];
}

export interface BulkCreateDto {
  towerId?: string;
  floorRange?: {
    from: number;
    to: number;
    unitsPerFloor: number;
    unitTypeId: string;
    areaSqft?: number;
    areaSqm?: number;
    prefix?: string;
  };
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ────────────────────────────────────────────

export const unitsApi = createApi({
  reducerPath: 'unitsApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Towers', 'Units', 'FloorPlan', 'Meters', 'UnitTypes', 'UnitStats'],
  endpoints: (builder) => ({

    // Catalog
    getUnitTypes: builder.query<ApiResponse<UnitType[]>, void>({
      query: () => '/unit-types',
      providesTags: ['UnitTypes'],
    }),

    // Towers
    getTowers: builder.query<ApiResponse<Tower[]>, string>({
      query: (propertyId) => `/properties/${propertyId}/towers`,
      providesTags: (_, __, propertyId) => [{ type: 'Towers', id: propertyId }],
    }),
    createTower: builder.mutation<ApiResponse<Tower>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/towers`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),
    updateTower: builder.mutation<ApiResponse<Tower>, { propertyId: string; towerId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, towerId, data }) => ({ url: `/properties/${propertyId}/towers/${towerId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),
    deleteTower: builder.mutation<void, { propertyId: string; towerId: string }>({
      query: ({ propertyId, towerId }) => ({ url: `/properties/${propertyId}/towers/${towerId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),
    addSection: builder.mutation<ApiResponse<TowerSection>, { propertyId: string; towerId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, towerId, data }) => ({ url: `/properties/${propertyId}/towers/${towerId}/sections`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),
    updateSection: builder.mutation<ApiResponse<TowerSection>, { propertyId: string; towerId: string; sectionId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, towerId, sectionId, data }) => ({
        url: `/properties/${propertyId}/towers/${towerId}/sections/${sectionId}`, method: 'PUT', body: data,
      }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),
    deleteSection: builder.mutation<void, { propertyId: string; towerId: string; sectionId: string }>({
      query: ({ propertyId, towerId, sectionId }) => ({ url: `/properties/${propertyId}/towers/${towerId}/sections/${sectionId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { propertyId }) => [{ type: 'Towers', id: propertyId }],
    }),

    // Units
    getUnits: builder.query<PaginatedResponse<UnitListItem>, UnitQueryParams>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/units`, params }),
      providesTags: ['Units'],
    }),
    getUnit: builder.query<ApiResponse<UnitDetail>, { propertyId: string; unitId: string }>({
      query: ({ propertyId, unitId }) => `/properties/${propertyId}/units/${unitId}`,
      providesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }],
    }),
    createUnit: builder.mutation<ApiResponse<UnitDetail>, { propertyId: string; data: CreateUnitDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/units`, method: 'POST', body: data }),
      invalidatesTags: ['Units', 'FloorPlan', 'UnitStats'],
    }),
    bulkCreateUnits: builder.mutation<ApiResponse<BulkCreateResult>, { propertyId: string; data: BulkCreateDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/units/bulk`, method: 'POST', body: data }),
      invalidatesTags: ['Units', 'FloorPlan', 'UnitStats'],
    }),
    checkBulkConflicts: builder.mutation<ApiResponse<{ conflicts: string[] }>, { propertyId: string; unitNumbers: string[] }>({
      query: ({ propertyId, unitNumbers }) => ({
        url: `/properties/${propertyId}/units/check-conflicts`, method: 'POST', body: { unitNumbers },
      }),
    }),
    updateUnit: builder.mutation<ApiResponse<UnitDetail>, { propertyId: string; unitId: string; data: Partial<CreateUnitDto> }>({
      query: ({ propertyId, unitId, data }) => ({ url: `/properties/${propertyId}/units/${unitId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }, 'Units', 'FloorPlan'],
    }),
    deleteUnit: builder.mutation<void, { propertyId: string; unitId: string }>({
      query: ({ propertyId, unitId }) => ({ url: `/properties/${propertyId}/units/${unitId}`, method: 'DELETE' }),
      invalidatesTags: ['Units', 'FloorPlan', 'UnitStats'],
    }),
    updateUnitStatus: builder.mutation<ApiResponse<UnitDetail>, { propertyId: string; unitId: string; status: string; reason?: string }>({
      query: ({ propertyId, unitId, status, reason }) => ({
        url: `/properties/${propertyId}/units/${unitId}/status`, method: 'POST', body: { status, reason },
      }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }, 'Units', 'FloorPlan', 'UnitStats'],
    }),
    setAmenities: builder.mutation<ApiResponse<UnitAmenity[]>, { propertyId: string; unitId: string; amenities: string[] }>({
      query: ({ propertyId, unitId, amenities }) => ({
        url: `/properties/${propertyId}/units/${unitId}/amenities`, method: 'PUT', body: { amenities },
      }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }],
    }),
    uploadFloorPlan: builder.mutation<ApiResponse<UnitDetail>, { propertyId: string; unitId: string; file: File }>({
      query: ({ propertyId, unitId, file }) => {
        const formData = new FormData();
        formData.append('floorPlan', file);
        return {
          url: `/properties/${propertyId}/units/${unitId}/floor-plan`,
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Units', id: unitId }],
    }),

    // Floor plan matrix
    getFloorPlan: builder.query<ApiResponse<FloorPlanMatrix>, { propertyId: string; towerId?: string }>({
      query: ({ propertyId, towerId }) => ({ url: `/properties/${propertyId}/units/floor-plan`, params: { towerId } }),
      providesTags: (_, __, { propertyId }) => [{ type: 'FloorPlan', id: propertyId }],
    }),

    // Unit stats
    getUnitStats: builder.query<ApiResponse<UnitStats>, string>({
      query: (propertyId) => `/properties/${propertyId}/units/stats`,
      providesTags: (_, __, propertyId) => [{ type: 'UnitStats', id: propertyId }],
    }),

    // Meters
    getMeters: builder.query<ApiResponse<UtilityMeter[]>, { propertyId: string; unitId: string }>({
      query: ({ propertyId, unitId }) => `/properties/${propertyId}/units/${unitId}/meters`,
      providesTags: (_, __, { unitId }) => [{ type: 'Meters', id: unitId }],
    }),
    addMeter: builder.mutation<ApiResponse<UtilityMeter>, { propertyId: string; unitId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, unitId, data }) => ({ url: `/properties/${propertyId}/units/${unitId}/meters`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Meters', id: unitId }, { type: 'Units', id: unitId }],
    }),
    updateMeter: builder.mutation<ApiResponse<UtilityMeter>, { propertyId: string; unitId: string; meterId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, unitId, meterId, data }) => ({
        url: `/properties/${propertyId}/units/${unitId}/meters/${meterId}`, method: 'PUT', body: data,
      }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Meters', id: unitId }],
    }),
    deleteMeter: builder.mutation<void, { propertyId: string; unitId: string; meterId: string }>({
      query: ({ propertyId, unitId, meterId }) => ({
        url: `/properties/${propertyId}/units/${unitId}/meters/${meterId}`, method: 'DELETE',
      }),
      invalidatesTags: (_, __, { unitId }) => [{ type: 'Meters', id: unitId }, { type: 'Units', id: unitId }],
    }),
  }),
});

export const {
  useGetUnitTypesQuery,
  useGetTowersQuery,
  useCreateTowerMutation,
  useUpdateTowerMutation,
  useDeleteTowerMutation,
  useAddSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useGetUnitsQuery,
  useGetUnitQuery,
  useCreateUnitMutation,
  useBulkCreateUnitsMutation,
  useCheckBulkConflictsMutation,
  useUpdateUnitMutation,
  useDeleteUnitMutation,
  useUpdateUnitStatusMutation,
  useSetAmenitiesMutation,
  useUploadFloorPlanMutation,
  useGetFloorPlanQuery,
  useGetUnitStatsQuery,
  useGetMetersQuery,
  useAddMeterMutation,
  useUpdateMeterMutation,
  useDeleteMeterMutation,
} = unitsApi;
