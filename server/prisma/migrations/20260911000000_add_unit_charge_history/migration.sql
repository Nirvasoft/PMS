-- CreateTable
CREATE TABLE "unit_charge_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "charge_id" UUID,
    "action" VARCHAR(20) NOT NULL,
    "charge_type_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "old_charge_type_id" UUID,
    "old_amount" DECIMAL(15,2),
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unit_charge_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "unit_charge_history_unit_id_idx" ON "unit_charge_history"("unit_id");

ALTER TABLE "unit_charge_history" ADD CONSTRAINT "unit_charge_history_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_charge_history" ADD CONSTRAINT "unit_charge_history_charge_type_id_fkey" FOREIGN KEY ("charge_type_id") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "unit_charge_history" ADD CONSTRAINT "unit_charge_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;