import { z } from 'zod';

// ── Login ─────────────────────────────────────

export const loginSchema = z.object({
  body: z.object({
    companyCode: z.string().max(20).default(''),
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
    deviceFingerprint: z.string().max(255).optional(),
    deviceName: z.string().max(255).optional(),
  }),
});

// ── MFA ───────────────────────────────────────

export const mfaVerifySchema = z.object({
  body: z.object({
    mfaToken: z.string().min(1, 'MFA token is required'),
    code: z.string().min(6).max(8, 'Code must be 6-8 characters'),
  }),
});

export const mfaEnableSchema = z.object({
  body: z.object({
    secret: z.string().min(1, 'Secret is required'),
    code: z.string().min(6).max(8, 'Code must be 6-8 characters'),
    backupCodes: z.array(z.string()).optional(),
  }),
});

export const mfaDisableSchema = z.object({
  body: z.object({
    code: z.string().min(6).max(8, 'Code must be 6-8 characters'),
  }),
});

// ── Password ──────────────────────────────────

export const passwordResetRequestSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const passwordResetSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const passwordChangeSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

// ── Logout ────────────────────────────────────

export const logoutSchema = z.object({
  body: z.object({
    allDevices: z.boolean().optional(),
  }),
});

// ── Email Verification ────────────────────────

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
});

// ── IP Policy (Admin) ─────────────────────────

export const createIpPolicySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['whitelist', 'blacklist']),
    ipRangeStart: z.string().min(1, 'IP range start is required'),
    ipRangeEnd: z.string().optional(),
    cidr: z.string().optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── Password Policy (Admin) ───────────────────

export const updatePasswordPolicySchema = z.object({
  body: z.object({
    minLength: z.number().int().min(6).max(128).optional(),
    requireUppercase: z.boolean().optional(),
    requireLowercase: z.boolean().optional(),
    requireNumbers: z.boolean().optional(),
    requireSpecialChars: z.boolean().optional(),
    maxAgeDays: z.number().int().min(0).max(365).optional(),
    historyCount: z.number().int().min(0).max(24).optional(),
    maxLoginAttempts: z.number().int().min(1).max(20).optional(),
    lockoutDurationMinutes: z.number().int().min(1).max(1440).optional(),
  }),
});

// ── SSO Config (Admin) ────────────────────────

export const createSsoConfigSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    provider: z.string().min(1).max(50),
    protocol: z.enum(['oidc', 'saml']).default('oidc'),
    clientId: z.string().max(500).optional(),
    clientSecret: z.string().max(500).optional(),
    issuerUrl: z.string().url().optional().or(z.literal('')),
    authorizationUrl: z.string().url().optional().or(z.literal('')),
    tokenUrl: z.string().url().optional().or(z.literal('')),
    userInfoUrl: z.string().url().optional().or(z.literal('')),
    scopes: z.string().max(500).optional(),
    autoProvision: z.boolean().optional(),
    defaultRoleId: z.string().uuid().optional().or(z.literal('')),
    domainRestriction: z.string().max(255).optional(),
    attributeMapping: z.record(z.string()).optional(),
  }),
});

export const updateSsoConfigSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    provider: z.string().min(1).max(50).optional(),
    protocol: z.enum(['oidc', 'saml']).optional(),
    clientId: z.string().max(500).optional(),
    clientSecret: z.string().max(500).optional(),
    issuerUrl: z.string().url().optional().or(z.literal('')),
    authorizationUrl: z.string().url().optional().or(z.literal('')),
    tokenUrl: z.string().url().optional().or(z.literal('')),
    userInfoUrl: z.string().url().optional().or(z.literal('')),
    scopes: z.string().max(500).optional(),
    autoProvision: z.boolean().optional(),
    defaultRoleId: z.string().uuid().optional().or(z.literal('')),
    domainRestriction: z.string().max(255).optional(),
    attributeMapping: z.record(z.string()).optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid config ID'),
  }),
});

export const toggleSsoConfigSchema = z.object({
  body: z.object({
    enabled: z.boolean({ required_error: 'enabled is required' }),
  }),
  params: z.object({
    id: z.string().uuid('Invalid config ID'),
  }),
});

// ── Params-only schemas ───────────────────────

export const uuidParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid ID'),
  }),
});

export const deviceIdParamSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid device ID'),
  }),
});
