-- DropConstraint / DropIndex
ALTER TABLE "gl_accounts" DROP CONSTRAINT IF EXISTS "gl_accounts_code_company_id_key";
DROP INDEX IF EXISTS "gl_accounts_code_company_id_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "gl_accounts_code_company_id_department_center_id_cost_cente_key" ON "gl_accounts"("code", "company_id", "department_center_id", "cost_center_id");
