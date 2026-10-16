-- Add charge_type_id to meter_setups
ALTER TABLE "meter_setups"
ADD COLUMN IF NOT EXISTS "charge_type_id" UUID REFERENCES "charge_types"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "meter_setups_charge_type_id_idx" ON "meter_setups"("charge_type_id");

-- Widen maintenance_fee and rate decimal precision to avoid numeric overflow on large values
ALTER TABLE "meter_setups"
ALTER COLUMN "maintenance_fee" TYPE DECIMAL(15, 2),
ALTER COLUMN "rate" TYPE DECIMAL(15, 4);
