import { z } from 'zod';

export const createAccountSchema = z.object({
  body: z.object({
    parentId: z.string().uuid().optional(),
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(255),
    accountType: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
    accountSubtype: z.string().max(50).optional(),
    normalBalance: z.enum(['debit', 'credit']),
    isControl: z.boolean().optional(),
    description: z.string().optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const updateAccountSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    accountSubtype: z.string().max(50).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }),
});

export const createFiscalPeriodSchema = z.object({
  body: z.object({
    fiscalYear: z.number().int().min(2020).max(2099),
    periodNumber: z.number().int().min(1).max(12),
    name: z.string().min(1).max(50),
    startDate: z.string(),
    endDate: z.string(),
  }),
});

const journalLineSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export const createJournalEntrySchema = z.object({
  body: z.object({
    entryDate: z.string(),
    description: z.string().min(1).max(500),
    entryType: z.string().optional(),
    lines: z.array(journalLineSchema).min(2),
  }),
});
