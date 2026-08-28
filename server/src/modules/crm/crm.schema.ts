import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid date format',
});

// ── Leads ──────────────────────────────────

export const createLeadSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid().optional(),
    firstName: z.string().min(1, 'First name is required').optional(),
    lastName: z.string().min(1).optional(),
    companyName: z.string().optional(),
    email: z.string().email('Invalid email').optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    unitTypePreference: z.string().optional(),
    minAreaSqft: z.number().positive().optional(),
    maxAreaSqft: z.number().positive().optional(),
    moveInDate: dateString.optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    leaseTermMonths: z.number().min(1).max(120).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    source: z.enum(['website', 'walk_in', 'referral', 'agent', 'portal']).optional(),
    campaignId: z.string().uuid().optional(),
    assignedTo: z.string().uuid().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    loiDetails: z.record(z.any()).optional(),
  }),
});

export const updateLeadSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    companyName: z.string().optional(),
    email: z.string().email('Invalid email').optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    unitTypePreference: z.string().optional(),
    minAreaSqft: z.number().positive().optional(),
    maxAreaSqft: z.number().positive().optional(),
    moveInDate: dateString.optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    leaseTermMonths: z.number().min(1).max(120).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    source: z.string().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    loiDetails: z.record(z.any()).optional(),
  }),
});

export const updateStageSchema = z.object({
  body: z.object({
    stage: z.enum([
      'new', 'contacted', 'viewing_scheduled', 'viewed',
      'offer_sent', 'negotiating', 'lease_signed', 'lost', 'duplicate',
    ]),
    reason: z.string().optional(),
  }),
});

export const convertLeadSchema = z.object({
  body: z.object({
    leaseId: z.string().uuid('Invalid lease ID'),
    tenantId: z.string().uuid('Invalid tenant ID'),
  }),
});

// ── Viewings ───────────────────────────────

export const createViewingSchema = z.object({
  body: z.object({
    unitId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
    scheduledAt: dateString,
    durationMinutes: z.number().min(15).max(240).optional(),
    agentId: z.string().uuid().optional(),
  }),
});

export const updateViewingSchema = z.object({
  body: z.object({
    scheduledAt: dateString.optional(),
    durationMinutes: z.number().min(15).max(240).optional(),
    agentId: z.string().uuid().optional(),
    status: z.enum(['scheduled', 'completed', 'no_show', 'cancelled']).optional(),
  }),
});

export const completeViewingSchema = z.object({
  body: z.object({
    outcome: z.enum(['interested', 'not_interested', 'undecided']),
    agentNotes: z.string().optional(),
  }),
});

// ── Activities ─────────────────────────────

export const createActivitySchema = z.object({
  body: z.object({
    activityType: z.enum(['note', 'call', 'email', 'viewing', 'stage_change']),
    description: z.string().min(1, 'Description is required'),
    metadata: z.record(z.any()).optional(),
  }),
});

// ── Campaigns ──────────────────────────────

export const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Campaign name is required'),
    propertyId: z.string().uuid().optional(),
    channel: z.enum(['facebook', 'google_ads', 'email', 'portal', 'other']).optional(),
    budget: z.number().min(0).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    status: z.enum(['active', 'paused', 'completed']).optional(),
  }),
});

export const updateCampaignSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    propertyId: z.string().uuid().optional(),
    channel: z.string().optional(),
    budget: z.number().min(0).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    status: z.enum(['active', 'paused', 'completed']).optional(),
  }),
});
