import { prisma } from './database';
import { logger } from './logger';

let propertySetupScopePromise: Promise<void> | null = null;

/**
 * Ensures `property_id` column, indexes, and composite unique indexes exist on:
 * - charge_categories
 * - charge_types
 * - department_centers
 * - cost_centers
 * - payment_methods
 * - gl_accounts
 *
 * Also backfills existing company records (`property_id IS NULL`) to the company's
 * first active property so existing setup data is preserved under the primary property.
 */
export async function ensurePropertySetupScope(): Promise<void> {
  if (!propertySetupScopePromise) {
    propertySetupScopePromise = runPropertySetupScopeMigration().catch((err) => {
      logger.warn('Could not complete property setup scope migration automatically', err);
      propertySetupScopePromise = null;
    });
  }
  return propertySetupScopePromise;
}

async function runPropertySetupScopeMigration(): Promise<void> {
  // Ensure payment_methods table exists first
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "payment_methods" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "company_id" UUID NOT NULL,
      "property_id" UUID,
      "department_center_id" UUID,
      "cost_center_id" UUID,
      "code" VARCHAR(50) NOT NULL,
      "name" VARCHAR(150) NOT NULL,
      "gl_account_code" VARCHAR(50),
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "is_system" BOOLEAN NOT NULL DEFAULT false,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
    )
  `);

  const tables = [
    'charge_categories',
    'charge_types',
    'department_centers',
    'cost_centers',
    'payment_methods',
    'gl_accounts',
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "property_id" UUID`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${table}_property_id_idx" ON "${table}"("property_id")`,
    );
  }

  // Drop legacy company-only unique constraints and indexes so each property can maintain its own codes
  const legacyConstraints = [
    { table: 'charge_categories', name: 'charge_categories_code_company_id_key' },
    { table: 'charge_types', name: 'charge_types_code_company_id_key' },
    { table: 'department_centers', name: 'department_centers_code_company_id_key' },
    { table: 'cost_centers', name: 'cost_centers_code_company_id_key' },
    { table: 'payment_methods', name: 'payment_methods_code_company_id_key' },
    { table: 'gl_accounts', name: 'gl_accounts_code_company_id_key' },
    { table: 'gl_accounts', name: 'gl_accounts_code_company_id_department_center_id_cost_cente_key' },
  ];

  for (const item of legacyConstraints) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${item.table}" DROP CONSTRAINT IF EXISTS "${item.name}"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${item.name}"`,
    );
  }

  // Create property-scoped unique indexes
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "charge_categories_code_company_id_property_id_key" ON "charge_categories"("code", "company_id", "property_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "charge_types_code_company_id_property_id_key" ON "charge_types"("code", "company_id", "property_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "department_centers_code_company_id_property_id_key" ON "department_centers"("code", "company_id", "property_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_code_company_id_property_id_key" ON "cost_centers"("code", "company_id", "property_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_code_company_id_property_id_key" ON "payment_methods"("code", "company_id", "property_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "gl_accounts_code_company_id_property_id_dept_cc_key" ON "gl_accounts"("code", "company_id", "property_id", "department_center_id", "cost_center_id")`,
  );

  // Backfill existing company-scoped records with property_id IS NULL to the company's first active property
  await prisma.$executeRawUnsafe(`
    UPDATE "charge_categories" t
    SET "property_id" = (
      SELECT p."id" FROM "properties" p
      WHERE p."company_id" = t."company_id" AND p."deleted_at" IS NULL
      ORDER BY p."created_at" ASC
      LIMIT 1
    )
    WHERE t."company_id" IS NOT NULL
      AND t."property_id" IS NULL
      AND t."is_system" = false
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "charge_types" t
    SET "property_id" = (
      SELECT p."id" FROM "properties" p
      WHERE p."company_id" = t."company_id" AND p."deleted_at" IS NULL
      ORDER BY p."created_at" ASC
      LIMIT 1
    )
    WHERE t."company_id" IS NOT NULL
      AND t."property_id" IS NULL
      AND t."is_system" = false
  `);

  for (const table of ['department_centers', 'cost_centers', 'payment_methods', 'gl_accounts']) {
    await prisma.$executeRawUnsafe(`
      UPDATE "${table}" t
      SET "property_id" = (
        SELECT p."id" FROM "properties" p
        WHERE p."company_id" = t."company_id" AND p."deleted_at" IS NULL
        ORDER BY p."created_at" ASC
        LIMIT 1
      )
      WHERE t."company_id" IS NOT NULL
        AND t."property_id" IS NULL
    `);
  }
}

export async function resolveEffectivePropertyId(
  companyId: string,
  propertyId?: string | null,
): Promise<string | null> {
  if (propertyId && propertyId.trim()) {
    return propertyId.trim();
  }
  const firstProp = await prisma.property.findFirst({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return firstProp?.id || null;
}
