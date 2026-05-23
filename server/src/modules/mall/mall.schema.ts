import { z } from 'zod';

// ── Mall Property ──
export const upsertMallPropertySchema = z.object({
  body: z.object({
    totalGlaSqft: z.number().positive().optional(),
    totalNlaSqft: z.number().positive().optional(),
    totalShops: z.number().int().min(0).optional(),
    totalFloors: z.number().int().min(1).optional(),
    anchorTenantSlots: z.number().int().min(0).optional(),
    mallType: z.enum(['regional', 'community', 'strip', 'outlet', 'specialty']).optional(),
    managementFeePct: z.number().min(0).max(1).optional(),
    camPoolType: z.enum(['shared', 'zone_based', 'proportionate']).optional(),
    camAdminFeePct: z.number().min(0).max(1).optional(),
    fiscalYearStart: z.number().int().min(1).max(12).optional(),
  }),
});

// ── Shop Profile ──
export const upsertShopProfileSchema = z.object({
  body: z.object({
    shopNumber: z.string().max(30).optional(),
    brandName: z.string().max(150).optional(),
    tradeCategory: z.string().max(100).optional(),
    tradeSubcategory: z.string().max(100).optional(),
    franchiseGroup: z.string().max(150).optional(),
    isAnchor: z.boolean().optional(),
    anchorType: z.enum(['anchor', 'mini_anchor', 'satellite']).optional().nullable(),
    shopZone: z.string().max(50).optional(),
    shopfrontWidthM: z.number().positive().optional().nullable(),
    fitOutAllowed: z.boolean().optional(),
    posSystem: z.string().max(50).optional().nullable(),
    posStoreId: z.string().max(100).optional().nullable(),
  }),
});

// ── Commercial Lease ──
export const upsertCommercialLeaseSchema = z.object({
  body: z.object({
    fitOutStartDate: z.string().optional().nullable(),
    fitOutEndDate: z.string().optional().nullable(),
    fitOutRentFree: z.boolean().optional(),
    fitOutAllowance: z.number().min(0).optional(),
    fitOutAllowancePaid: z.boolean().optional(),
    hasPercentageRent: z.boolean().optional(),
    percentageRentRate: z.number().min(0).max(1).optional().nullable(),
    percentageRentType: z.enum(['natural', 'artificial']).optional(),
    artificialBreakpoint: z.number().min(0).optional().nullable(),
    gtoReportingDay: z.number().int().min(1).max(28).optional(),
    camIncluded: z.boolean().optional(),
    camRatePerSqft: z.number().min(0).optional().nullable(),
    camCapPct: z.number().min(0).max(1).optional().nullable(),
    camBaseYear: z.number().int().optional().nullable(),
    marketingLevyPct: z.number().min(0).max(1).optional(),
    marketingLevyAmount: z.number().min(0).optional().nullable(),
    turnoverReportingRequired: z.boolean().optional(),
    exclusivityCategory: z.string().max(100).optional().nullable(),
    exclusivityRadiusKm: z.number().min(0).optional().nullable(),
  }),
});

// ── GTO ──
export const submitGtoSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    unitId: z.string().uuid(),
    leaseId: z.string().uuid(),
    tenantId: z.string().uuid(),
    submissionMonth: z.number().int().min(1).max(12),
    submissionYear: z.number().int().min(2020).max(2050),
    grossTurnover: z.number().min(0),
    currency: z.string().length(3).optional(),
    cashSales: z.number().min(0).optional(),
    cardSales: z.number().min(0).optional(),
    onlineSales: z.number().min(0).optional(),
    otherSales: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const verifyGtoSchema = z.object({
  body: z.object({
    verified: z.boolean(),
    variancePct: z.number().optional(),
    notes: z.string().optional(),
  }),
});

// ── CAM ──
export const createCamPoolSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(150),
    description: z.string().optional(),
    poolType: z.enum(['controllable', 'uncontrollable', 'capital']),
    allocationBasis: z.enum(['gla', 'equal', 'zone', 'custom']).optional(),
    costCategories: z.array(z.string()).min(1),
    year: z.number().int().min(2020).max(2050),
    budgetedAmount: z.number().min(0),
  }),
});

export const updateCamPoolSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().optional(),
    budgetedAmount: z.number().min(0).optional(),
    actualAmount: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const generateCamBillingSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2050),
  }),
});

export const runReconciliationSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    year: z.number().int().min(2020).max(2050),
  }),
});

// ── Events ──
export const createEventSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    eventType: z.enum(['campaign', 'event', 'roadshow', 'sale', 'exhibition']),
    category: z.string().max(50).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    venue: z.string().max(255).optional(),
    organizer: z.string().max(150).optional(),
    estimatedFootfall: z.number().int().optional(),
    budget: z.number().min(0).optional(),
    isPublic: z.boolean().optional(),
  }),
});

export const updateEventSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    eventType: z.enum(['campaign', 'event', 'roadshow', 'sale', 'exhibition']).optional(),
    category: z.string().max(50).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    venue: z.string().optional(),
    estimatedFootfall: z.number().int().optional(),
    actualFootfall: z.number().int().optional(),
    budget: z.number().min(0).optional(),
    actualCost: z.number().min(0).optional(),
    status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
    isPublic: z.boolean().optional(),
  }),
});

export const createBoothSchema = z.object({
  body: z.object({
    boothNumber: z.string().min(1).max(20),
    boothLocation: z.string().max(150).optional(),
    sizeSqft: z.number().positive().optional(),
    tenantId: z.string().uuid().optional(),
    brandName: z.string().max(150).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dailyRate: z.number().min(0).optional(),
    deposit: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

// ── Footfall ──
export const createSensorSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    sensorId: z.string().min(1).max(100),
    name: z.string().min(1).max(150),
    location: z.string().max(255).optional(),
    zone: z.string().max(50).optional(),
    floor: z.string().max(20).optional(),
    sensorType: z.enum(['stereo', 'thermal', 'lidar', 'wifi']).optional(),
    vendor: z.string().max(50).optional(),
    apiEndpoint: z.string().optional(),
    apiKey: z.string().optional(),
  }),
});
