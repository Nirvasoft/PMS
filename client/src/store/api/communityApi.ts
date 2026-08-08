import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

interface Announcement {
  id: string;
  title: string;
  content: string;
  preview: string;
  category: string;
  priority: string;
  isPinned: boolean;
  publishedAt: string;
  expiresAt?: string;
  isRead: boolean;
  viewCount: number;
  attachments: any[];
}

interface Poll {
  id: string;
  title: string;
  description?: string;
  options: { id: string; text: string; voteCount: number }[];
  pollType: string;
  startAt: string;
  endAt: string;
  isAnonymous: boolean;
  userVote: string[] | null;
  totalVotes: number;
  isEnded: boolean;
  canViewResults: boolean;
}

interface Complaint {
  id: string;
  category: string;
  title: string;
  description: string;
  isAnonymous: boolean;
  status: string;
  response?: string;
  respondedAt?: string;
  satisfactionScore?: number;
  createdAt: string;
}

interface MoveRequest {
  id: string;
  requestType: string;
  requestedDate: string;
  preferredTime?: string;
  depositAmount?: number;
  depositPaid: boolean;
  status: string;
  notes?: string;
  approvedAt?: string;
  inspectionAt?: string;
  createdAt: string;
}

export const communityApi = createApi({
  reducerPath: 'communityApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-Requested-With', 'XMLHttpRequest');
      return headers;
    },
  }),
  tagTypes: ['Announcements', 'Polls', 'Complaints', 'MoveRequests'],
  endpoints: (builder) => ({
    // ── Announcements ──────────────────────────
    getAnnouncements: builder.query<
      { data: Announcement[]; meta: { total: number } },
      { category?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/portal/community/announcements', params: params || {} }),
      providesTags: ['Announcements'],
    }),
    getAnnouncementById: builder.query<Announcement, string>({
      query: (id) => `/portal/community/announcements/${id}`,
      transformResponse: (res: any) => res.data,
    }),
    markAnnouncementRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/portal/community/announcements/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Announcements'],
    }),

    // ── Polls ──────────────────────────────────
    getPolls: builder.query<Poll[], void>({
      query: () => '/portal/community/polls',
      transformResponse: (res: any) => res.data,
      providesTags: ['Polls'],
    }),
    votePoll: builder.mutation<void, { pollId: string; optionIds: string[] }>({
      query: ({ pollId, optionIds }) => ({
        url: `/portal/community/polls/${pollId}/vote`,
        method: 'POST',
        body: { optionIds },
      }),
      invalidatesTags: ['Polls'],
    }),
    getPollResults: builder.query<any, string>({
      query: (id) => `/portal/community/polls/${id}/results`,
      transformResponse: (res: any) => res.data,
    }),

    // ── Complaints ─────────────────────────────
    getComplaints: builder.query<Complaint[], void>({
      query: () => '/portal/community/complaints',
      transformResponse: (res: any) => res.data,
      providesTags: ['Complaints'],
    }),
    submitComplaint: builder.mutation<Complaint, {
      category: string;
      title: string;
      description: string;
      isAnonymous?: boolean;
    }>({
      query: (body) => ({ url: '/portal/community/complaints', method: 'POST', body }),
      invalidatesTags: ['Complaints'],
    }),
    rateComplaint: builder.mutation<void, { id: string; satisfactionScore: number }>({
      query: ({ id, satisfactionScore }) => ({
        url: `/portal/community/complaints/${id}/rate`,
        method: 'POST',
        body: { satisfactionScore },
      }),
      invalidatesTags: ['Complaints'],
    }),

    // ── Move Requests ──────────────────────────
    getMoveRequests: builder.query<MoveRequest[], void>({
      query: () => '/portal/community/move-requests',
      transformResponse: (res: any) => res.data,
      providesTags: ['MoveRequests'],
    }),
    submitMoveRequest: builder.mutation<MoveRequest, {
      requestType: string;
      requestedDate: string;
      preferredTime?: string;
      depositAmount?: number;
      notes?: string;
    }>({
      query: (body) => ({ url: '/portal/community/move-requests', method: 'POST', body }),
      invalidatesTags: ['MoveRequests'],
    }),

    // ══════════════════════════════════════════════
    //  ADMIN ENDPOINTS
    // ══════════════════════════════════════════════

    // ── Admin Announcements ──────────────────────
    getAdminAnnouncements: builder.query<
      { data: any[]; meta: { total: number; page: number; limit: number } },
      { propertyId?: string; status?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/admin/community/announcements', params: params || {} }),
      providesTags: ['Announcements'],
    }),
    createAnnouncement: builder.mutation<any, {
      propertyId: string;
      title: string;
      content: string;
      category?: string;
      priority?: string;
      targetAudience?: string;
      isPinned?: boolean;
      publishedAt?: string;
      expiresAt?: string;
      sendPush?: boolean;
      sendEmail?: boolean;
    }>({
      query: (body) => ({ url: '/admin/community/announcements', method: 'POST', body }),
      invalidatesTags: ['Announcements'],
    }),

    // ── Admin Polls ──────────────────────────────
    getAdminPolls: builder.query<
      { data: any[]; meta: { total: number; page: number; limit: number } },
      { propertyId?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/admin/community/polls', params: params || {} }),
      providesTags: ['Polls'],
    }),
    createPoll: builder.mutation<any, {
      propertyId: string;
      title: string;
      description?: string;
      options: { id: string; text: string }[];
      pollType?: string;
      startAt: string;
      endAt: string;
      isAnonymous?: boolean;
    }>({
      query: (body) => ({ url: '/admin/community/polls', method: 'POST', body }),
      invalidatesTags: ['Polls'],
    }),

    // ── Admin Complaints ────────────────────────
    getAdminComplaints: builder.query<
      { data: any[]; meta: { total: number; page: number; limit: number } },
      { propertyId?: string; status?: string; page?: number } | void
    >({
      query: (params) => ({ url: '/admin/community/complaints', params: params || {} }),
      providesTags: ['Complaints'],
    }),
    respondToComplaint: builder.mutation<any, { id: string; response: string }>({
      query: ({ id, response }) => ({
        url: `/admin/community/complaints/${id}/respond`,
        method: 'POST',
        body: { response },
      }),
      invalidatesTags: ['Complaints'],
    }),

    // ── Admin Move Requests ─────────────────────
    getAdminMoveRequests: builder.query<any[], { propertyId?: string; status?: string; type?: string } | void>({
      query: (params) => ({ url: '/admin/community/move-requests', params: params || {} }),
      transformResponse: (res: any) => res.data,
      providesTags: ['MoveRequests'],
    }),
    approveMoveRequest: builder.mutation<any, { id: string; inspectionAt?: string; notes?: string }>({
      query: ({ id, ...body }) => ({
        url: `/admin/community/move-requests/${id}/approve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MoveRequests'],
    }),
  }),
});

export const {
  useGetAnnouncementsQuery,
  useGetAnnouncementByIdQuery,
  useMarkAnnouncementReadMutation,
  useGetPollsQuery,
  useVotePollMutation,
  useGetPollResultsQuery,
  useGetComplaintsQuery,
  useSubmitComplaintMutation,
  useRateComplaintMutation,
  useGetMoveRequestsQuery,
  useSubmitMoveRequestMutation,
  // Admin hooks
  useGetAdminAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useGetAdminPollsQuery,
  useCreatePollMutation,
  useGetAdminComplaintsQuery,
  useRespondToComplaintMutation,
  useGetAdminMoveRequestsQuery,
  useApproveMoveRequestMutation,
} = communityApi;

