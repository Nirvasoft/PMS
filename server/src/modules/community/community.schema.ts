import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    title: z.string().min(1).max(255),
    content: z.string().min(1),
    contentHtml: z.string().optional(),
    category: z.enum(['general', 'maintenance', 'event', 'emergency', 'policy']).optional(),
    priority: z.enum(['normal', 'important', 'urgent']).optional(),
    targetAudience: z.enum(['all', 'unit_type', 'floor_range', 'specific_units']).optional(),
    targetConfig: z.any().optional(),
    isPinned: z.boolean().optional(),
    publishedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    sendPush: z.boolean().optional(),
    sendEmail: z.boolean().optional(),
  }),
});

export const createPollSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    options: z.array(z.object({
      id: z.string(),
      text: z.string().min(1),
    })).min(2).max(10),
    pollType: z.enum(['single', 'multiple']).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    isAnonymous: z.boolean().optional(),
  }),
});

export const votePollSchema = z.object({
  body: z.object({
    optionIds: z.array(z.string()).min(1),
  }),
});

export const submitComplaintSchema = z.object({
  body: z.object({
    category: z.enum(['noise', 'cleanliness', 'neighbor', 'management', 'facility', 'other']),
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    isAnonymous: z.boolean().optional(),
  }),
});

export const respondComplaintSchema = z.object({
  body: z.object({
    response: z.string().min(1),
  }),
});

export const rateComplaintSchema = z.object({
  body: z.object({
    satisfactionScore: z.number().int().min(1).max(5),
  }),
});

export const submitMoveRequestSchema = z.object({
  body: z.object({
    requestType: z.enum(['move_in', 'move_out']),
    requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    depositAmount: z.number().min(0).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const approveMoveRequestSchema = z.object({
  body: z.object({
    inspectionAt: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
  }),
});
