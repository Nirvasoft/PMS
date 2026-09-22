-- Make currency_rates.property_id nullable (already applied directly to DB; migration file was missing)
ALTER TABLE "currency_rates" ALTER COLUMN "property_id" DROP NOT NULL;
