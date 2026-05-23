import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

interface Facility {
  id: string;
  name: string | null;
  description: string | null;
  capacity: number | null;
  operatingHours: any;
  isBookable: boolean;
  facilityType: { name: string; icon: string | null; category: string };
  bookingRule: any | null;
}

interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface FacilityBooking {
  id: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  paxCount: number;
  purpose?: string;
  status: string;
  isPaidBooking: boolean;
  chargeAmount?: number;
  currency?: string;
  createdAt: string;
  facility?: { name: string | null };
}

export const bookingsApi = createApi({
  reducerPath: 'bookingsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('token');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Bookings', 'Availability', 'Facilities'],
  endpoints: (builder) => ({
    getBookableFacilities: builder.query<Facility[], void>({
      query: () => '/portal/bookings/facilities',
      transformResponse: (res: any) => res.data,
      providesTags: ['Facilities'],
    }),
    getAvailability: builder.query<
      { facilityName: string; date: string; operatingHours: string; rules: any; slots: AvailabilitySlot[] },
      { facilityId: string; date: string }
    >({
      query: ({ facilityId, date }) => ({
        url: `/facilities/${facilityId}/availability`,
        params: { date },
      }),
      transformResponse: (res: any) => res.data,
      providesTags: (_, __, { facilityId, date }) => [{ type: 'Availability', id: `${facilityId}-${date}` }],
    }),
    createBooking: builder.mutation<FacilityBooking, {
      facilityId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      paxCount?: number;
      purpose?: string;
    }>({
      query: (body) => ({ url: '/portal/bookings', method: 'POST', body }),
      invalidatesTags: ['Bookings', 'Availability'],
    }),
    getMyBookings: builder.query<
      { data: FacilityBooking[]; meta: { total: number; page: number; limit: number } },
      { upcoming?: boolean; page?: number } | void
    >({
      query: (params) => ({ url: '/portal/bookings', params: params || {} }),
      providesTags: ['Bookings'],
    }),
    cancelBooking: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/portal/bookings/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Bookings', 'Availability'],
    }),
  }),
});

export const {
  useGetBookableFacilitiesQuery,
  useGetAvailabilityQuery,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useCancelBookingMutation,
} = bookingsApi;
