-- Custom polygon unit shapes store up to 64 points in the tile label.
ALTER TABLE "mall_floor_plan_items" ALTER COLUMN "label" TYPE VARCHAR(1000);
