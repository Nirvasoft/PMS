-- AddColumn: tenants.property_id (nullable UUID FK → properties.id)
ALTER TABLE "tenants"
  ADD COLUMN "property_id" UUID;

-- FK constraint
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_property_id_fkey"
  FOREIGN KEY ("property_id")
  REFERENCES "properties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for fast property-scoped lookups
CREATE INDEX "tenants_property_id_idx" ON "tenants"("property_id");
