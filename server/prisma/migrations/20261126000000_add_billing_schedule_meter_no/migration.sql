-- Add meter_no column to billing_schedules to uniquely track per-meter billing schedules across recurring imports
ALTER TABLE "billing_schedules" ADD COLUMN IF NOT EXISTS "meter_no" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "billing_schedules_property_id_meter_no_idx"
  ON "billing_schedules" ("property_id", "meter_no");

-- Backfill Pass 1: Match existing meter billing schedules with meter_record_list by
-- (property_id, unit_id, start_date, end_date) in creation order (handles multi-meter units cleanly).
WITH ranked_sched AS (
  SELECT
    bs."id",
    bs."property_id",
    bs."unit_id",
    bs."start_date",
    bs."end_date",
    ROW_NUMBER() OVER (
      PARTITION BY bs."property_id", bs."unit_id", bs."start_date", bs."end_date"
      ORDER BY bs."created_at" ASC, bs."id" ASC
    ) AS rn
  FROM "billing_schedules" bs
  WHERE bs."meter_no" IS NULL
    AND bs."unit_id" IS NOT NULL
    AND bs."end_date" IS NOT NULL
    AND bs."status" <> 'cancelled'
    AND (
      bs."description" ~ '@[^ ]+ [A-Z][a-z]+ [0-9]{4}'
      OR bs."description" ~ '— .+ \([0-9]{4}-[0-9]{2}-[0-9]{2} to [0-9]{4}-[0-9]{2}-[0-9]{2}\)'
    )
),
ranked_mrl AS (
  SELECT
    mrl."property_id",
    mrl."unit_id",
    mrl."start_date",
    mrl."end_date",
    TRIM(mrl."meter_no") AS meter_no,
    ROW_NUMBER() OVER (
      PARTITION BY mrl."property_id", mrl."unit_id", mrl."start_date", mrl."end_date"
      ORDER BY mrl."created_at" ASC, mrl."id" ASC
    ) AS rn
  FROM "meter_record_list" mrl
  WHERE mrl."unit_id" IS NOT NULL
    AND TRIM(COALESCE(mrl."meter_no", '')) <> ''
)
UPDATE "billing_schedules" bs
SET "meter_no" = COALESCE(
  (
    SELECT TRIM(ms."meter_no")
    FROM "meter_setups" ms
    WHERE ms."property_id" = rm."property_id"
      AND ms."is_active" = true
      AND (
        LOWER(TRIM(ms."meter_no")) = LOWER(rm."meter_no")
        OR LTRIM(LOWER(TRIM(ms."meter_no")), '0') = LTRIM(LOWER(rm."meter_no"), '0')
      )
    ORDER BY (ms."charge_type_id" IS NOT NULL) DESC, ms."updated_at" DESC
    LIMIT 1
  ),
  rm."meter_no"
)
FROM ranked_sched rs
JOIN ranked_mrl rm
  ON rm."property_id" = rs."property_id"
  AND rm."unit_id" = rs."unit_id"
  AND rm."start_date" = rs."start_date"
  AND rm."end_date" = rs."end_date"
  AND rm."rn" = rs."rn"
WHERE bs."id" = rs."id"
  AND bs."meter_no" IS NULL;

-- Backfill Pass 2: Legacy schedules whose description embeds "— <MeterNo> (YYYY-MM-DD to YYYY-MM-DD)"
UPDATE "billing_schedules" bs
SET "meter_no" = TRIM((regexp_match(bs."description", '—\s*(.+?)\s*\([0-9]{4}-[0-9]{2}-[0-9]{2}\s+to\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\)'))[1])
WHERE bs."meter_no" IS NULL
  AND bs."description" ~ '—\s*.+?\s*\([0-9]{4}-[0-9]{2}-[0-9]{2}\s+to\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\)';
