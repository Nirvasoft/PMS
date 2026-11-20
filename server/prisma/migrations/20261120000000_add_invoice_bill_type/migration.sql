-- Add bill_type column ('monthly' | 'rental' | 'deposit' | 'other') to invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "bill_type" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "invoices_company_id_bill_type_idx" ON "invoices" ("company_id", "bill_type");

-- Backfill existing invoices from invoice_lines + charge_types + charge_categories (property-specific priority)
UPDATE "invoices" i
SET "bill_type" = COALESCE(
  (
    SELECT CASE
      WHEN bool_or(COALESCE(cc_prop."monthly", cc_co."monthly", cc_sys."monthly", false)) THEN 'monthly'
      WHEN bool_or(LOWER(TRIM(COALESCE(ct."category", ''))) = 'rent' OR UPPER(TRIM(COALESCE(ct."code", ''))) = 'RENT') THEN 'rental'
      WHEN bool_or(LOWER(TRIM(COALESCE(ct."category", ''))) = 'deposit' OR UPPER(TRIM(COALESCE(ct."code", ''))) IN ('DEPOSIT', 'SECURITY_DEPOSIT')) THEN 'deposit'
      ELSE 'other'
    END
    FROM "invoice_lines" il
    JOIN "charge_types" ct ON ct."id" = il."charge_type_id"
    LEFT JOIN "charge_categories" cc_prop
      ON cc_prop."company_id" = i."company_id"
      AND cc_prop."property_id" = i."property_id"
      AND cc_prop."is_active" = true
      AND LOWER(TRIM(cc_prop."code")) = LOWER(TRIM(ct."category"))
    LEFT JOIN "charge_categories" cc_co
      ON cc_co."company_id" = i."company_id"
      AND cc_co."property_id" IS NULL
      AND cc_co."is_active" = true
      AND LOWER(TRIM(cc_co."code")) = LOWER(TRIM(ct."category"))
    LEFT JOIN "charge_categories" cc_sys
      ON cc_sys."company_id" IS NULL
      AND cc_sys."is_active" = true
      AND LOWER(TRIM(cc_sys."code")) = LOWER(TRIM(ct."category"))
    WHERE il."invoice_id" = i."id"
  ),
  'other'
)
WHERE i."bill_type" IS NULL;
