import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' });
const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional());

// ── AP Invoices ────────────────────────────────

export const createApInvoiceSchema = z.object({
  body: z.object({
    vendorName: z.string().min(1, 'Vendor name is required').max(255),
    vendorInvoiceNo: z.string().max(100).optional(),
    propertyId: z.string().uuid('Property is required'),
    invoiceDate: dateString,
    dueDate: dateString,
    description: z.string().optional(),
    currency: z.string().length(3).optional(),
    departmentId: optionalUuid,
    costCenter: z.string().max(100).optional(),
    poReference: z.string().max(100).optional(),
    attachmentUrl: z.string().max(500).optional(),
    notes: z.string().optional(),
    lines: z.array(z.object({
      chargeTypeId: optionalUuid,
      description: z.string().min(1).max(500),
      quantity: z.number().positive().default(1),
      unitPrice: z.number().min(0),
      taxRate: z.number().min(0).max(1).default(0),
      glAccountCode: z.string().max(50).optional(),
    })).min(1, 'At least one line item is required'),
  }),
});

export const rejectApInvoiceSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
  }),
});

// ── Payment Vouchers ───────────────────────────

export const createPaymentVoucherSchema = z.object({
  body: z.object({
    propertyId: optionalUuid,
    voucherDate: dateString,
    paymentMethod: z.string().min(1, 'Payment method is required').max(50),
    bankAccountId: optionalUuid,
    isCash: z.boolean().optional(),
    vendorName: z.string().max(255).optional().nullable(),
    vendorBankName: z.string().max(100).optional(),
    vendorBankAcc: z.string().max(50).optional(),
    amount: z.number().nonnegative().optional(),
    currency: z.string().length(3),
    notes: z.string().optional(),
    allocations: z.array(z.object({
      apInvoiceId: z.string().uuid(),
      amount: z.number().positive(),
    })).optional().default([]),
  }).refine((data) => data.isCash || (data.vendorName && data.vendorName.trim().length > 0), {
    message: 'Vendor name is required unless Cash is selected',
    path: ['vendorName'],
  }).refine((data) => data.isCash || (data.allocations && data.allocations.length > 0), {
    message: 'At least one AP invoice allocation is required unless Cash is selected',
    path: ['allocations'],
  }),
});

export const markVoucherPaidSchema = z.object({
  body: z.object({
    paymentReference: z.string().min(1, 'Payment reference is required'),
    paidAt: dateString.optional(),
  }),
});

// ── Expenses ───────────────────────────────────

export const createExpenseSchema = z.object({
  body: z.object({
    propertyId: optionalUuid,
    departmentId: optionalUuid,
    expenseDate: dateString,
    category: z.string().min(1).max(100),
    description: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().length(3),
    receiptUrl: z.string().max(500).optional(),
    glAccountCode: z.string().max(50).optional(),
  }),
});
