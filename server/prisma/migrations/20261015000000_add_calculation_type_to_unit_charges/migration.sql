-- AlterTable
ALTER TABLE "unit_charges" ADD COLUMN IF NOT EXISTS "calculation_type" VARCHAR(20) NOT NULL DEFAULT 'fixed';
ALTER TABLE "unit_charges" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(15,2);
