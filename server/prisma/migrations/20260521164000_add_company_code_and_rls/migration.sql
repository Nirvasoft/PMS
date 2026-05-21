-- ============================================================
-- Multi-Company RLS (Row-Level Security) Migration
-- ============================================================
-- This migration:
-- 1. Adds the `code` column to companies (already applied via db push)
-- 2. Enables RLS on all 48 tables that have company_id
-- 3. Creates tenant isolation policies
--
-- IMPORTANT: The application MUST set the session variable
-- `app.current_company_id` before any query:
--   SET LOCAL app.current_company_id = '<uuid>';
--
-- Without this variable set, queries return ZERO rows (by design).
-- ============================================================

-- Step 1: Add code column to companies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'code'
  ) THEN
    ALTER TABLE companies ADD COLUMN code VARCHAR(20);
    UPDATE companies SET code = 'ACME' WHERE code IS NULL;
    ALTER TABLE companies ALTER COLUMN code SET NOT NULL;
    CREATE UNIQUE INDEX companies_code_key ON companies(code);
  END IF;
END $$;

-- Step 2: Create a helper function to get current tenant ID
-- Returns NULL if not set (RLS will block all rows)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_company_id', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 3: Enable RLS and create policies on all company-scoped tables
-- Using DO block for idempotent execution

DO $$ 
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'auth_audit_logs',
    'billing_schedules',
    'branches',
    'business_units',
    'charge_types',
    'departments',
    'document_folders',
    'documents',
    'fiscal_periods',
    'gl_accounts',
    'in_app_notifications',
    'invoices',
    'ip_policies',
    'journal_entries',
    'kyc_requirements',
    'leads',
    'lease_clauses',
    'lease_templates',
    'leases',
    'marketing_campaigns',
    'notification_logs',
    'notification_templates',
    'parking_allocations',
    'parking_slots',
    'parking_zones',
    'password_policies',
    'penalty_configurations',
    'positions',
    'properties',
    'receipts',
    'refund_requests',
    'regions',
    'roles',
    'saved_reports',
    'sso_configs',
    'tax_configurations',
    'tenant_blacklist_log',
    'tenant_credits',
    'tenant_vehicles',
    'tenants',
    'towers',
    'units',
    'user_invitations',
    'users',
    'utility_meters',
    'visitor_parking_passes',
    'workflow_definitions',
    'workflow_instances'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    -- Force RLS even for table owner (important for security)
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    
    -- Drop existing policy if any (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
    
    -- Create SELECT/UPDATE/DELETE policy (USING clause)
    -- Create INSERT policy (WITH CHECK clause)
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I 
        USING (company_id = current_tenant_id())
        WITH CHECK (company_id = current_tenant_id())',
      tbl, tbl
    );
    
    RAISE NOTICE 'RLS enabled on table: %', tbl;
  END LOOP;
END $$;

-- Step 4: The companies table itself does NOT get RLS
-- (we need to look up company by code during login, before we know the ID)

-- Step 5: Tables WITHOUT company_id that should remain unprotected:
-- These are reference/lookup tables or join tables that reference parent rows:
--   permissions, role_templates, property_types, facility_types, unit_types,
--   region_properties, property_photos, property_facilities, property_contacts,
--   property_status_history, tower_sections, unit_amenities, unit_status_history,
--   tenant_kyc_documents, tenant_emergency_contacts, tenant_notes,
--   lease_amendments, lease_escalation_schedule, esign_recipients,
--   workflow_tasks, workflow_history, notification_preferences,
--   sso_identities, document_versions, document_access_logs, document_shares,
--   widget_definitions, dashboard_layouts, lead_viewings, lead_activities,
--   invoice_lines, receipt_allocations, journal_entry_lines,
--   budgets, fixed_assets, depreciation_entries, asset_transfers,
--   bank_accounts, bank_statement_imports, bank_statement_lines,
--   refresh_tokens, user_devices, password_history,
--   email_verification_tokens, password_reset_tokens,
--   user_profiles, role_permissions, user_roles, user_permission_overrides

-- These are safe because they're always accessed through their parent
-- (which IS company-scoped), never directly by company_id.

-- RLS migration complete. 48 tables protected.
