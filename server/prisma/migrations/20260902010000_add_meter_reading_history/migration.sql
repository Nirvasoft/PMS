-- CreateTable
CREATE TABLE "meter_reading_history" (
    "id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "meter_type" VARCHAR(20) NOT NULL,
    "meter_serial_no" VARCHAR(100) NOT NULL,
    "reading_value" DECIMAL(12,3) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_reading_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_reading_history_unit_id_idx" ON "meter_reading_history"("unit_id");

-- CreateIndex
CREATE INDEX "meter_reading_history_meter_id_idx" ON "meter_reading_history"("meter_id");

-- AddForeignKey
ALTER TABLE "meter_reading_history" ADD CONSTRAINT "meter_reading_history_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "utility_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_reading_history" ADD CONSTRAINT "meter_reading_history_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_reading_history" ADD CONSTRAINT "meter_reading_history_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
