-- AlterTable
ALTER TABLE "billing_schedules" ADD COLUMN "department_center_id" UUID,
ADD COLUMN "cost_center_id" UUID;

-- CreateIndex
CREATE INDEX "billing_schedules_department_center_id_idx" ON "billing_schedules"("department_center_id");

-- CreateIndex
CREATE INDEX "billing_schedules_cost_center_id_idx" ON "billing_schedules"("cost_center_id");

-- AddForeignKey
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_department_center_id_fkey" FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_schedules" ADD CONSTRAINT "billing_schedules_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
