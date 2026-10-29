import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' });

// ── Receipts ──────────────────────────────────

export const createReceiptSchema = z.object({
  body: z.object({
    tenantId: z.string().uuid().optional().nullable(),
    isCash: z.boolean().optional(),
    propertyId: z.string().uuid().optional(),
    receiptDate: dateString.optional(),
    paymentMethod: z.string().min(1, 'Payment method is required').max(50),
    paymentReference: z.string().max(255).optional(),
    bankAccountId: z.string().uuid().optional(),
    // For Cash receipts the amount is derived from the line items, so it is optional there.
    amount: z.number().positive('Amount must be positive').optional(),
    currency: z.string().length(3).optional(),
    exchangeRate: z.number().positive().optional(),
    notes: z.string().optional(),
    allocations: z.array(z.object({
      invoiceId: z.string().uuid(),
      amount: z.number().positive(),
    })).optional().default([]),
    // Cash receipt line items (direct Charge selection — no invoice required).
    lines: z.array(z.object({
      chargeTypeId: z.string().uuid().optional().nullable(),
      description: z.string().min(1).max(500),
      quantity: z.number().positive().default(1),
      unitPrice: z.number().positive('Unit price must be positive'),
      taxRate: z.number().min(0).max(1).default(0),
      glAccountCode: z.string().max(50).optional(),
    })).optional().default([]),
  }).refine((data) => data.isCash || (typeof data.amount === 'number' && data.amount > 0), {
    message: 'Amount must be positive',
    path: ['amount'],
  }).refine((data) => !data.isCash || (data.lines && data.lines.length > 0), {
    message: 'At least one line item is required for Cash receipts',
    path: ['lines'],
  }),
});

export const reverseReceiptSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reversal reason is required'),
  }),
});

// ── Refunds ───────────────────────────────────

export const createRefundSchema = z.object({
  body: z.object({
    tenantId: z.string().uuid(),
    receiptId: z.string().uuid().optional(),
    refundType: z.enum(['overpayment', 'deposit', 'adjustment']),
    amount: z.number().positive(),
    currency: z.string().length(3),
    reason: z.string().min(1, 'Reason is required'),
    bankName: z.string().max(100).optional(),
    bankAccountNo: z.string().max(50).optional(),
    bankAccountName: z.string().max(150).optional(),
  }),
});

export const rejectRefundSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
  }),
});

export const markRefundPaidSchema = z.object({
  body: z.object({
    paymentReference: z.string().min(1, 'Payment reference is required'),
    paidAt: dateString.optional(),
  }),
});

// ── Tenant Credits ────────────────────────────

export const createTenantCreditSchema = z.object({
  body: z.object({
    tenantId: z.string().uuid(),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3).optional().default('USD'),
    sourceType: z.enum(['overpayment', 'credit_note', 'adjustment']),
    description: z.string().max(500).optional(),
  }),
});

export const applyCreditSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive('Amount must be positive'),
  }),
});
