-- CreateTable
CREATE TABLE "department_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "department_center_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "gl_accounts"
ADD COLUMN "department_center_id" UUID,
ADD COLUMN "cost_center_id" UUID;

-- CreateIndex
CREATE INDEX "department_centers_company_id_idx" ON "department_centers"("company_id");
CREATE UNIQUE INDEX "department_centers_code_company_id_key" ON "department_centers"("code", "company_id");

-- CreateIndex
CREATE INDEX "cost_centers_company_id_idx" ON "cost_centers"("company_id");
CREATE INDEX "cost_centers_department_center_id_idx" ON "cost_centers"("department_center_id");
CREATE UNIQUE INDEX "cost_centers_code_company_id_key" ON "cost_centers"("code", "company_id");

-- CreateIndex
CREATE INDEX "gl_accounts_department_center_id_idx" ON "gl_accounts"("department_center_id");
CREATE INDEX "gl_accounts_cost_center_id_idx" ON "gl_accounts"("cost_center_id");

-- AddForeignKey
ALTER TABLE "department_centers" ADD CONSTRAINT "department_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_department_center_id_fkey" FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_department_center_id_fkey" FOREIGN KEY ("department_center_id") REFERENCES "department_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
