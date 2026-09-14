-- Add a Currency field to tenants, picked from Currency Setup (currency_rates) for the
-- active property. Once a tenant is saved with a currency it is locked in the app (see
-- tenants.service.ts update()).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "currency" VARCHAR(3);
