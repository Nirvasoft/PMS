import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    facilityId: z.string().uuid(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    paxCount: z.number().int().min(1).max(200).optional(),
    purpose: z.string().max(255).optional(),
  }),
});

export const cancelBookingSchema = z.object({
  body: z.object({
    reason: z.string().min(1).max(500),
  }),
});

export const updateBookingRulesSchema = z.object({
  body: z.object({
    minDurationMinutes: z.number().int().min(15).max(480).optional(),
    maxDurationMinutes: z.number().int().min(30).max(1440).optional(),
    advanceBookingDays: z.number().int().min(0).max(90).optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    maxBookingsPerDay: z.number().int().min(1).max(10).nullable().optional(),
    maxBookingsPerWeek: z.number().int().min(1).max(50).nullable().optional(),
    cancellationHours: z.number().int().min(0).max(168).optional(),
    isPaid: z.boolean().optional(),
    hourlyRate: z.number().min(0).nullable().optional(),
    flatRate: z.number().min(0).nullable().optional(),
    currency: z.string().length(3).optional(),
    requiresApproval: z.boolean().optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
  }),
});

export const addBlackoutDateSchema = z.object({
  body: z.object({
    blackoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fromTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    toTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    reason: z.string().max(255).optional(),
  }),
});
