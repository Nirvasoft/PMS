-- Migration: add action and company_id columns to meter_rate_history
-- The meter_rate_history table was defined in schema but may not exist yet; create it fully.

DO $$
BEGIN
  -- Create the table if it doesn't exist yet
  CREATE TABLE IF NOT EXISTS meter_rate_history (
    id           UUID NOT NULL DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL,
    meter_setup_id UUID NOT NULL,
    old_rate     DECIMAL(10,4),
    new_rate     DECIMAL(10,4),
    action       VARCHAR(20) NOT NULL DEFAULT 'update',
    changed_by   UUID NOT NULL,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT meter_rate_history_pkey PRIMARY KEY (id)
  );

  -- Add company_id column if it doesn't exist (for tables that were created before this migration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meter_rate_history' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE meter_rate_history ADD COLUMN company_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;

  -- Add action column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meter_rate_history' AND column_name = 'action'
  ) THEN
    ALTER TABLE meter_rate_history ADD COLUMN action VARCHAR(20) NOT NULL DEFAULT 'update';
  END IF;

  -- Make new_rate nullable if it isn't already
  ALTER TABLE meter_rate_history ALTER COLUMN new_rate DROP NOT NULL;

  -- Add foreign key constraints if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meter_rate_history_meter_setup_id_fkey'
      AND table_name = 'meter_rate_history'
  ) THEN
    ALTER TABLE meter_rate_history
      ADD CONSTRAINT meter_rate_history_meter_setup_id_fkey
      FOREIGN KEY (meter_setup_id) REFERENCES meter_setups(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meter_rate_history_changed_by_fkey'
      AND table_name = 'meter_rate_history'
  ) THEN
    ALTER TABLE meter_rate_history
      ADD CONSTRAINT meter_rate_history_changed_by_fkey
      FOREIGN KEY (changed_by) REFERENCES users(id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS meter_rate_history_meter_setup_id_idx ON meter_rate_history(meter_setup_id);
CREATE INDEX IF NOT EXISTS meter_rate_history_company_id_idx ON meter_rate_history(company_id);
