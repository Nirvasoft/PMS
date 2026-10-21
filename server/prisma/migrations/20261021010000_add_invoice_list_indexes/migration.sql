-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_company_id_created_at_idx" ON "invoices"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_company_id_currency_created_at_idx" ON "invoices"("company_id", "currency", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_company_id_property_id_currency_created_at_idx" ON "invoices"("company_id", "property_id", "currency", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_company_id_status_created_at_idx" ON "invoices"("company_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_company_id_invoice_date_idx" ON "invoices"("company_id", "invoice_date" DESC);
