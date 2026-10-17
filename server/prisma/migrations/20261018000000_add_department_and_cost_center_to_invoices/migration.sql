-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "department_center_id" UUID,
ADD COLUMN "cost_center_id" UUID;

-- CreateIndex
CREATE INDEX "invoices_department_center_id_idx" ON "invoices"("department_center_id");

-- CreateIndex
CREATE INDEX "invoices_cost_center_id_idx" ON "invoices"("cost_center_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_department_center_id_fkey" FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
