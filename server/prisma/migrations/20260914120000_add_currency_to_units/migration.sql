-- Add a Currency field to units, picked from Currency Setup (currency_rates) for the
-- property. Once a unit is saved with a currency it is locked in the app (see
-- units.service.ts update()) — this column just needs to hold the code.

-- AlterTable
ALTER TABLE "units" ADD COLUMN "currency" VARCHAR(3);
