-- Shop Directory "Map" view: tile positions and per-floor scale.
CREATE TABLE IF NOT EXISTS "mall_floor_plan_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "floor_key" VARCHAR(80) NOT NULL,
  "kind" VARCHAR(30) NOT NULL DEFAULT 'unit',
  "unit_id" UUID,
  "label" VARCHAR(100),
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "w" INTEGER NOT NULL,
  "h" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mall_floor_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mall_floor_plan_items_unit_id_key" ON "mall_floor_plan_items"("unit_id");
CREATE INDEX IF NOT EXISTS "mall_floor_plan_items_property_id_floor_key_idx" ON "mall_floor_plan_items"("property_id", "floor_key");
CREATE INDEX IF NOT EXISTS "mall_floor_plan_items_company_id_idx" ON "mall_floor_plan_items"("company_id");

CREATE TABLE IF NOT EXISTS "mall_floor_plan_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "floor_key" VARCHAR(80) NOT NULL,
  "sqft_per_cell" DECIMAL(10,2) NOT NULL DEFAULT 50,
  "columns" INTEGER NOT NULL DEFAULT 60,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mall_floor_plan_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mall_floor_plan_settings_property_id_floor_key_key" ON "mall_floor_plan_settings"("property_id", "floor_key");
CREATE INDEX IF NOT EXISTS "mall_floor_plan_settings_company_id_idx" ON "mall_floor_plan_settings"("company_id");
