import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

// Log slow queries in development
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error('❌ Database connection failed', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

// ─────────────────────────────────────────────
// MULTI-TENANT RLS HELPERS
// ─────────────────────────────────────────────

/**
 * Set the PostgreSQL session variable for RLS tenant isolation.
 * Must be called within a transaction (SET LOCAL) or at connection level (SET).
 * 
 * Uses SET LOCAL so the variable is scoped to the current transaction only,
 * preventing tenant context from leaking across pooled connections.
 */
export async function setTenantContext(companyId: string): Promise<void> {
  // Validate UUID format to prevent SQL injection
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(companyId)) {
    throw new Error(`Invalid companyId format: ${companyId}`);
  }
  await prisma.$executeRawUnsafe(`SET app.current_company_id = '${companyId}'`);
}

/**
 * Execute a callback within a tenant-scoped transaction.
 * Sets the RLS session variable, runs the callback, then the transaction ends
 * and the variable is automatically cleared.
 * 
 * Use this for background jobs, cron tasks, or any code that runs
 * outside the normal request lifecycle.
 */
export async function withTenantContext<T>(
  companyId: string,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      throw new Error(`Invalid companyId format: ${companyId}`);
    }
    await tx.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${companyId}'`);
    return fn(tx);
  });
}
