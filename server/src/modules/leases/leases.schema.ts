import { z } from 'zod';

const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid date format',
});

export const createLeaseSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid('Invalid property ID'),
    unitId: z.string().uuid('Invalid unit ID'),
    tenantId: z.string().uuid('Invalid tenant ID'),
    templateId: z.string().uuid('Invalid template ID').optional(),
    startDate: dateString,
    endDate: dateString,
    handoverDate: dateString.optional(),
    predefinedType: z.enum(['prerenewal', 'precontractend']).nullable().optional(),
    rentAmount: z.number().positive('Rent amount must be greater than 0'),
    currency: z.string().length(3).optional(),
    billingCycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
    billingDay: z.number().min(1).max(31).optional(),
    paymentDueDays: z.number().min(0).max(90).optional(),
    securityDeposit: z.number().min(0).optional(),
    escalationType: z.enum(['fixed_percent', 'fixed_amount', 'cpi', 'stepped']).nullable().optional(),
    escalationValue: z.number().optional(),
    escalationFrequency: z.enum(['annual', 'biennial']).optional(),
    escalationMonth: z.number().min(1).max(12).optional(),
    escalationDay: z.number().min(1).max(31).optional(),
    specialConditions: z.string().optional(),
    notes: z.string().optional(),
    clauses: z.array(z.object({
      title: z.string(),
      content: z.string(),
    })).optional(),
    leaseCharges: z.array(z.object({
      chargeTypeId: z.string().uuid('Invalid charge type ID'),
      amount: z.number().positive('Charge amount must be positive'),
    })).optional(),
  }),
});

export const updateLeaseSchema = z.object({
  body: z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    handoverDate: dateString.nullable().optional(),
    predefinedType: z.enum(['prerenewal', 'precontractend']).nullable().optional(),
    rentAmount: z.number().positive('Rent amount must be greater than 0').optional(),
    currency: z.string().length(3).optional(),
    billingCycle: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
    billingDay: z.number().min(1).max(31).optional(),
    paymentDueDays: z.number().min(0).max(90).optional(),
    securityDeposit: z.number().min(0).optional(),
    escalationType: z.enum(['fixed_percent', 'fixed_amount', 'cpi', 'stepped']).nullable().optional(),
    escalationValue: z.number().nullable().optional(),
    escalationFrequency: z.enum(['annual', 'biennial']).optional(),
    escalationMonth: z.number().min(1).max(12).optional(),
    escalationDay: z.number().min(1).max(31).optional(),
    specialConditions: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    clauses: z.array(z.object({
      title: z.string(),
      content: z.string(),
    })).optional(),
    leaseCharges: z.array(z.object({
      chargeTypeId: z.string().uuid('Invalid charge type ID'),
      amount: z.number().positive('Charge amount must be positive'),
    })).optional(),
  }),
});

export const createAmendmentSchema = z.object({
  body: z.object({
    amendmentType: z.enum(['rent_revision', 'term_extension', 'unit_change', 'other']),
    description: z.string().min(1, 'Description is required'),
    effectiveDate: dateString,
    newRentAmount: z.number().positive().optional(),
    newEndDate: dateString.optional(),
    newUnitId: z.string().uuid().optional(),
  }),
});

export const createRenewalSchema = z.object({
  body: z.object({
    startDate: dateString.optional(),
    endDate: dateString,
    rentAmount: z.number().positive().optional(),
    securityDeposit: z.number().min(0).optional(),
    escalationType: z.enum(['fixed_percent', 'fixed_amount', 'cpi', 'stepped']).nullable().optional(),
    escalationValue: z.number().optional(),
    offerExpiresAt: dateString.optional(),
  }),
});

export const terminateLeaseSchema = z.object({
  body: z.object({
    terminationDate: dateString,
    reason: z.string().min(1, 'Termination reason is required'),
  }),
});

export const esignSendSchema = z.object({
  body: z.object({
    provider: z.string().optional(),
    recipients: z.array(z.object({
      recipientType: z.enum(['tenant', 'landlord', 'witness']),
      name: z.string().min(1, 'Recipient name is required'),
      email: z.string().email('Invalid recipient email'),
    })).min(1, 'At least one recipient is required'),
    emailSubject: z.string().optional(),
    emailMessage: z.string().optional(),
  }),
});

export const createLeaseTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Template name is required'),
    propertyType: z.string().optional(),
    description: z.string().optional(),
    defaultTerms: z.record(z.any()).optional(),
    clauses: z.array(z.any()).optional(),
  }),
});

export const updateLeaseTemplateSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    propertyType: z.string().optional(),
    description: z.string().optional(),
    defaultTerms: z.record(z.any()).optional(),
    clauses: z.array(z.any()).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createLeaseClauseSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Clause title is required'),
    content: z.string().min(1, 'Clause content is required'),
    category: z.enum(['general', 'payment', 'termination', 'use']).optional(),
    isStandard: z.boolean().optional(),
  }),
});
