import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface ParkingUnitType {
  code: string;
  name: string;
}

export interface ParkingZone {
  id: string;
  propertyId: string;
  unitId: string | null;
  name: string;
  code: string | null;
  zoneType: string;
  isActive: boolean;
  _count: { slots: number };
}

export interface ParkingSlot {
  id: string;
  propertyId: string;
  slotNumber: string;
  slotType: string;
  size: string;
  hasEvCharger: boolean;
  evChargerType: string | null;
  status: string;
  monthlyRate: string | null;
  hourlyRate: string | null;
  notes: string | null;
  isActive: boolean;
  zone: { id: string; name: string; code?: string; zoneType?: string } | null;
}

export interface ParkingAllocation {
  id: string;
  startDate: string;
  endDate: string | null;
  monthlyRate: string;
  billingDay: number;
  status: string;
  notes: string | null;
  createdAt: string;
  slot: { id: string; slotNumber: string; slotType?: string; zone?: { id: string; name: string } | null };
  tenant: { id: string; firstName: string; lastName: string; companyName: string; tenantType: string };
  unit: { id: string; unitNumber: string } | null;
  vehicle: { id: string; plateNumber: string; make: string | null; model: string | null; color: string | null } | null;
  property: { id: string; name: string };
}

export interface TenantVehicle {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  color: string | null;
  vehicleType: string;
  rfidTagNo: string | null;
  isActive: boolean;
}

export interface VisitorPass {
  id: string;
  visitorName: string;
  visitorVehiclePlate: string | null;
  qrToken: string;
  validFrom: string;
  validTo: string;
  maxHours: number;
  actualEntryAt: string | null;
  actualExitAt: string | null;
  status: string;
  createdAt: string;
  slot: { id: string; slotNumber: string } | null;
  issuer: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  issuingUnit: { id: string; unitNumber: string } | null;
  property: { id: string; name: string };
}

export interface RfidEvent {
  id: string;
  propertyId: string;
  rfidTagNo: string;
  vehicleId: string | null;
  eventType: 'entry' | 'exit';
  gateId: string | null;
  eventAt: string;
  isAuthorized: boolean;
  denialReason: string | null;
  vehicle?: {
    plateNumber: string;
    make: string | null;
    model: string | null;
  } | null;
}

export interface OccupancyStats {
  total: number;
  available: number;
  allocated: number;
  visitor: number;
  blocked: number;
  maintenance: number;
  occupancyRate: number;
  byZone: (ParkingZone & { total: number; available?: number; allocated?: number; visitor?: number })[];
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const parkingApi = createApi({
  reducerPath: 'parkingApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['ParkingTypes', 'ParkingZones', 'ParkingSlots', 'Occupancy', 'Allocations', 'Vehicles', 'VisitorPasses'],
  endpoints: (builder) => ({

    // ── Parking types — Unit Type catalog entries (category "parking": Car Park / Bike Park / EV Bay) in use on this property ─
    getParkingTypes: builder.query<ApiResponse<ParkingUnitType[]>, string>({
      query: (propertyId) => `/properties/${propertyId}/parking/types`,
      providesTags: ['ParkingTypes'],
    }),

    // ── Zones ──────────────────────────────
    getZones: builder.query<ApiResponse<ParkingZone[]>, { propertyId: string; unitId?: string }>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/parking/zones`, params }),
      providesTags: ['ParkingZones'],
    }),

    createZone: builder.mutation<ApiResponse<ParkingZone>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/parking/zones`, method: 'POST', body: data }),
      invalidatesTags: ['ParkingZones'],
    }),

    updateZone: builder.mutation<ApiResponse<ParkingZone>, { propertyId: string; id: string; data: Record<string, unknown> }>({
      query: ({ propertyId, id, data }) => ({ url: `/properties/${propertyId}/parking/zones/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['ParkingZones'],
    }),

    // ── Slots ──────────────────────────────
    getSlots: builder.query<PaginatedResponse<ParkingSlot>, {
      propertyId: string; unitId?: string; unitType?: string; zoneId?: string; status?: string; slotType?: string; page?: number; limit?: number;
    }>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/parking/slots`, params }),
      providesTags: ['ParkingSlots'],
    }),

    createSlot: builder.mutation<ApiResponse<ParkingSlot>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/parking/slots`, method: 'POST', body: data }),
      invalidatesTags: ['ParkingSlots', 'Occupancy'],
    }),

    bulkCreateSlots: builder.mutation<ApiResponse<{ created: number; total: number }>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/parking/slots/bulk`, method: 'POST', body: data }),
      invalidatesTags: ['ParkingSlots', 'Occupancy', 'ParkingZones'],
    }),

    updateSlot: builder.mutation<ApiResponse<ParkingSlot>, { propertyId: string; id: string; data: Record<string, unknown> }>({
      query: ({ propertyId, id, data }) => ({ url: `/properties/${propertyId}/parking/slots/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['ParkingSlots', 'Occupancy'],
    }),

    getOccupancy: builder.query<ApiResponse<OccupancyStats>, { propertyId: string; unitId?: string }>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/parking/slots/occupancy`, params }),
      providesTags: ['Occupancy'],
    }),

    // ── Allocations ────────────────────────
    getAllocations: builder.query<PaginatedResponse<ParkingAllocation>, {
      propertyId?: string; tenantId?: string; status?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/parking/allocations', params }),
      providesTags: ['Allocations'],
    }),

    createAllocation: builder.mutation<ApiResponse<ParkingAllocation>, Record<string, unknown>>({
      query: (body) => ({ url: '/parking/allocations', method: 'POST', body }),
      invalidatesTags: ['Allocations', 'ParkingSlots', 'Occupancy'],
    }),

    updateAllocation: builder.mutation<ApiResponse<ParkingAllocation>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/parking/allocations/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Allocations'],
    }),

    cancelAllocation: builder.mutation<void, string>({
      query: (id) => ({ url: `/parking/allocations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Allocations', 'ParkingSlots', 'Occupancy'],
    }),

    // ── Vehicles ───────────────────────────
    getVehicles: builder.query<ApiResponse<TenantVehicle[]>, string>({
      query: (tenantId) => `/tenants/${tenantId}/vehicles`,
      providesTags: (_, __, id) => [{ type: 'Vehicles', id }],
    }),

    addVehicle: builder.mutation<ApiResponse<TenantVehicle>, { tenantId: string; data: Record<string, unknown> }>({
      query: ({ tenantId, data }) => ({ url: `/tenants/${tenantId}/vehicles`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'Vehicles', id: tenantId }],
    }),

    updateVehicle: builder.mutation<ApiResponse<TenantVehicle>, { tenantId: string; vehicleId: string; data: Record<string, unknown> }>({
      query: ({ tenantId, vehicleId, data }) => ({ url: `/tenants/${tenantId}/vehicles/${vehicleId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'Vehicles', id: tenantId }],
    }),

    deactivateVehicle: builder.mutation<void, { tenantId: string; vehicleId: string }>({
      query: ({ tenantId, vehicleId }) => ({ url: `/tenants/${tenantId}/vehicles/${vehicleId}`, method: 'DELETE' }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'Vehicles', id: tenantId }],
    }),

    // ── Visitor Passes ─────────────────────
    getVisitorPasses: builder.query<PaginatedResponse<VisitorPass>, {
      propertyId?: string; status?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/parking/visitor-passes', params }),
      providesTags: ['VisitorPasses'],
    }),

    issueVisitorPass: builder.mutation<ApiResponse<VisitorPass>, { propertyId: string; data: Record<string, unknown> }>({
      query: ({ propertyId, data }) => ({ url: `/parking/visitor-passes?propertyId=${propertyId}`, method: 'POST', body: data }),
      invalidatesTags: ['VisitorPasses', 'ParkingSlots', 'Occupancy'],
    }),

    scanVisitorPass: builder.mutation<ApiResponse<VisitorPass>, string>({
      query: (token) => ({ url: `/parking/visitor-passes/${token}/scan`, method: 'POST' }),
      invalidatesTags: ['VisitorPasses', 'ParkingSlots', 'Occupancy'],
    }),

    cancelVisitorPass: builder.mutation<void, string>({
      query: (id) => ({ url: `/parking/visitor-passes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['VisitorPasses', 'ParkingSlots', 'Occupancy'],
    }),

    // ── RFID Gate Logs ─────────────────────
    getGateLogs: builder.query<PaginatedResponse<RfidEvent>, { propertyId: string; page?: number; limit?: number }>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/parking/rfid/events`, params }),
      providesTags: ['VisitorPasses'], // Can use a new tag if we had one, but it doesn't strictly need one since it auto-polls
    }),
  }),
});

export const {
  useGetParkingTypesQuery,
  useGetZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useGetSlotsQuery,
  useCreateSlotMutation,
  useBulkCreateSlotsMutation,
  useUpdateSlotMutation,
  useGetOccupancyQuery,
  useGetAllocationsQuery,
  useCreateAllocationMutation,
  useUpdateAllocationMutation,
  useCancelAllocationMutation,
  useGetVehiclesQuery,
  useAddVehicleMutation,
  useUpdateVehicleMutation,
  useDeactivateVehicleMutation,
  useGetVisitorPassesQuery,
  useIssueVisitorPassMutation,
  useScanVisitorPassMutation,
  useCancelVisitorPassMutation,
  useGetGateLogsQuery,
} = parkingApi;
