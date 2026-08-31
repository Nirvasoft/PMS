import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

// ─── Types ───────────────────────────────────

export interface LeadListItem {
  id: string;
  leadNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  stage: string;
  priority: string;
  source: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  moveInDate: string | null;
  unitTypePreference: string | null;
  leaseTermMonths: number | null;
  tags: string[];
  isBlacklisted: boolean;
  blacklistedAt: string | null;
  blacklistReason: string | null;
  createdAt: string;
  property: { id: string; name: string } | null;
  agent: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  campaign: { id: string; name: string } | null;
  convertedLease: { id: string; leaseNumber: string } | null;
}

export interface LeadDetail extends LeadListItem {
  notes: string | null;
  lostReason: string | null;
  lostAt: string | null;
  convertedAt: string | null;
  viewings: LeadViewing[];
  activities: LeadActivityItem[];
  convertedLease: { id: string; leaseNumber: string; status: string } | null;
  convertedTenant: { id: string; firstName: string; lastName: string; companyName: string } | null;
}

export interface LeadViewing {
  id: string;
  leadId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  outcome: string | null;
  agentNotes: string | null;
  calendarEventId: string | null;
  createdAt: string;
  unit: { id: string; unitNumber: string; unitType?: string } | null;
  agent: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
  property?: { id: string; name: string } | null;
}

export interface LeadActivityItem {
  id: string;
  activityType: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  performer: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
}

export interface PipelineStage {
  stage: string;
  count: number;
  leads: (LeadListItem & { displayName: string })[];
}

export interface LeadStats {
  totalActive: number;
  totalThisMonth: number;
  conversionRate: number;
  avgDaysToConvert: number;
  bySource: Record<string, number>;
  byAgent: { agentId: string; name: string; open: number }[];
}

export interface CampaignItem {
  id: string;
  name: string;
  channel: string | null;
  budget: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: string;
  createdAt: string;
  property: { id: string; name: string } | null;
  creator: { id: string; email: string; profile: { firstName: string; lastName: string } | null } | null;
}

export interface CampaignROI {
  campaignId: string;
  name: string;
  budget: number;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  roi: number;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> {
  success: boolean; data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const crmApi = createApi({
  reducerPath: 'crmApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Leads', 'LeadDetail', 'Pipeline', 'LeadStats', 'Viewings', 'Activities', 'Campaigns', 'CalendarStatus'],
  endpoints: (builder) => ({

    getLeads: builder.query<PaginatedResponse<LeadListItem>, {
      propertyId?: string; stage?: string; assignedTo?: string;
      source?: string; priority?: string; search?: string; page?: number; limit?: number;
    }>({
      query: (params) => ({ url: '/leads', params }),
      providesTags: ['Leads'],
    }),

    getLead: builder.query<ApiResponse<LeadDetail>, string>({
      query: (id) => `/leads/${id}`,
      providesTags: (_, __, id) => [{ type: 'LeadDetail', id }],
    }),

    createLead: builder.mutation<ApiResponse<LeadListItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/leads', method: 'POST', body }),
      invalidatesTags: ['Leads', 'Pipeline', 'LeadStats'],
    }),

    updateLead: builder.mutation<ApiResponse<LeadListItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/leads/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'LeadDetail', id }, 'Leads'],
    }),

    deleteLead: builder.mutation<void, string>({
      query: (id) => ({ url: `/leads/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Leads', 'Pipeline', 'LeadStats'],
    }),

    updateLeadStage: builder.mutation<ApiResponse<LeadDetail>, { id: string; stage: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/stage`, method: 'PUT', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'LeadDetail', id }, 'Leads', 'Pipeline', 'LeadStats'],
    }),

    convertLead: builder.mutation<ApiResponse<LeadDetail>, { id: string; leaseId?: string; tenantId: string }>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/convert`, method: 'POST', body }),
      invalidatesTags: ['Leads', 'Pipeline', 'LeadStats'],
    }),

    blacklistLead: builder.mutation<ApiResponse<LeadListItem>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/leads/${id}/blacklist`, method: 'POST', body: { reason } }),
      invalidatesTags: (_, __, { id }) => [{ type: 'LeadDetail', id }, 'Leads', 'Pipeline', 'LeadStats'],
    }),

    unblacklistLead: builder.mutation<ApiResponse<LeadListItem>, string>({
      query: (id) => ({ url: `/leads/${id}/unblacklist`, method: 'POST' }),
      invalidatesTags: ['Leads', 'Pipeline', 'LeadStats'],
    }),

    getPipeline: builder.query<ApiResponse<{ stages: PipelineStage[] }>, { propertyId?: string }>({
      query: (params) => ({ url: '/leads/pipeline', params }),
      providesTags: ['Pipeline'],
    }),

    getLeadStats: builder.query<ApiResponse<LeadStats>, { propertyId?: string }>({
      query: (params) => ({ url: '/leads/stats', params }),
      providesTags: ['LeadStats'],
    }),

    // Viewings
    getViewings: builder.query<ApiResponse<LeadViewing[]>, string>({
      query: (leadId) => `/leads/${leadId}/viewings`,
      providesTags: (_, __, id) => [{ type: 'Viewings', id }],
    }),

    scheduleViewing: builder.mutation<ApiResponse<LeadViewing>, { leadId: string; data: Record<string, unknown> }>({
      query: ({ leadId, data }) => ({ url: `/leads/${leadId}/viewings`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leadId }) => [{ type: 'Viewings', id: leadId }, { type: 'LeadDetail', id: leadId }, 'Pipeline'],
    }),

    completeViewing: builder.mutation<ApiResponse<LeadViewing>, { leadId: string; viewingId: string; data: Record<string, unknown> }>({
      query: ({ leadId, viewingId, data }) => ({ url: `/leads/${leadId}/viewings/${viewingId}/complete`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leadId }) => [{ type: 'Viewings', id: leadId }, { type: 'LeadDetail', id: leadId }, 'Pipeline'],
    }),

    rescheduleViewing: builder.mutation<ApiResponse<LeadViewing>, { leadId: string; viewingId: string; data: Record<string, unknown> }>({
      query: ({ leadId, viewingId, data }) => ({ url: `/leads/${leadId}/viewings/${viewingId}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { leadId }) => [{ type: 'Viewings', id: leadId }, { type: 'LeadDetail', id: leadId }, 'Pipeline'],
    }),

    // Activities
    getActivities: builder.query<ApiResponse<LeadActivityItem[]>, string>({
      query: (leadId) => `/leads/${leadId}/activities`,
      providesTags: (_, __, id) => [{ type: 'Activities', id }],
    }),

    createActivity: builder.mutation<ApiResponse<LeadActivityItem>, { leadId: string; data: Record<string, unknown> }>({
      query: ({ leadId, data }) => ({ url: `/leads/${leadId}/activities`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leadId }) => [{ type: 'Activities', id: leadId }],
    }),

    // Campaigns
    getCampaigns: builder.query<PaginatedResponse<CampaignItem>, { propertyId?: string; status?: string; page?: number; limit?: number }>({
      query: (params) => ({ url: '/marketing-campaigns', params }),
      providesTags: ['Campaigns'],
    }),

    createCampaign: builder.mutation<ApiResponse<CampaignItem>, Record<string, unknown>>({
      query: (body) => ({ url: '/marketing-campaigns', method: 'POST', body }),
      invalidatesTags: ['Campaigns'],
    }),

    updateCampaign: builder.mutation<ApiResponse<CampaignItem>, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/marketing-campaigns/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Campaigns'],
    }),

    getCampaignROI: builder.query<ApiResponse<CampaignROI>, string>({
      query: (id) => `/marketing-campaigns/${id}/roi`,
    }),

    deleteCampaign: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({ url: `/marketing-campaigns/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Campaigns'],
    }),

    // ── Google Calendar Integration ──

    getCalendarStatus: builder.query<ApiResponse<{
      connected: boolean;
      configured: boolean;
      email?: string;
      connectedAt?: string;
    }>, void>({
      query: () => '/crm/google-calendar/status',
      providesTags: ['CalendarStatus'],
    }),

    getCalendarAuthUrl: builder.query<ApiResponse<{ url: string }>, void>({
      query: () => '/crm/google-calendar/auth-url',
    }),

    disconnectCalendar: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: '/crm/google-calendar/disconnect', method: 'DELETE' }),
      invalidatesTags: ['CalendarStatus'],
    }),
  }),
});

export const {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useUpdateLeadStageMutation,
  useConvertLeadMutation,
  useGetPipelineQuery,
  useGetLeadStatsQuery,
  useGetViewingsQuery,
  useScheduleViewingMutation,
  useCompleteViewingMutation,
  useRescheduleViewingMutation,
  useGetActivitiesQuery,
  useCreateActivityMutation,
  useGetCampaignsQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useGetCampaignROIQuery,
  useDeleteCampaignMutation,
  useGetCalendarStatusQuery,
  useGetCalendarAuthUrlQuery,
  useDisconnectCalendarMutation,
  useBlacklistLeadMutation,
  useUnblacklistLeadMutation,
} = crmApi;
