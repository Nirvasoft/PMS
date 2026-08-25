import { z } from 'zod';

export const createTenantSchema = z.object({
  tenantType: z.enum(['individual', 'company', 'corporate']),
  // Individual fields
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  fatherName: z.string().max(100).optional().nullable(),
  dateOfBirth: z.string().optional().nullable().transform(val => val ? new Date(val) : null),
  gender: z.string().max(10).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  idType: z.string().max(30).optional().nullable(),
  idNumber: z.string().max(100).optional().nullable(),
  idExpiryDate: z.string().optional().nullable().transform(val => val ? new Date(val) : null),
  fatherNrc: z.string().max(50).optional().nullable(),
  maritalStatus: z.enum(['single', 'married']).optional().nullable(),
  // Company fields
  companyName: z.string().max(255).optional().nullable(),
  companyRegNo: z.string().max(100).optional().nullable(),
  companyType: z.string().max(50).optional().nullable(),
  gstRegNo: z.string().max(50).optional().nullable(),
  // Contact
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  // Contact person
  contactPersonName: z.string().max(200).optional().nullable(),
  contactPersonPhone: z.string().max(50).optional().nullable(),
  contactPersonEmail: z.string().email().max(255).optional().nullable().or(z.literal('')),
  contactPersonRole: z.string().max(100).optional().nullable(),
  // Meta
  avatarUrl: z.string().max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  source: z.string().max(50).optional().nullable(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const createKycRequirementSchema = z.object({
  tenantType: z.enum(['individual', 'company', 'corporate']),
  docType: z.string().max(100),
  name: z.string().max(255),
  description: z.string().optional().nullable(),
  isRequired: z.boolean().optional(),
  validityDays: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateKycRequirementSchema = createKycRequirementSchema.partial();

export const submitKycDocumentSchema = z.object({
  requirementId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const reviewKycDocumentSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional().nullable(),
});

export const blacklistTenantSchema = z.object({
  reason: z.string(),
  scope: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  notes: z.string().optional().nullable(),
});

export const whitelistTenantSchema = z.object({
  reason: z.string(),
  notes: z.string().optional().nullable(),
});

export const createEmergencyContactSchema = z.object({
  name: z.string().max(200),
  relationship: z.string().max(100),
  phone: z.string().max(50),
  mobile: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateEmergencyContactSchema = createEmergencyContactSchema.partial();

export const createTenantNoteSchema = z.object({
  content: z.string(),
  isPinned: z.boolean().optional(),
});

export const updateTenantNoteSchema = createTenantNoteSchema.partial();
