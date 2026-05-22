import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  category: { id: string; name: string; icon: string | null };
  priority: string;
  status: string;
  source: string;
  unit: { id: string; unitNumber: string } | null;
  property: { id: string; name: string };
  assignedTo: {
    id: string; email: string;
    profile: { firstName: string; lastName: string } | null;
  } | null;
  slaResolveDueAt: string | null;
  slaStatus: 'on_track' | 'at_risk' | 'breached' | 'met' | null;
  hoursUntilSla: number | null;
  rating: number | null;
  isUrgent: boolean;
  createdAt: string;
  _count: { workOrders: number; photos: number };
}

export interface TicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  category: { id: string; name: string; icon: string | null };
  priority: string;
  status: string;
  source: string;
  unit: { id: string; unitNumber: string } | null;
  property: { id: string; name: string };
  reportedByTenant: { id: string; firstName: string; lastName: string; companyName: string | null } | null;
  reportedByUser: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  assignedTo: {
    id: string; email: string;
    profile: { firstName: string; lastName: string } | null;
    technicianProfile: { skills: string[]; hourlyRate: string | null } | null;
  } | null;
  escalatedTo: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  slaResponseDueAt: string | null;
  slaResolveDueAt: string | null;
  slaResponseMet: boolean | null;
  slaResolveMet: boolean | null;
  firstResponseAt: string | null;
  escalationLevel: number;
  locationDetail: string | null;
  isUrgent: boolean;
  requiresAccess: boolean;
  accessGranted: boolean | null;
  estimatedCost: string | null;
  actualCost: string | null;
  rating: number | null;
  ratingComment: string | null;
  ratedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  photos: TicketPhoto[];
  workOrders: WorkOrderDetail[];
  slaBreachEvents: SlaBreachEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketPhoto {
  id: string;
  url: string;
  photoType: string;
  caption: string | null;
  createdAt: string;
}

export interface WorkOrderDetail {
  id: string;
  woNumber: string;
  title: string;
  description: string | null;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  estimatedHours: string | null;
  actualHours: string | null;
  laborRate: string | null;
  laborCost: string | null;
  materialsCost: string;
  totalCost: string;
  completionNotes: string | null;
  checklist: Array<{ item: string; checked: boolean; notes?: string }>;
  onHoldReason: string | null;
  assignedTo: {
    id: string; email: string;
    profile: { firstName: string; lastName: string } | null;
  };
  materials: WorkOrderMaterial[];
  createdAt: string;
}

export interface WorkOrderMaterial {
  id: string;
  itemName: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  issuedFromStock: boolean;
  createdAt: string;
}

export interface SlaBreachEvent {
  id: string;
  breachType: string;
  breachedAt: string;
}

export interface TechnicianItem {
  userId: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  phone: string | null;
  skills: string[];
  certifications: string[];
  hourlyRate: number;
  isAvailable: boolean;
  maxConcurrentJobs: number;
  workingHours: Record<string, string | null>;
  propertyId: string | null;
  openJobs: number;
  todaySchedule: Array<{
    woId: string; woNumber: string; title: string;
    from: string | null; to: string | null; status: string;
  }>;
}

export interface TechScheduleEvent {
  id: string;
  woNumber: string;
  title: string;
  status: string;
  ticketNumber: string;
  priority: string;
  category: string;
  categoryIcon: string | null;
  unitNumber: string | null;
  propertyName: string | null;
  start: string | null;
  end: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface MaintenanceCategory {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  children: MaintenanceCategory[];
}

export interface MaintenanceStats {
  ticketSummary: {
    total: number; open: number; assigned: number; inProgress: number;
    pendingParts: number; completed: number; cancelled: number; closed: number; overdue: number;
  };
  slaCompliance: { responseRate: number; resolutionRate: number; totalBreaches: number };
  avgResolutionHours: number;
  avgRating: number | null;
  byPriority: Record<string, number>;
  byCategory: Array<{ category: string; count: number; pct: number }>;
  totalCost: number;
}

export interface SlaConfigItem {
  id: string;
  propertyId: string | null;
  categoryId: string | null;
  priority: string;
  responseHours: number;
  resolutionHours: number;
  workingHoursOnly: boolean;
  escalationContactId: string | null;
  category: { id: string; name: string; icon: string | null } | null;
  escalationContact: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const maintenanceApi = createApi({
  reducerPath: 'maintenanceApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Tickets', 'TicketDetail', 'WorkOrders', 'WoDetail', 'Technicians', 'MaintenanceStats', 'Categories', 'SlaConfigs'],
  endpoints: (builder) => ({

    // ── Tickets ──────────────────────────
    getTickets: builder.query<PaginatedResponse<TicketListItem>, {
      propertyId?: string; status?: string; priority?: string; categoryId?: string;
      assignedTo?: string; source?: string; search?: string;
      from?: string; to?: string; page?: number; limit?: number;
      sort?: string; order?: string;
    }>({
      query: (params) => ({ url: '/maintenance/tickets', params }),
      providesTags: ['Tickets'],
    }),

    getTicket: builder.query<ApiResponse<TicketDetail>, string>({
      query: (id) => `/maintenance/tickets/${id}`,
      providesTags: (_, __, id) => [{ type: 'TicketDetail', id }],
    }),

    createTicket: builder.mutation<ApiResponse<TicketListItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/maintenance/tickets', method: 'POST', body }),
      invalidatesTags: ['Tickets', 'MaintenanceStats'],
    }),

    updateTicket: builder.mutation<ApiResponse<TicketDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'TicketDetail', id }, 'Tickets'],
    }),

    assignTicket: builder.mutation<ApiResponse<TicketDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}/assign`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'TicketDetail', id }, 'Tickets', 'WorkOrders', 'Technicians'],
    }),

    autoAssignTicket: builder.mutation<ApiResponse<TicketDetail>, string>({
      query: (id) => ({ url: `/maintenance/tickets/${id}/auto-assign`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'TicketDetail', id }, 'Tickets', 'WorkOrders', 'Technicians'],
    }),

    escalateTicket: builder.mutation<ApiResponse<TicketDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}/escalate`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'TicketDetail', id }, 'Tickets'],
    }),

    cancelTicket: builder.mutation<ApiResponse<unknown>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/maintenance/tickets/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Tickets', 'MaintenanceStats'],
    }),

    rateTicket: builder.mutation<ApiResponse<unknown>, { id: string; rating: number; comment?: string }>({
      query: ({ id, ...body }) => ({ url: `/maintenance/tickets/${id}/rate`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'TicketDetail', id }, 'Tickets', 'MaintenanceStats'],
    }),

    // ── Work Orders ─────────────────────
    getWorkOrders: builder.query<PaginatedResponse<WorkOrderDetail>, {
      assignedTo?: string; status?: string; propertyId?: string;
      scheduledFrom?: string; scheduledTo?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/maintenance/work-orders', params }),
      providesTags: ['WorkOrders'],
    }),

    getWorkOrder: builder.query<ApiResponse<WorkOrderDetail>, string>({
      query: (id) => `/maintenance/work-orders/${id}`,
      providesTags: (_, __, id) => [{ type: 'WoDetail', id }],
    }),

    updateWorkOrder: builder.mutation<ApiResponse<WorkOrderDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/maintenance/work-orders/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'WoDetail', id }, 'WorkOrders'],
    }),

    startWorkOrder: builder.mutation<ApiResponse<unknown>, { id: string; notes?: string }>({
      query: ({ id, notes }) => ({ url: `/maintenance/work-orders/${id}/start`, method: 'POST', body: { notes } }),
      invalidatesTags: ['WorkOrders', 'Tickets'],
    }),

    completeWorkOrder: builder.mutation<ApiResponse<WorkOrderDetail>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/maintenance/work-orders/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['WorkOrders', 'Tickets', 'MaintenanceStats'],
    }),

    onHoldWorkOrder: builder.mutation<ApiResponse<unknown>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/maintenance/work-orders/${id}/on-hold`, method: 'POST', body: { reason } }),
      invalidatesTags: ['WorkOrders', 'Tickets'],
    }),

    resumeWorkOrder: builder.mutation<ApiResponse<unknown>, string>({
      query: (id) => ({ url: `/maintenance/work-orders/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['WorkOrders', 'Tickets'],
    }),

    // ── Technicians ─────────────────────
    getTechnicians: builder.query<ApiResponse<TechnicianItem[]>, { propertyId?: string; skill?: string; isAvailable?: string }>({
      query: (params) => ({ url: '/maintenance/technicians', params }),
      providesTags: ['Technicians'],
    }),

    getTechSchedule: builder.query<ApiResponse<TechScheduleEvent[]>, { userId: string; from: string; to: string }>({
      query: ({ userId, ...params }) => ({ url: `/maintenance/technicians/${userId}/schedule`, params }),
    }),

    upsertTechProfile: builder.mutation<ApiResponse<unknown>, { userId: string; data: Record<string, unknown> }>({
      query: ({ userId, data }) => ({ url: `/maintenance/technicians/${userId}/profile`, method: 'PUT', body: data }),
      invalidatesTags: ['Technicians'],
    }),

    // ── Categories ──────────────────────
    getCategories: builder.query<ApiResponse<MaintenanceCategory[]>, void>({
      query: () => '/maintenance/categories',
      providesTags: ['Categories'],
    }),

    // ── Stats ───────────────────────────
    getMaintenanceStats: builder.query<ApiResponse<MaintenanceStats>, { propertyId?: string; from?: string; to?: string }>({
      query: (params) => ({ url: '/maintenance/stats', params }),
      providesTags: ['MaintenanceStats'],
    }),

    // ── SLA Configs ─────────────────────
    getSlaConfigs: builder.query<ApiResponse<SlaConfigItem[]>, void>({
      query: () => '/maintenance/sla-configs',
      providesTags: ['SlaConfigs'],
    }),

    createSlaConfig: builder.mutation<ApiResponse<SlaConfigItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/maintenance/sla-configs', method: 'POST', body }),
      invalidatesTags: ['SlaConfigs'],
    }),
  }),
});

export const {
  useGetTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useUpdateTicketMutation,
  useAssignTicketMutation,
  useAutoAssignTicketMutation,
  useEscalateTicketMutation,
  useCancelTicketMutation,
  useRateTicketMutation,
  useGetWorkOrdersQuery,
  useGetWorkOrderQuery,
  useUpdateWorkOrderMutation,
  useStartWorkOrderMutation,
  useCompleteWorkOrderMutation,
  useOnHoldWorkOrderMutation,
  useResumeWorkOrderMutation,
  useGetTechniciansQuery,
  useGetTechScheduleQuery,
  useUpsertTechProfileMutation,
  useGetCategoriesQuery,
  useGetMaintenanceStatsQuery,
  useGetSlaConfigsQuery,
  useCreateSlaConfigMutation,
} = maintenanceApi;
