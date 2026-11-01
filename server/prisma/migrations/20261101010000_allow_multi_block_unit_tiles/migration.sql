-- Allow multiple floor plan blocks for the same unit (L, T, U, and stepped unit shapes)
ALTER TABLE "mall_floor_plan_items" DROP CONSTRAINT IF EXISTS "mall_floor_plan_items_unit_id_key";
DROP INDEX IF EXISTS "mall_floor_plan_items_unit_id_key";
CREATE INDEX IF NOT EXISTS "mall_floor_plan_items_unit_id_idx" ON "mall_floor_plan_items"("unit_id");
