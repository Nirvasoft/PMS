-- Table was empty (no production data); drop and recreate under the new name rather than
-- a bare RENAME, so constraint/index names stay consistent with the new table name too.

-- DropTable
DROP TABLE "meter_billing_records";

-- CreateTable
CREATE TABLE "meter_record_list" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_id" UUID,
    "meter_no" VARCHAR(50) NOT NULL,
    "meter_type" VARCHAR(50) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "start_unit" DECIMAL(14,2) NOT NULL,
    "end_unit" DECIMAL(14,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "bill_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "meter_record_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_record_list_property_id_idx" ON "meter_record_list"("property_id");

-- CreateIndex
CREATE INDEX "meter_record_list_company_id_idx" ON "meter_record_list"("company_id");

-- CreateIndex
CREATE INDEX "meter_record_list_unit_id_idx" ON "meter_record_list"("unit_id");

-- CreateIndex
CREATE INDEX "meter_record_list_bill_date_idx" ON "meter_record_list"("bill_date");

-- AddForeignKey
ALTER TABLE "meter_record_list" ADD CONSTRAINT "meter_record_list_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_record_list" ADD CONSTRAINT "meter_record_list_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_record_list" ADD CONSTRAINT "meter_record_list_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
