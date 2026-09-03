-- CreateTable
CREATE TABLE "role_properties" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_floors" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_floors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_property" ON "role_properties"("role_id", "property_id");

-- CreateIndex
CREATE INDEX "role_properties_property_id_idx" ON "role_properties"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_floor" ON "role_floors"("role_id", "floor_number");

-- AddForeignKey
ALTER TABLE "role_properties" ADD CONSTRAINT "role_properties_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_properties" ADD CONSTRAINT "role_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_floors" ADD CONSTRAINT "role_floors_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
