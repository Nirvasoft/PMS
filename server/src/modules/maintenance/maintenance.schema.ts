import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid date format',
});

// Helper for optional UUIDs that gracefully handles empty strings, null, and undefined
const optionalUuid = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.string().uuid().optional(),
);

// ── Tickets ────────────────────────────────

export const createTicketSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    unitId: optionalUuid,
    title: z.string().min(1, 'Title is required').max(500),
    description: z.string().optional(),
    categoryId: z.string().uuid(),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    source: z.enum(['tenant', 'staff', 'preventive', 'inspection', 'system']).optional(),
    reportedByTenantId: optionalUuid,
    locationDetail: z.string().max(255).optional(),
    isUrgent: z.boolean().optional(),
    requiresAccess: z.boolean().optional(),
    estimatedCost: z.number().min(0).optional(),
  }),
});

export const updateTicketSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    categoryId: optionalUuid,
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    locationDetail: z.string().max(255).optional(),
    isUrgent: z.boolean().optional(),
    requiresAccess: z.boolean().optional(),
    accessGranted: z.boolean().optional(),
    estimatedCost: z.number().min(0).optional(),
  }),
});

export const assignTicketSchema = z.object({
  body: z.object({
    technicianId: z.string().uuid(),
    scheduledStart: dateString,
    notes: z.string().optional(),
  }),
});

export const escalateTicketSchema = z.object({
  body: z.object({
    escalateTo: optionalUuid,
    reason: z.string().min(1, 'Escalation reason is required'),
  }),
});

export const cancelTicketSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Cancellation reason is required'),
  }),
});

export const rateTicketSchema = z.object({
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
  }),
});

// ── Work Orders ────────────────────────────

export const startWorkOrderSchema = z.object({
  body: z.object({
    notes: z.string().optional(),
  }),
});

export const completeWorkOrderSchema = z.object({
  body: z.object({
    completionNotes: z.string().optional(),
    actualHours: z.number().min(0).optional(),
    checklist: z.array(z.object({
      item: z.string(),
      checked: z.boolean(),
      notes: z.string().optional(),
    })).optional(),
    materialsUsed: z.array(z.object({
      itemName: z.string().min(1),
      quantity: z.number().min(0.0001),
      unitCost: z.number().min(0),
      inventoryItemId: optionalUuid,
      issuedFromStock: z.boolean().optional(),
    })).optional(),
  }),
});

export const onHoldWorkOrderSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reason is required'),
  }),
});

export const updateWorkOrderSchema = z.object({
  body: z.object({
    scheduledStart: dateString.optional(),
    scheduledEnd: dateString.optional(),
    estimatedHours: z.number().min(0).optional(),
    description: z.string().optional(),
    checklist: z.array(z.object({
      item: z.string(),
      checked: z.boolean(),
      notes: z.string().optional(),
    })).optional(),
  }),
});

// ── Technicians ────────────────────────────

export const upsertTechnicianProfileSchema = z.object({
  body: z.object({
    propertyId: optionalUuid,
    skills: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    hourlyRate: z.number().min(0).optional(),
    isAvailable: z.boolean().optional(),
    workingHours: z.record(z.string().nullable()).optional(),
    maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
  }),
});

// ── Categories ─────────────────────────────

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(150),
    icon: z.string().max(50).optional(),
    description: z.string().max(500).optional(),
    parentId: optionalUuid,
    sortOrder: z.number().int().min(0).optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(150).optional(),
    icon: z.string().max(50).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    parentId: optionalUuid,
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── SLA Config ─────────────────────────────

export const createSlaConfigSchema = z.object({
  body: z.object({
    propertyId: optionalUuid,
    categoryId: optionalUuid,
    priority: z.enum(['P1', 'P2', 'P3', 'P4']),
    responseHours: z.number().int().min(1),
    resolutionHours: z.number().int().min(1),
    workingHoursOnly: z.boolean().optional(),
    escalationContactId: optionalUuid,
  }),
});

export const updateSlaConfigSchema = z.object({
  body: z.object({
    propertyId: optionalUuid,
    categoryId: optionalUuid,
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    responseHours: z.number().int().min(1).optional(),
    resolutionHours: z.number().int().min(1).optional(),
    workingHoursOnly: z.boolean().optional(),
    escalationContactId: optionalUuid,
  }),
});

// ── Photos ─────────────────────────────────

export const uploadPhotosSchema = z.object({
  body: z.object({
    photoType: z.enum(['before', 'during', 'after']).optional(),
    caption: z.string().max(255).optional(),
  }),
});
