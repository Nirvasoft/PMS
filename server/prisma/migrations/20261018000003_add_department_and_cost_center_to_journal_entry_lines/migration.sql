-- AlterTable
ALTER TABLE "journal_entry_lines"
  ADD COLUMN IF NOT EXISTS "department_center_id" UUID,
  ADD COLUMN IF NOT EXISTS "cost_center_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "journal_entry_lines_department_center_id_idx" ON "journal_entry_lines"("department_center_id");
CREATE INDEX IF NOT EXISTS "journal_entry_lines_cost_center_id_idx" ON "journal_entry_lines"("cost_center_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_lines_department_center_id_fkey'
  ) THEN
    ALTER TABLE "journal_entry_lines"
      ADD CONSTRAINT "journal_entry_lines_department_center_id_fkey"
      FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_lines_cost_center_id_fkey'
  ) THEN
    ALTER TABLE "journal_entry_lines"
      ADD CONSTRAINT "journal_entry_lines_cost_center_id_fkey"
      FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill from linked GL accounts where available
UPDATE "journal_entry_lines" jel
SET
  "department_center_id" = COALESCE(jel."department_center_id", ga."department_center_id"),
  "cost_center_id" = COALESCE(jel."cost_center_id", ga."cost_center_id")
FROM "gl_accounts" ga
WHERE jel."account_id" = ga."id";
