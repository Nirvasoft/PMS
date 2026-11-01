-- Visual tilt (degrees, multiples of 15) for unit cards and landmarks on the Shop Directory map
ALTER TABLE "mall_floor_plan_items" ADD COLUMN IF NOT EXISTS "angle" INTEGER NOT NULL DEFAULT 0;
