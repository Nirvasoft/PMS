import { z } from 'zod';

export const preRegisterVisitorSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    hostUnitId: z.string().uuid(),
    visitorName: z.string().min(1).max(200),
    visitorIc: z.string().max(50).optional(),
    visitorMobile: z.string().max(50).optional(),
    visitorCompany: z.string().max(150).optional(),
    visitPurpose: z.string().max(255).optional(),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
    expectedDurationHours: z.number().int().min(1).max(72).optional(),
    passType: z.enum(['single', 'recurring', 'multi_day']).optional(),
    maxUses: z.number().int().min(1).max(100).optional(),
    vehiclePlate: z.string().max(30).optional(),
    vehicleMake: z.string().max(50).optional(),
    parkingSlotId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const scanQrSchema = z.object({
  body: z.object({
    qrToken: z.string().min(1),
    gateId: z.string().max(100),
  }),
});

export const walkinRequestSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    hostUnitId: z.string().uuid(),
    visitorName: z.string().min(1).max(200),
    visitorIc: z.string().max(50).optional(),
    visitorMobile: z.string().max(50).optional(),
    visitorCompany: z.string().max(150).optional(),
    visitPurpose: z.string().max(255).optional(),
  }),
});

export const walkinRespondSchema = z.object({
  body: z.object({
    approvalId: z.string().uuid(),
    response: z.enum(['approved', 'rejected']),
    reason: z.string().max(500).optional(),
  }),
});
