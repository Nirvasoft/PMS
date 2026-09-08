-- CreateTable
CREATE TABLE "meter_billing_records" (
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

    CONSTRAINT "meter_billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_billing_records_property_id_idx" ON "meter_billing_records"("property_id");

-- CreateIndex
CREATE INDEX "meter_billing_records_company_id_idx" ON "meter_billing_records"("company_id");

-- CreateIndex
CREATE INDEX "meter_billing_records_unit_id_idx" ON "meter_billing_records"("unit_id");

-- CreateIndex
CREATE INDEX "meter_billing_records_bill_date_idx" ON "meter_billing_records"("bill_date");

-- AddForeignKey
ALTER TABLE "meter_billing_records" ADD CONSTRAINT "meter_billing_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_billing_records" ADD CONSTRAINT "meter_billing_records_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_billing_records" ADD CONSTRAINT "meter_billing_records_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
