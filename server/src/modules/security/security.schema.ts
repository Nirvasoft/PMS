import { z } from 'zod';

export const createIncidentSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    incidentType: z.enum(['theft', 'vandalism', 'trespassing', 'fire', 'medical', 'accident', 'suspicious_activity', 'other']),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    locationDetail: z.string().max(255).optional(),
    unitId: z.string().uuid().optional(),
    incidentAt: z.string(),
    assignedToId: z.string().uuid().optional(),
    policeReportNo: z.string().max(100).optional(),
    involvesTenant: z.boolean().default(false),
    tenantId: z.string().uuid().optional(),
    followUpRequired: z.boolean().default(false),
    followUpNotes: z.string().optional(),
  }),
});

export const updateIncidentSchema = z.object({
  body: z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    assignedToId: z.string().uuid().nullable().optional(),
    status: z.enum(['open', 'investigating', 'resolved', 'closed', 'escalated']).optional(),
    policeReportNo: z.string().max(100).optional(),
    followUpRequired: z.boolean().optional(),
    followUpNotes: z.string().optional(),
  }),
});

export const resolveIncidentSchema = z.object({
  body: z.object({
    resolution: z.string().min(1),
    policeReportNo: z.string().max(100).optional(),
  }),
});

export const createCheckpointSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(150),
    location: z.string().max(255).optional(),
    floor: z.string().max(20).optional(),
    sortOrder: z.number().min(0).default(0),
  }),
});

export const scanCheckpointSchema = z.object({
  body: z.object({
    qrCode: z.string().min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
    notes: z.string().optional(),
  }),
});

export const createPatrolScheduleSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(150),
    checkpoints: z.array(z.string().uuid()).min(1),
    frequencyType: z.enum(['hourly', 'every_2h', 'every_4h', 'custom']),
    customTimes: z.array(z.string()).default([]),
    assignedToId: z.string().uuid().optional(),
  }),
});
