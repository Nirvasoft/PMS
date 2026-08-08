import { z } from 'zod';

// ── Maintenance Request ──────────────────────
export const submitMaintenanceSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(255),
    description: z.string().min(10).max(2000),
    categoryId: z.string().uuid().optional(),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).default('P3'),
    locationDetail: z.string().max(255).optional(),
    requiresAccess: z.boolean().default(false),
    preferredAccessTime: z.string().optional(),
  }),
});

export const rateTicketSchema = z.object({
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  }),
});

// ── Residents ────────────────────────────────
export const createResidentSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    residentType: z.enum(['family_member', 'occupant', 'domestic_helper']).default('family_member'),
    relationship: z.enum(['spouse', 'child', 'parent', 'sibling', 'employee']).optional(),
    dateOfBirth: z.string().optional(),
    idType: z.string().max(30).optional(),
    idNumber: z.string().max(100).optional(),
    mobile: z.string().max(50).optional(),
    email: z.string().email().optional(),
    vehiclePlate: z.string().max(30).optional(),
    moveInDate: z.string().optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const updateResidentSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    residentType: z.enum(['family_member', 'occupant', 'domestic_helper']).optional(),
    relationship: z.enum(['spouse', 'child', 'parent', 'sibling', 'employee']).optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    idType: z.string().max(30).optional().nullable(),
    idNumber: z.string().max(100).optional().nullable(),
    mobile: z.string().max(50).optional().nullable(),
    email: z.string().email().optional().nullable(),
    vehiclePlate: z.string().max(30).optional().nullable(),
    moveInDate: z.string().optional().nullable(),
    moveOutDate: z.string().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  }),
});

// ── Profile ──────────────────────────────────
export const updateProfileSchema = z.object({
  body: z.object({
    mobile: z.string().max(50).optional(),
    avatarUrl: z.string().max(500).optional(),
    timezone: z.string().max(60).optional(),
    locale: z.string().max(10).optional(),
  }),
});

// ── Invoice Payment ─────────────────────────
export const payInvoiceSchema = z.object({
  body: z.object({
    returnUrl: z.string().url(),
  }),
});

// ── Resident Portal Invite ──────────────────
export const inviteResidentSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});
