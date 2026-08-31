import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' });

// ── Charge Categories ─────────────────────────

export const createChargeCategorySchema = z.object({
  body: z.object({
    code: z.string().min(1).max(50),
    description: z.string().max(255).optional(),
    monthly: z.boolean().optional(),
  }),
});

export const updateChargeCategorySchema = z.object({
  body: z.object({
    code: z.string().min(1).max(50).optional(),
    description: z.string().max(255).optional(),
    monthly: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Charge Types ──────────────────────────────

export const createChargeTypeSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(150),
    category: z.string().min(1).max(50), // code of a ChargeCategory — see charge-categories
    glAccountCode: z.string().max(20).optional(),
    isTaxable: z.boolean().optional(),
    taxRate: z.number().min(0).max(1).optional(),
  }),
});

// ── Meter Setup ───────────────────────────────

export const createMeterSetupSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    floorId: z.string().uuid().optional(),
    meterType: z.enum(['mepe', 'sub_meter', 'ct_meter', 'water_meter']),
    meterNo: z.string().min(1).max(50),
    mainMeterId: z.string().uuid().optional(),
    horsePower: z.number().optional(),
    unitLostPct: z.number().min(0).max(100).optional(),
    category: z.enum(['lighting', 'water', 'aircon', 'aircon_lighting', 'lighting_telenor']),
    factor: z.number().optional(),
    maintenanceFee: z.number().optional(),
    usageType: z.enum(['tenant_used', 'common_used', 'office_used']).optional(),
    rate: z.number().optional(),
    calculationType: z.enum(['per_unit', 'fixed']).optional(),
  }).refine((data) => data.meterType !== 'sub_meter' || !!data.mainMeterId, {
    message: 'Main meter is required for sub meters',
    path: ['mainMeterId'],
  }),
});


export const updateMeterSetupSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid().optional(),
    floorId: z.string().uuid().nullable().optional(),
    meterType: z.enum(['mepe', 'sub_meter', 'ct_meter', 'water_meter']).optional(),
    meterNo: z.string().min(1).max(50).optional(),
    mainMeterId: z.string().uuid().nullable().optional(),
    horsePower: z.number().optional(),
    unitLostPct: z.number().min(0).max(100).optional(),
    category: z.enum(['lighting', 'water', 'aircon', 'aircon_lighting', 'lighting_telenor']).optional(),
    factor: z.number().optional(),
    maintenanceFee: z.number().optional(),
    usageType: z.enum(['tenant_used', 'common_used', 'office_used']).optional(),
    rate: z.number().nullable().optional(),
    calculationType: z.enum(['per_unit', 'fixed']).optional(),
    isActive: z.boolean().optional(),
  }).refine((data) => data.meterType !== 'sub_meter' || !!data.mainMeterId, {
    message: 'Main meter is required for sub meters',
    path: ['mainMeterId'],
  }),
});

export const updateChargeTypeSchema = z.object({
  body: z.object({
    code: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(150).optional(),
    category: z.string().min(1).max(50).optional(), // code of a ChargeCategory — see charge-categories
    glAccountCode: z.string().max(20).optional(),
    isTaxable: z.boolean().optional(),
    taxRate: z.number().min(0).max(1).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Billing Schedules ─────────────────────────

export const createBillingScheduleSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    unitId: z.string().uuid().optional(),
    tenantId: z.string().uuid(),
    leaseId: z.string().uuid().optional(),
    chargeTypeId: z.string().uuid(),
    description: z.string().max(500).optional(),
    amount: z.number().min(0),
    currency: z.string().length(3).optional(),
    billingCycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']).optional(),
    billingDay: z.number().int().min(1).max(28).optional(),
    paymentDueDays: z.number().int().min(1).max(90).optional(),
    startDate: dateString,
    endDate: dateString.optional(),
    notes: z.string().optional(),
  }),
});

export const updateBillingScheduleSchema = z.object({
  body: z.object({
    description: z.string().max(500).optional(),
    amount: z.number().min(0).optional(),
    billingDay: z.number().int().min(1).max(28).optional(),
    paymentDueDays: z.number().int().min(1).max(90).optional(),
    endDate: dateString.nullable().optional(),
    notes: z.string().optional(),
  }),
});

// ── Invoices ──────────────────────────────────

export const createInvoiceSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    unitId: z.string().uuid().optional(),
    tenantId: z.string().uuid(),
    leaseId: z.string().uuid().optional(),
    invoiceDate: dateString,
    dueDate: dateString,
    periodFrom: dateString.optional(),
    periodTo: dateString.optional(),
    currency: z.string().length(3).optional(),
    notes: z.string().optional(),
    lines: z.array(z.object({
      chargeTypeId: z.string().uuid(),
      description: z.string().min(1).max(500),
      quantity: z.number().min(0).optional(),
      unitPrice: z.number().min(0),
      taxRate: z.number().min(0).max(1).optional(),
      discountPct: z.number().min(0).max(100).optional(),
    })).min(1, 'At least one line item is required'),
  }),
});

export const voidInvoiceSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Void reason is required'),
  }),
});

export const createCreditNoteSchema = z.object({
  body: z.object({
    creditReason: z.string().min(1, 'Credit reason is required'),
    lines: z.array(z.object({
      chargeTypeId: z.string().uuid(),
      description: z.string().min(1).max(500),
      quantity: z.number().min(0).optional(),
      unitPrice: z.number().min(0),
      taxRate: z.number().min(0).max(1).optional(),
    })).min(1),
  }),
});

// ── Penalty Config ────────────────────────────

export const createPenaltyConfigSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid().optional(),
    chargeTypeId: z.string().uuid().optional(),
    gracePeriodDays: z.number().int().min(0).max(90),
    penaltyType: z.enum(['percentage', 'fixed_amount', 'percentage_per_day', 'tiered']),
    penaltyValue: z.number().min(0),
    maxPenaltyPct: z.number().min(0).max(100).optional(),
    compound: z.boolean().optional(),
    tieredConfig: z.any().optional(),
  }),
});

// ── Tax Config ────────────────────────────────

export const createTaxConfigSchema = z.object({
  body: z.object({
    taxName: z.string().min(1).max(50),
    taxRate: z.number().min(0).max(1),
    appliesTo: z.array(z.string()).optional(),
    effectiveFrom: dateString,
    effectiveTo: dateString.optional(),
  }),
});
