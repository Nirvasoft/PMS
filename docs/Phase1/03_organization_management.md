# Module 1.3 — Organization Management

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Status:** ✅ Implemented  
**Depends On:** Module 1.1, 1.2

---

## Overview

Defines the multi-tenant hierarchy: Company → Branch → Property → Business Unit, plus Region groupings for portfolio-level reporting. Every data record in the system is scoped to a node in this hierarchy via `company_id` and optionally `property_id`.

**Multi-tenancy** is enforced at the database level via **PostgreSQL Row-Level Security (RLS)** on all 48 company-scoped tables. Each authenticated request sets a session variable `app.current_company_id`, and RLS policies automatically filter all queries. This means even if application code omits a `WHERE company_id = ...`, the database still blocks cross-company data access.

**Company login** uses a unique `code` field (e.g. `ACME`) that users type on the login page. When only one company exists, the company code field is auto-filled and hidden.

---

## DB Schema

### SQL DDL

```sql
-- Companies (top-level tenant, supports holding + subsidiary structure)
CREATE TABLE companies (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  code             VARCHAR(20) UNIQUE,                  -- Short code for login (e.g. 'ACME')
  name             VARCHAR(255) NOT NULL,
  legal_name       VARCHAR(255),
  company_type     VARCHAR(30) NOT NULL DEFAULT 'standalone',
                   -- 'holding' | 'subsidiary' | 'standalone'
  registration_no  VARCHAR(100),
  tax_id           VARCHAR(100),
  industry         VARCHAR(100),
  phone            VARCHAR(50),
  email            VARCHAR(255),
  website          VARCHAR(255),
  address_line1    VARCHAR(255),
  address_line2    VARCHAR(255),
  city             VARCHAR(100),
  state            VARCHAR(100),
  postal_code      VARCHAR(20),
  country          VARCHAR(2) NOT NULL DEFAULT 'US',   -- ISO 3166-1 alpha-2
  timezone         VARCHAR(60) DEFAULT 'UTC',
  currency         VARCHAR(3) DEFAULT 'USD',           -- ISO 4217
  logo_url         VARCHAR(500),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  settings         JSONB DEFAULT '{}',                 -- company-level feature flags
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_companies_parent ON companies(parent_id);
CREATE UNIQUE INDEX idx_companies_code ON companies(code) WHERE code IS NOT NULL;

-- Branches (physical office locations of a company)
CREATE TABLE branches (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(50),
  manager_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  phone        VARCHAR(50),
  email        VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city         VARCHAR(100),
  state        VARCHAR(100),
  postal_code  VARCHAR(20),
  country      VARCHAR(2) DEFAULT 'US',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_branch_code_company UNIQUE (code, company_id)
);

-- Regions (geographic groupings for reporting; many-to-many with properties)
CREATE TABLE regions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(50),
  description TEXT,
  manager_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_region_code_company UNIQUE (code, company_id)
);

-- Business Units (P&L reporting centers; linked to a company, optional branch)
CREATE TABLE business_units (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id) ON DELETE SET NULL,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(50),
  manager_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bu_code_company UNIQUE (code, company_id)
);

-- Properties table (used by all subsequent modules)
-- Full definition here; extended by Phase 2 Property Management module
CREATE TABLE properties (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
  business_unit_id UUID REFERENCES business_units(id) ON DELETE SET NULL,
  region_id        UUID REFERENCES regions(id) ON DELETE SET NULL,
  name             VARCHAR(255) NOT NULL,
  code             VARCHAR(50),
  property_type    VARCHAR(50) NOT NULL,
                   -- 'residential' | 'commercial' | 'retail' | 'mixed' | 'industrial'
  status           VARCHAR(30) NOT NULL DEFAULT 'active',
  address_line1    VARCHAR(255),
  address_line2    VARCHAR(255),
  city             VARCHAR(100),
  state            VARCHAR(100),
  postal_code      VARCHAR(20),
  country          VARCHAR(2),
  geo_lat          NUMERIC(9,6),
  geo_lng          NUMERIC(9,6),
  total_area_sqft  NUMERIC(12,2),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT uq_property_code_company UNIQUE (code, company_id)
);

CREATE INDEX idx_properties_company ON properties(company_id);
CREATE INDEX idx_properties_region ON properties(region_id);

-- Region ↔ Property (many-to-many)
CREATE TABLE region_properties (
  region_id   UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  PRIMARY KEY (region_id, property_id)
);

-- Company settings (feature flags, module toggles per company)
-- Stored in companies.settings JSONB; helper view for readability:
CREATE VIEW company_feature_flags AS
SELECT
  id AS company_id,
  (settings->>'mall_module_enabled')::boolean AS mall_module_enabled,
  (settings->>'condo_module_enabled')::boolean AS condo_module_enabled,
  (settings->>'visitor_mgmt_enabled')::boolean AS visitor_mgmt_enabled,
  (settings->>'online_payment_enabled')::boolean AS online_payment_enabled,
  (settings->>'max_properties')::int AS max_properties,
  (settings->>'subscription_plan')::text AS subscription_plan
FROM companies;
```

### TypeORM Entities

```typescript
// src/modules/organization/entities/company.entity.ts
@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'parent_id', nullable: true }) parentId: string | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Company | null;

  @OneToMany(() => Company, (c) => c.parent)
  subsidiaries: Company[];

  @Column({ length: 20, unique: true, nullable: true }) code: string | null;  // e.g. 'ACME'
  @Column({ length: 255 }) name: string;
  @Column({ name: 'legal_name', nullable: true }) legalName: string | null;
  @Column({ name: 'company_type', length: 30, default: 'standalone' }) companyType: string;
  @Column({ name: 'registration_no', nullable: true }) registrationNo: string | null;
  @Column({ name: 'tax_id', nullable: true }) taxId: string | null;
  @Column({ nullable: true }) currency: string;
  @Column({ nullable: true }) timezone: string;
  @Column({ name: 'logo_url', nullable: true }) logoUrl: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ type: 'jsonb', default: {} }) settings: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt: Date | null;
}
```

---

## Server-Side Architecture

```
src/modules/organization/
├── organization.module.ts
├── companies.controller.ts
├── companies.service.ts
├── branches.controller.ts
├── branches.service.ts
├── regions.controller.ts
├── regions.service.ts
├── business-units.controller.ts
├── business-units.service.ts
├── properties.controller.ts          # stub — extended in Phase 2
├── dto/
│   ├── create-company.dto.ts
│   ├── update-company.dto.ts
│   ├── create-branch.dto.ts
│   ├── create-region.dto.ts
│   ├── create-business-unit.dto.ts
│   └── create-property-stub.dto.ts
└── entities/
    ├── company.entity.ts
    ├── branch.entity.ts
    ├── region.entity.ts
    ├── business-unit.entity.ts
    └── property.entity.ts
```

### Tenant Context Middleware (PostgreSQL RLS)

Data isolation is enforced at the database level using **PostgreSQL Row-Level Security (RLS)**. All 48 company-scoped tables have an RLS policy:

```sql
-- Helper function to read the session variable
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Applied to all company-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (company_id = current_tenant_id())
  WITH CHECK (company_id = current_tenant_id());
```

The middleware sets this variable on every authenticated request:

```typescript
// src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from 'express';
import { setTenantContext } from '../common/database';

export async function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.companyId) {
    await setTenantContext(req.user.companyId);
  }
  next();
}

// src/common/database.ts
export async function setTenantContext(companyId: string) {
  await prisma.$executeRawUnsafe(`SET app.current_company_id = '${companyId}'`);
}
```

> **Important:** The database connection uses a non-superuser role (`pms_app`). PostgreSQL superusers bypass RLS even with `FORCE ROW LEVEL SECURITY`, so the application must connect as a regular user.

> **Cron jobs:** Background jobs that query RLS-protected tables iterate over all active companies and set tenant context per company. See billing/lease cron jobs for the pattern.

---

## API Contract

### `GET /companies`
**Access:** Super-admin or company admin (sees own + subsidiaries)

### `POST /companies`
**Access:** Super-admin

```json
{
  "name": "ACME Real Estate Group",
  "legalName": "ACME RE Holdings Pte Ltd",
  "companyType": "holding",
  "registrationNo": "202400001A",
  "taxId": "T24-00001",
  "currency": "USD",
  "timezone": "Asia/Singapore",
  "country": "SG",
  "settings": {
    "mallModuleEnabled": false,
    "condoModuleEnabled": true,
    "maxProperties": 50,
    "subscriptionPlan": "enterprise"
  }
}
```

### `GET /companies/:id`
### `PUT /companies/:id`
### `POST /companies/:id/logo` (multipart)

---

### `GET /companies/:companyId/branches`
### `POST /companies/:companyId/branches`

```json
{
  "name": "Singapore HQ",
  "code": "SG-HQ",
  "managerId": "uuid",
  "phone": "+65-6000-0000",
  "address_line1": "1 Marina Blvd",
  "city": "Singapore",
  "country": "SG"
}
```

### `GET /regions`
### `POST /regions`
### `PUT /regions/:id`
### `POST /regions/:id/properties`  — add property to region
### `DELETE /regions/:id/properties/:propertyId`

### `GET /business-units`
### `POST /business-units`

---

## Admin Provisioning API

### Base URL: `/api/v1/admin`

These endpoints are protected by the `companies.provision` permission, which is assigned only to the system operator's Super Admin role.

### `POST /admin/companies/provision`
**Access:** Requires `companies.provision` permission

Creates a fully bootstrapped company in one API call.

**Request Body:**
```json
{
  "name": "Golden Star Properties",
  "legalName": "Golden Star Properties Co., Ltd",
  "country": "MM",
  "currency": "MMK",
  "timezone": "Asia/Yangon",
  "email": "info@goldenstar.com",
  "adminEmail": "admin@goldenstar.com",
  "adminFirstName": "Kyaw",
  "adminLastName": "Win"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "company": { "id": "uuid", "code": "GOLDENST", "name": "Golden Star Properties" },
    "admin": { "id": "uuid", "email": "admin@goldenstar.com", "temporaryPassword": "Xy6jD!fe3rcR" },
    "summary": { "rolesCreated": 5, "departmentsCreated": 6 }
  }
}
```

**What gets created automatically:**
- Company record with auto-generated code
- Super Admin role with all permissions
- Default roles: Property Manager, Finance, Maintenance, Viewer
- Default departments: HQ, Finance, Operations, Maintenance, IT, HR
- Password policy with sensible defaults
- First admin user with `mustChangePassword: true`

### `GET /admin/companies`
**Access:** Requires `companies.provision` permission

Lists all companies with user and property counts.

### `POST /admin/companies/:id/deactivate`
**Access:** Requires `companies.provision` permission

Deactivates a company (users can no longer login).

### `POST /admin/companies/:id/activate`
**Access:** Requires `companies.provision` permission

Reactivates a deactivated company.

---

## Business Logic & Validation Rules

```
Company hierarchy rules:
- Max depth: 3 levels (Holding → Subsidiary → Standalone)
- Cannot set parent to own descendant (circular check)
- Subsidiary must belong to same country as holding (configurable per policy)
- Deleting a company: soft-delete only; cascade deactivate branches + properties

Feature flags:
- Stored in companies.settings JSONB
- Resolved at API layer; controllers check flag before allowing module access
- Super-admin can override any flag
- Feature flag changes: clear Redis permission cache for all company users

Property limit:
- settings.maxProperties enforced on POST /properties
- Returns 402 (Payment Required) if at limit with upgrade prompt message
```

---

## UI Screens & Component Breakdown

```
admin/organization/
├── CompanySettingsPage/
│   ├── tabs: General | Branding | Features | Subscription
│   ├── components/
│   │   ├── CompanyForm.tsx
│   │   ├── LogoUpload.tsx
│   │   ├── FeatureFlagsPanel.tsx     # toggle switches per module
│   │   └── SubsidiaryList.tsx        # list child companies

├── BranchesPage/
│   └── components/
│       ├── BranchTable.tsx
│       └── BranchFormModal.tsx

├── RegionsPage/
│   └── components/
│       ├── RegionList.tsx
│       ├── RegionPropertyPicker.tsx  # multi-select properties for a region
│       └── RegionFormModal.tsx

└── BusinessUnitsPage/
    └── components/
        ├── BusinessUnitTable.tsx
        └── BusinessUnitFormModal.tsx
```

---

## State Management

```typescript
// src/store/api/organizationApi.ts
export const organizationApi = createApi({
  reducerPath: 'organizationApi',
  tagTypes: ['Company', 'Branches', 'Regions', 'BusinessUnits', 'Properties'],
  endpoints: (builder) => ({
    getCompany: builder.query<Company, string>({
      query: (id) => `/companies/${id}`,
      providesTags: ['Company'],
    }),
    updateCompany: builder.mutation<Company, { id: string; data: UpdateCompanyDto }>({
      query: ({ id, data }) => ({ url: `/companies/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Company'],
    }),
    getBranches: builder.query<Branch[], string>({
      query: (companyId) => `/companies/${companyId}/branches`,
      providesTags: ['Branches'],
    }),
    createBranch: builder.mutation<Branch, { companyId: string; data: CreateBranchDto }>({
      query: ({ companyId, data }) => ({ url: `/companies/${companyId}/branches`, method: 'POST', body: data }),
      invalidatesTags: ['Branches'],
    }),
    getRegions: builder.query<Region[], void>({
      query: () => '/regions',
      providesTags: ['Regions'],
    }),
    getBusinessUnits: builder.query<BusinessUnit[], void>({
      query: () => '/business-units',
      providesTags: ['BusinessUnits'],
    }),
  }),
});
```
