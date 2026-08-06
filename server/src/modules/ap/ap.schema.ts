import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' });

// ── AP Invoices ────────────────────────────────

export const createApInvoiceSchema = z.object({
  body: z.object({
    vendorName: z.string().min(1, 'Vendor name is required').max(255),
    vendorInvoiceNo: z.string().max(100).optional(),
    propertyId: z.string().uuid().optional(),
    invoiceDate: dateString,
    dueDate: dateString,
    description: z.string().optional(),
    currency: z.string().length(3).optional(),
    departmentId: z.string().uuid().optional(),
    costCenter: z.string().max(100).optional(),
    poReference: z.string().max(100).optional(),
    attachmentUrl: z.string().max(500).optional(),
    notes: z.string().optional(),
    lines: z.array(z.object({
      chargeTypeId: z.string().uuid().optional(),
      description: z.string().min(1).max(500),
      quantity: z.number().positive().default(1),
      unitPrice: z.number().min(0),
      taxRate: z.number().min(0).max(1).default(0),
      glAccountCode: z.string().max(20).optional(),
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
    voucherDate: dateString,
    paymentMethod: z.enum(['bank_transfer', 'cheque', 'giro', 'cash']),
    bankAccountId: z.string().uuid().optional(),
    vendorName: z.string().min(1).max(255),
    vendorBankName: z.string().max(100).optional(),
    vendorBankAcc: z.string().max(50).optional(),
    currency: z.string().length(3),
    notes: z.string().optional(),
    allocations: z.array(z.object({
      apInvoiceId: z.string().uuid(),
      amount: z.number().positive(),
    })).min(1, 'At least one AP invoice allocation is required'),
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
    propertyId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    expenseDate: dateString,
    category: z.string().min(1).max(100),
    description: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().length(3),
    receiptUrl: z.string().max(500).optional(),
    glAccountCode: z.string().max(20).optional(),
  }),
});
