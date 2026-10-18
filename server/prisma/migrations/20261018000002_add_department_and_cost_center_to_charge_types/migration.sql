-- AlterTable
ALTER TABLE "charge_types"
  ADD COLUMN IF NOT EXISTS "department_center_id" UUID,
  ADD COLUMN IF NOT EXISTS "cost_center_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "charge_types_department_center_id_idx" ON "charge_types"("department_center_id");
CREATE INDEX IF NOT EXISTS "charge_types_cost_center_id_idx" ON "charge_types"("cost_center_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'charge_types_department_center_id_fkey'
  ) THEN
    ALTER TABLE "charge_types"
      ADD CONSTRAINT "charge_types_department_center_id_fkey"
      FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'charge_types_cost_center_id_fkey'
  ) THEN
    ALTER TABLE "charge_types"
      ADD CONSTRAINT "charge_types_cost_center_id_fkey"
      FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill from linked GL accounts where available
UPDATE "charge_types" ct
SET
  "department_center_id" = COALESCE(ct."department_center_id", ga."department_center_id"),
  "cost_center_id" = COALESCE(ct."cost_center_id", ga."cost_center_id")
FROM "gl_accounts" ga
WHERE ct."gl_account_code" = ga."code"
  AND (ct."company_id" = ga."company_id" OR ct."company_id" IS NULL);
