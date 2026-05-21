import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' });

// ── Zones ──────────────────────────────────

export const createZoneSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Zone name is required'),
    code: z.string().max(20).optional(),
    zoneType: z.enum(['covered', 'open', 'rooftop', 'basement', 'multi_level']).optional(),
  }),
});

export const updateZoneSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    zoneType: z.enum(['covered', 'open', 'rooftop', 'basement', 'multi_level']).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Slots ──────────────────────────────────

export const createSlotSchema = z.object({
  body: z.object({
    zoneId: z.string().uuid().optional(),
    slotNumber: z.string().min(1, 'Slot number is required'),
    slotType: z.enum(['car', 'motorcycle', 'ev', 'disabled', 'compact']).optional(),
    size: z.enum(['compact', 'standard', 'large']).optional(),
    hasEvCharger: z.boolean().optional(),
    evChargerType: z.string().optional(),
    monthlyRate: z.number().min(0).optional(),
    hourlyRate: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const bulkCreateSlotsSchema = z.object({
  body: z.object({
    zoneId: z.string().uuid().optional(),
    prefix: z.string().min(1, 'Prefix is required'),
    rangeStart: z.number().int().min(1),
    rangeEnd: z.number().int().min(1),
    slotType: z.enum(['car', 'motorcycle', 'ev', 'disabled', 'compact']).optional(),
    size: z.enum(['compact', 'standard', 'large']).optional(),
    hasEvCharger: z.boolean().optional(),
    evChargerType: z.string().optional(),
    monthlyRate: z.number().min(0).optional(),
    hourlyRate: z.number().min(0).optional(),
  }),
});

export const updateSlotSchema = z.object({
  body: z.object({
    zoneId: z.string().uuid().nullable().optional(),
    slotNumber: z.string().optional(),
    slotType: z.string().optional(),
    size: z.string().optional(),
    hasEvCharger: z.boolean().optional(),
    evChargerType: z.string().nullable().optional(),
    status: z.enum(['available', 'allocated', 'visitor', 'blocked', 'maintenance']).optional(),
    monthlyRate: z.number().min(0).optional(),
    hourlyRate: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Allocations ────────────────────────────

export const createAllocationSchema = z.object({
  body: z.object({
    slotId: z.string().uuid('Invalid slot ID'),
    tenantId: z.string().uuid('Invalid tenant ID'),
    unitId: z.string().uuid().optional(),
    leaseId: z.string().uuid().optional(),
    startDate: dateString,
    endDate: dateString.optional(),
    monthlyRate: z.number().min(0),
    billingDay: z.number().min(1).max(28).optional(),
    vehicleId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const updateAllocationSchema = z.object({
  body: z.object({
    endDate: dateString.optional(),
    monthlyRate: z.number().min(0).optional(),
    billingDay: z.number().min(1).max(28).optional(),
    vehicleId: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(['active', 'cancelled', 'expired']).optional(),
  }),
});

// ── Tenant Vehicles ────────────────────────

export const createVehicleSchema = z.object({
  body: z.object({
    plateNumber: z.string().min(1, 'Plate number is required'),
    make: z.string().optional(),
    model: z.string().optional(),
    color: z.string().optional(),
    vehicleType: z.enum(['car', 'motorcycle', 'truck', 'van', 'ev']).optional(),
    rfidTagNo: z.string().optional(),
  }),
});

export const updateVehicleSchema = z.object({
  body: z.object({
    plateNumber: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    color: z.string().optional(),
    vehicleType: z.string().optional(),
    rfidTagNo: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Visitor Passes ─────────────────────────

export const createVisitorPassSchema = z.object({
  body: z.object({
    slotId: z.string().uuid().optional(),
    issuingUnitId: z.string().uuid().optional(),
    visitorName: z.string().min(1, 'Visitor name is required'),
    visitorVehiclePlate: z.string().optional(),
    validFrom: dateString,
    validTo: dateString,
    maxHours: z.number().min(1).max(24).optional(),
  }),
});

// ── RFID Access Events ─────────────────────

export const rfidEventSchema = z.object({
  body: z.object({
    rfidTagNo: z.string().min(1, 'RFID tag number is required'),
    eventType: z.enum(['entry', 'exit']),
    gateId: z.string().optional(),
    eventAt: dateString.optional(),
  }),
});

