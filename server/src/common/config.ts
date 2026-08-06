import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function intEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function boolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: intEnv('PORT', 3000),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  redis: {
    url: optionalEnv('REDIS_URL', ''),
    prefix: optionalEnv('REDIS_PREFIX', 'pms:'),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    accessExpiry: intEnv('JWT_ACCESS_EXPIRY', 900),        // 15 minutes
    refreshExpiry: intEnv('JWT_REFRESH_EXPIRY', 86400),     // 1 day
    refreshExpiryLong: intEnv('JWT_REFRESH_EXPIRY_LONG', 2592000), // 30 days
    mfaSecret: requireEnv('JWT_MFA_SECRET'),
    mfaExpiry: intEnv('JWT_MFA_EXPIRY', 300),               // 5 minutes
  },

  encryption: {
    key: requireEnv('ENCRYPTION_KEY'),
    ivLength: intEnv('ENCRYPTION_IV_LENGTH', 16),
  },

  rateLimit: {
    auth: {
      ttl: intEnv('AUTH_RATE_LIMIT_TTL', 60),
      max: intEnv('AUTH_RATE_LIMIT_MAX', 10),
    },
  },

  hibp: {
    apiUrl: optionalEnv('HIBP_API_URL', 'https://api.pwnedpasswords.com'),
    enabled: boolEnv('HIBP_CHECK_ENABLED', false),
  },

  google: {
    clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
    clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
    calendarRedirectUri: optionalEnv('GOOGLE_CALENDAR_REDIRECT_URI', ''),
  },

  stripe: {
    secretKey: optionalEnv('STRIPE_SECRET_KEY', ''),
    webhookSecret: optionalEnv('STRIPE_WEBHOOK_SECRET', ''),
    apiVersion: optionalEnv('STRIPE_API_VERSION', '2024-06-20'),
  },
} as const;
