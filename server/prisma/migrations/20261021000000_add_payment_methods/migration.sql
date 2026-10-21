-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
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
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_methods_company_id_idx" ON "payment_methods"("company_id");
CREATE INDEX IF NOT EXISTS "payment_methods_department_center_id_idx" ON "payment_methods"("department_center_id");
CREATE INDEX IF NOT EXISTS "payment_methods_cost_center_id_idx" ON "payment_methods"("cost_center_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_methods_code_company_id_key" ON "payment_methods"("code", "company_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_company_id_fkey'
  ) THEN
    ALTER TABLE "payment_methods"
      ADD CONSTRAINT "payment_methods_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_department_center_id_fkey'
  ) THEN
    ALTER TABLE "payment_methods"
      ADD CONSTRAINT "payment_methods_department_center_id_fkey"
      FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_cost_center_id_fkey'
  ) THEN
    ALTER TABLE "payment_methods"
      ADD CONSTRAINT "payment_methods_cost_center_id_fkey"
      FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
