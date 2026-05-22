import { z } from 'zod';

export const createZoneSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(150),
    zoneType: z.enum(['corridor', 'lobby', 'car_park', 'amenity', 'office', 'restroom', 'other']).optional(),
    floor: z.string().max(20).optional(),
    areaSqm: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const createScheduleSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    zoneId: z.string().uuid(),
    name: z.string().min(1).max(255),
    frequencyType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional().default([]),
    scheduledTime: z.string().optional(),
    durationMinutes: z.number().min(1).optional(),
    assignedToId: z.string().uuid().optional(),
    staffCount: z.number().min(1).default(1),
    cleaningType: z.enum(['routine', 'deep_clean', 'sanitization']).optional(),
    checklist: z.array(z.object({ item: z.string(), isRequired: z.boolean().default(true) })).default([]),
  }),
});

export const completeTaskSchema = z.object({
  body: z.object({
    checklistResults: z.array(z.object({
      item: z.string(), checked: z.boolean(), notes: z.string().optional(),
    })).default([]),
    notes: z.string().optional(),
    qualityScore: z.number().min(1).max(5).optional(),
    photos: z.array(z.string()).default([]),
  }),
});

export const createInspectionSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    zoneId: z.string().uuid().optional(),
    inspectionDate: z.string(),
    overallScore: z.number().min(1).max(5).optional(),
    checklist: z.array(z.object({
      item: z.string(), score: z.number().min(1).max(5), notes: z.string().optional(),
    })).default([]),
    issuesFound: z.array(z.string()).default([]),
    actionRequired: z.boolean().default(false),
  }),
});
