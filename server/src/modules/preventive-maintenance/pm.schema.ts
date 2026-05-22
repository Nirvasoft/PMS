import { z } from 'zod';

export const createPmScheduleSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    frequencyType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom_days']),
    frequencyValue: z.number().int().min(1).default(1),
    customDays: z.number().int().min(1).optional(),
    estimatedHours: z.number().min(0).default(1),
    assignedToId: z.string().uuid().optional(),
    assignedRole: z.string().max(100).optional(),
    nextDueDate: z.string(), // ISO date string
    advanceDays: z.number().int().min(0).max(365).default(7),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).default('P3'),
    notes: z.string().optional(),
    checklistTemplate: z.array(z.object({
      item: z.string().min(1),
      isRequired: z.boolean().default(false),
      notes: z.string().optional(),
    })).default([]),
  }),
});

export const updatePmScheduleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    categoryId: z.string().uuid().optional().nullable(),
    frequencyType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom_days']).optional(),
    frequencyValue: z.number().int().min(1).optional(),
    customDays: z.number().int().min(1).optional().nullable(),
    estimatedHours: z.number().min(0).optional(),
    assignedToId: z.string().uuid().optional().nullable(),
    assignedRole: z.string().max(100).optional().nullable(),
    nextDueDate: z.string().optional(),
    advanceDays: z.number().int().min(0).max(365).optional(),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    notes: z.string().optional().nullable(),
    checklistTemplate: z.array(z.object({
      item: z.string().min(1),
      isRequired: z.boolean().default(false),
      notes: z.string().optional(),
    })).optional(),
  }),
});

export const completePmWorkOrderSchema = z.object({
  body: z.object({
    checklistResults: z.array(z.object({
      item: z.string(),
      checked: z.boolean(),
      notes: z.string().optional(),
    })).default([]),
    findings: z.string().optional(),
    severity: z.enum(['none', 'monitoring', 'requires_repair', 'critical']).default('none'),
  }),
});
