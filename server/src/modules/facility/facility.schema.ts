import { z } from 'zod';

export const createFacilityAssetSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    assetNumber: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    assetType: z.enum(['hvac', 'elevator', 'generator', 'fire_system', 'water_pump', 'cctv', 'access_control', 'lighting', 'other']),
    make: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    serialNumber: z.string().max(100).optional(),
    installationDate: z.string().optional(),
    warrantyExpiry: z.string().optional(),
    expectedLifespanYears: z.number().int().min(1).optional(),
    location: z.string().max(255).optional(),
    floor: z.string().max(20).optional(),
    unitId: z.string().uuid().optional(),
    responsiblePersonId: z.string().uuid().optional(),
    vendorName: z.string().max(255).optional(),
    vendorContact: z.string().max(100).optional(),
    serviceContractNo: z.string().max(100).optional(),
    serviceContractExpiry: z.string().optional(),
    purchaseCost: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const updateFacilityAssetSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    assetType: z.enum(['hvac', 'elevator', 'generator', 'fire_system', 'water_pump', 'cctv', 'access_control', 'lighting', 'other']).optional(),
    make: z.string().max(100).optional().nullable(),
    model: z.string().max(100).optional().nullable(),
    serialNumber: z.string().max(100).optional().nullable(),
    installationDate: z.string().optional().nullable(),
    warrantyExpiry: z.string().optional().nullable(),
    expectedLifespanYears: z.number().int().min(1).optional().nullable(),
    location: z.string().max(255).optional().nullable(),
    floor: z.string().max(20).optional().nullable(),
    unitId: z.string().uuid().optional().nullable(),
    status: z.enum(['operational', 'under_maintenance', 'decommissioned', 'fault']).optional(),
    responsiblePersonId: z.string().uuid().optional().nullable(),
    vendorName: z.string().max(255).optional().nullable(),
    vendorContact: z.string().max(100).optional().nullable(),
    serviceContractNo: z.string().max(100).optional().nullable(),
    serviceContractExpiry: z.string().optional().nullable(),
    purchaseCost: z.number().min(0).optional().nullable(),
    currentValue: z.number().min(0).optional().nullable(),
    notes: z.string().optional().nullable(),
    nextServiceDue: z.string().optional().nullable(),
  }),
});

export const createCamCostSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    costCategory: z.enum(['cleaning', 'security', 'landscaping', 'utilities', 'insurance', 'management_fee', 'repairs', 'other']),
    description: z.string().min(1).max(500),
    amount: z.number().min(0),
    currency: z.string().length(3).default('USD'),
    periodMonth: z.number().int().min(1).max(12),
    periodYear: z.number().int().min(2000).max(2100),
    sourceType: z.enum(['ap_invoice', 'work_order', 'manual']).optional(),
    sourceId: z.string().uuid().optional(),
  }),
});
