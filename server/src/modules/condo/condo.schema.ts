import { z } from 'zod';

// ── Smart Meter Readings ──
export const addMeterReadingSchema = z.object({
  body: z.object({
    readingValue: z.number().positive(),
    readingAt: z.string(),
    source: z.enum(['manual', 'smart_meter', 'api']).default('manual'),
    isEstimated: z.boolean().default(false),
    notes: z.string().optional(),
  }),
});

export const upsertSmartDeviceSchema = z.object({
  body: z.object({
    protocol: z.enum(['modbus_tcp', 'mqtt', 'http', 'lora']),
    host: z.string().optional(),
    port: z.number().int().optional(),
    modbusUnitId: z.number().int().optional(),
    mqttTopic: z.string().optional(),
    mqttBroker: z.string().optional(),
    httpEndpoint: z.string().optional(),
    pollingIntervalMinutes: z.number().int().min(1).default(60),
  }),
});

// ── Funds ──
export const createFundAccountSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    fundType: z.enum(['sinking_fund', 'management_fund', 'reserve_fund']),
    name: z.string().min(1).max(150),
    description: z.string().optional(),
    openingBalance: z.number().default(0),
    currency: z.string().length(3).default('USD'),
    bankAccountId: z.string().uuid().optional(),
    fiscalYear: z.number().int(),
  }),
});

export const addFundTransactionSchema = z.object({
  body: z.object({
    transactionType: z.enum(['contribution', 'expenditure', 'interest', 'transfer']),
    amount: z.number().positive(),
    description: z.string().min(1),
    transactionDate: z.string(),
    referenceType: z.enum(['invoice', 'receipt', 'approval', 'manual']).optional(),
    referenceId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

// ── Meetings ──
export const createMeetingSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    meetingType: z.enum(['AGM', 'EGM']),
    title: z.string().min(1).max(255),
    fiscalYear: z.number().int().optional(),
    scheduledAt: z.string(),
    venue: z.string().optional(),
    quorumPercentage: z.number().min(0).max(100).default(30),
    noticeDaysRequired: z.number().int().default(14),
    agenda: z.array(z.object({
      item: z.number().int(),
      description: z.string(),
    })).default([]),
  }),
});

export const addResolutionSchema = z.object({
  body: z.object({
    resolutionNo: z.number().int().positive(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    resolutionType: z.enum(['ordinary', 'special', 'unanimous']).default('ordinary'),
  }),
});

export const castVoteSchema = z.object({
  body: z.object({
    vote: z.enum(['for', 'against', 'abstain']),
    unitId: z.string().uuid(),
    isProxy: z.boolean().default(false),
    proxyId: z.string().uuid().optional(),
  }),
});

export const submitProxySchema = z.object({
  body: z.object({
    unitId: z.string().uuid(),
    ownerName: z.string().min(1),
    proxyName: z.string().min(1),
    proxyIdNumber: z.string().optional(),
  }),
});

export const updateMeetingStatusSchema = z.object({
  body: z.object({
    status: z.enum(['planned', 'notice_sent', 'in_progress', 'completed', 'adjourned']),
    actualAttendees: z.number().int().optional(),
    quorumMet: z.boolean().optional(),
    minutesUrl: z.string().optional(),
  }),
});

// ── Bylaws ──
export const createBylawSchema = z.object({
  body: z.object({
    propertyId: z.string().uuid(),
    bylawNo: z.string().min(1).max(30),
    title: z.string().min(1).max(255),
    content: z.string().min(1),
    category: z.enum(['noise', 'pets', 'parking', 'renovation', 'common_area']).optional(),
    effectiveDate: z.string(),
  }),
});

export const createViolationSchema = z.object({
  body: z.object({
    bylawId: z.string().uuid(),
    unitId: z.string().uuid(),
    residentId: z.string().uuid().optional(),
    description: z.string().min(1),
    severity: z.enum(['warning', 'minor', 'major']).default('warning'),
    evidenceUrls: z.array(z.string()).default([]),
  }),
});

export const fineViolationSchema = z.object({
  body: z.object({
    fineAmount: z.number().positive(),
    notes: z.string().optional(),
  }),
});

export const appealViolationSchema = z.object({
  body: z.object({
    appealNotes: z.string().min(1),
  }),
});

export const resolveViolationSchema = z.object({
  body: z.object({
    resolutionNotes: z.string().min(1),
  }),
});
