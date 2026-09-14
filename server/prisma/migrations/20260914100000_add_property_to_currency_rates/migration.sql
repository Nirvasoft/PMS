-- Scope currency rates to a property: one base currency per property instead of per company.
-- currency_rates had no rows in this environment, so property_id can be NOT NULL directly.

-- DropIndex
DROP INDEX IF EXISTS "currency_rates_company_id_currency_idx";
DROP INDEX IF EXISTS "uq_currency_rate_company_pair_date";

-- AlterTable
ALTER TABLE "currency_rates" ADD COLUMN "property_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "currency_rates_property_id_idx" ON "currency_rates"("property_id");
CREATE INDEX "currency_rates_property_id_currency_idx" ON "currency_rates"("property_id", "currency");
CREATE UNIQUE INDEX "uq_currency_rate_property_pair_date" ON "currency_rates"("property_id", "base_currency", "currency", "effective_date");

-- AddForeignKey
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
