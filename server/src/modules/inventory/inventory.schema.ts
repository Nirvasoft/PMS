import { z } from 'zod';

// ─── Stores ──────────────────────────────
export const createStoreSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    name: z.string().min(1).max(150),
    location: z.string().max(255).optional(),
  }),
});

// ─── Items ───────────────────────────────
export const createItemSchema = z.object({
  body: z.object({
    itemCode: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.enum(['plumbing', 'electrical', 'hvac', 'cleaning', 'general', 'other']).optional(),
    unitOfMeasure: z.enum(['pcs', 'meters', 'kg', 'litres', 'roll', 'box', 'set']),
    unitCost: z.number().min(0).default(0),
    currency: z.string().length(3).default('USD'),
    reorderPoint: z.number().min(0).default(0),
    reorderQty: z.number().min(0).default(1),
    maxStock: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
});

export const updateItemSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.enum(['plumbing', 'electrical', 'hvac', 'cleaning', 'general', 'other']).optional(),
    unitOfMeasure: z.enum(['pcs', 'meters', 'kg', 'litres', 'roll', 'box', 'set']).optional(),
    unitCost: z.number().min(0).optional(),
    reorderPoint: z.number().min(0).optional(),
    reorderQty: z.number().min(0).optional(),
    maxStock: z.number().min(0).nullable().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

// ─── Stock movements ─────────────────────
export const receiveStockSchema = z.object({
  body: z.object({
    itemId: z.string().uuid(),
    storeId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().min(0).optional(),
    poId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const issueStockSchema = z.object({
  body: z.object({
    itemId: z.string().uuid(),
    storeId: z.string().uuid(),
    quantity: z.number().positive(),
    workOrderId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const transferStockSchema = z.object({
  body: z.object({
    itemId: z.string().uuid(),
    fromStoreId: z.string().uuid(),
    toStoreId: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().optional(),
  }),
});

export const adjustStockSchema = z.object({
  body: z.object({
    itemId: z.string().uuid(),
    storeId: z.string().uuid(),
    adjustedQty: z.number().min(0),
    reason: z.string().min(1),
  }),
});
