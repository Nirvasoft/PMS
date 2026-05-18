# Module 2.3 — Tenant Management

**Phase:** 2 — Property Structure & Leasing  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 1.1, 1.2, 1.3, 1.6 (Documents)

---

## Overview

Central registry for all tenants (individuals and companies) across the portfolio. Manages the full tenant lifecycle from prospect to blacklist. Integrates with KYC verification, emergency contacts, document vault, and blacklist management.

**Key capabilities:**
- Individual and corporate tenant profiles
- KYC document checklist with verification workflow
- Emergency contact management
- Blacklist with reason, date, scope (company-wide or property-scoped)
- Tenant document vault (leverages Document Management)
- Tenant merge (duplicate detection and merging)
- Tenant history (all leases, payments, maintenance)
- Re-inquiry blocking for blacklisted tenants

---

## DB Schema

```sql
-- Tenants
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_type       VARCHAR(20) NOT NULL DEFAULT 'individual',
                    -- 'individual' | 'company'
  -- Individual fields
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  date_of_birth     DATE,
  gender            VARCHAR(10),
  nationality       VARCHAR(100),
  id_type           VARCHAR(30),                  -- 'passport' | 'nric' | 'fin' | 'driving_license'
  id_number         VARCHAR(100),
  id_expiry_date    DATE,
  -- Company fields
  company_name      VARCHAR(255),
  company_reg_no    VARCHAR(100),
  company_type      VARCHAR(50),                  -- 'private_limited' | 'partnership' | 'sole_prop' | 'public'
  gst_reg_no        VARCHAR(50),
  -- Common fields
  email             VARCHAR(255),
  phone             VARCHAR(50),
  mobile            VARCHAR(50),
  address_line1     VARCHAR(255),
  address_line2     VARCHAR(255),
  city              VARCHAR(100),
  state             VARCHAR(100),
  postal_code       VARCHAR(20),
  country           VARCHAR(2),
  -- Contact person (for company tenants)
  contact_person_name  VARCHAR(200),
  contact_person_phone VARCHAR(50),
  contact_person_email VARCHAR(255),
  contact_person_role  VARCHAR(100),
  -- Status
  kyc_status        VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- 'pending' | 'in_review' | 'verified' | 'rejected' | 'expired'
  kyc_verified_at   TIMESTAMPTZ,
  kyc_verified_by   UUID REFERENCES users(id),
  kyc_expiry_date   DATE,                         -- KYC re-verification due date
  is_blacklisted    BOOLEAN NOT NULL DEFAULT FALSE,
  blacklisted_at    TIMESTAMPTZ,
  blacklisted_by    UUID REFERENCES users(id),
  avatar_url        VARCHAR(500),
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  source            VARCHAR(50),                  -- 'walk_in' | 'referral' | 'online' | 'agent'
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_tenants_company ON tenants(company_id);
CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_kyc ON tenants(kyc_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_blacklisted ON tenants(is_blacklisted) WHERE is_blacklisted = TRUE;
CREATE INDEX idx_tenants_tags ON tenants USING GIN(tags);

-- KYC document requirements checklist
CREATE TABLE kyc_requirements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_type  VARCHAR(20) NOT NULL,              -- 'individual' | 'company'
  doc_type     VARCHAR(100) NOT NULL,             -- 'passport' | 'trade_license' | 'bank_statement' | ...
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  is_required  BOOLEAN NOT NULL DEFAULT TRUE,
  validity_days SMALLINT,                         -- e.g. passport must not expire within 180 days
  sort_order   SMALLINT DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KYC document submissions per tenant
CREATE TABLE tenant_kyc_documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id   UUID NOT NULL REFERENCES kyc_requirements(id),
  document_id      UUID REFERENCES documents(id) ON DELETE SET NULL,
  doc_type         VARCHAR(100) NOT NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
                   -- 'pending' | 'approved' | 'rejected'
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  expiry_date      DATE,                          -- document expiry
  CONSTRAINT uq_tenant_kyc_req UNIQUE (tenant_id, requirement_id)
);

-- Emergency contacts
CREATE TABLE tenant_emergency_contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  relationship VARCHAR(50) NOT NULL,             -- 'spouse' | 'parent' | 'sibling' | 'colleague' | 'other'
  phone        VARCHAR(50) NOT NULL,
  mobile       VARCHAR(50),
  email        VARCHAR(255),
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   SMALLINT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blacklist entries (history — current state tracked on tenants.is_blacklisted)
CREATE TABLE tenant_blacklist_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id),
  action          VARCHAR(10) NOT NULL,           -- 'blacklist' | 'whitelist'
  reason          TEXT NOT NULL,
  scope           VARCHAR(20) DEFAULT 'company',  -- 'company' | 'property'
  property_id     UUID REFERENCES properties(id),
  actioned_by     UUID NOT NULL REFERENCES users(id),
  actioned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);

-- Tenant notes (internal CRM notes)
CREATE TABLE tenant_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Server-Side Architecture

```
src/modules/tenants/
├── tenants.module.ts
├── tenants.controller.ts
├── tenants.service.ts
├── kyc.service.ts
├── blacklist.service.ts
├── dto/
│   ├── create-tenant.dto.ts
│   ├── update-tenant.dto.ts
│   ├── tenant-query.dto.ts
│   ├── kyc-review.dto.ts
│   ├── blacklist-tenant.dto.ts
│   ├── create-emergency-contact.dto.ts
│   └── create-tenant-note.dto.ts
└── entities/
    ├── tenant.entity.ts
    ├── kyc-requirement.entity.ts
    ├── tenant-kyc-document.entity.ts
    ├── tenant-emergency-contact.entity.ts
    ├── tenant-blacklist-log.entity.ts
    └── tenant-note.entity.ts
```

### Services

```typescript
// src/modules/tenants/tenants.service.ts
@Injectable()
export class TenantsService {
  async create(dto: CreateTenantDto, companyId: string): Promise<Tenant> {
    // 1. Check for duplicate (same email in company, or same ID number)
    await this.checkDuplicates(dto, companyId);
    // 2. Check if email is blacklisted
    if (dto.email) await this.blacklistService.checkEmailBlacklist(dto.email, companyId);
    const tenant = await this.tenantRepo.save({ ...dto, companyId });
    // 3. Create KYC checklist items from requirements
    await this.kycService.initializeKycChecklist(tenant.id, dto.tenantType, companyId);
    return tenant;
  }

  async findAll(companyId: string, query: TenantQueryDto): Promise<PaginatedResponse<TenantListItem>> {
    const qb = this.tenantRepo.createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .andWhere('t.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        `(t.first_name ILIKE :s OR t.last_name ILIKE :s OR t.company_name ILIKE :s
          OR t.email ILIKE :s OR t.mobile ILIKE :s OR t.id_number ILIKE :s)`,
        { s: `%${query.search}%` },
      );
    }
    if (query.tenantType) qb.andWhere('t.tenant_type = :type', { type: query.tenantType });
    if (query.kycStatus) qb.andWhere('t.kyc_status = :kyc', { kyc: query.kycStatus });
    if (query.isBlacklisted !== undefined) qb.andWhere('t.is_blacklisted = :bl', { bl: query.isBlacklisted });
    if (query.tags?.length) qb.andWhere('t.tags && :tags', { tags: query.tags });

    // ... pagination, sorting, total count
    return this.paginate(qb, query);
  }

  async getLeaseHistory(tenantId: string): Promise<LeaseHistorySummary[]> {
    return this.leaseRepo
      .createQueryBuilder('l')
      .select(['l.id', 'l.unitId', 'l.startDate', 'l.endDate', 'l.rentAmount', 'l.status'])
      .addSelect('u.unit_number AS "unitNumber"')
      .addSelect('p.name AS "propertyName"')
      .innerJoin('units', 'u', 'u.id = l.unit_id')
      .innerJoin('properties', 'p', 'p.id = u.property_id')
      .where('l.tenant_id = :tenantId', { tenantId })
      .orderBy('l.start_date', 'DESC')
      .getRawMany();
  }

  async mergeTenants(primaryId: string, duplicateId: string, mergedBy: string): Promise<Tenant> {
    /**
     * Migrates all leases, payments, documents, notes from duplicateId → primaryId.
     * Then soft-deletes duplicateId with merged_into_id note.
     */
    await this.dataSource.transaction(async (em) => {
      await em.update('leases', { tenantId: duplicateId }, { tenantId: primaryId });
      await em.update('documents', { entityType: 'tenant', entityId: duplicateId }, { entityId: primaryId });
      await em.update('tenant_notes', { tenantId: duplicateId }, { tenantId: primaryId });
      await em.update('tenant_emergency_contacts', { tenantId: duplicateId }, { tenantId: primaryId });
      await em.softDelete('tenants', duplicateId);
      await this.tenantRepo.update(primaryId, {
        notes: `Merged from tenant ${duplicateId} on ${new Date().toISOString()} by ${mergedBy}`,
      });
    });
    return this.tenantRepo.findOneOrFail({ where: { id: primaryId } });
  }
}

// src/modules/tenants/kyc.service.ts
@Injectable()
export class KycService {
  async initializeKycChecklist(tenantId: string, tenantType: string, companyId: string): Promise<void> {
    const requirements = await this.requirementRepo.find({
      where: { companyId, tenantType, isActive: true },
    });
    const kycDocs = requirements.map(req => ({
      tenantId,
      requirementId: req.id,
      docType: req.docType,
      status: 'pending',
    }));
    await this.kycDocRepo.save(kycDocs);
  }

  async submitDocument(tenantId: string, requirementId: string, documentId: string): Promise<TenantKycDocument> {
    const doc = await this.documentRepo.findOneOrFail({ where: { id: documentId } });
    return this.kycDocRepo.save({
      tenantId, requirementId, documentId,
      docType: doc.category ?? 'unknown',
      expiryDate: doc.expiryDate,
      status: 'pending',
      submittedAt: new Date(),
    });
  }

  async reviewDocument(kycDocId: string, dto: KycReviewDto, reviewedBy: string): Promise<TenantKycDocument> {
    await this.kycDocRepo.update(kycDocId, {
      status: dto.decision,  // 'approved' | 'rejected'
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason: dto.rejectionReason,
    });
    // Check if all required documents approved → auto-set tenant.kyc_status = 'verified'
    await this.updateTenantKycStatus(
      (await this.kycDocRepo.findOneOrFail({ where: { id: kycDocId } })).tenantId,
    );
    return this.kycDocRepo.findOneOrFail({ where: { id: kycDocId } });
  }

  async updateTenantKycStatus(tenantId: string): Promise<void> {
    const docs = await this.kycDocRepo.find({ where: { tenantId } });
    const required = docs.filter(d => d.isRequired);  // loaded via relation
    const allApproved = required.every(d => d.status === 'approved');
    const anyRejected = required.some(d => d.status === 'rejected');

    let kycStatus = 'in_review';
    if (allApproved) kycStatus = 'verified';
    else if (anyRejected) kycStatus = 'rejected';
    else if (required.every(d => d.status === 'pending')) kycStatus = 'pending';

    await this.tenantRepo.update(tenantId, {
      kycStatus,
      ...(kycStatus === 'verified' ? { kycVerifiedAt: new Date() } : {}),
    });
  }
}

// src/modules/tenants/blacklist.service.ts
@Injectable()
export class BlacklistService {
  async blacklistTenant(tenantId: string, dto: BlacklistTenantDto, actionedBy: string): Promise<void> {
    await this.tenantRepo.update(tenantId, {
      isBlacklisted: true,
      blacklistedAt: new Date(),
      blacklistedBy: actionedBy,
    });
    await this.blacklistLogRepo.save({
      tenantId, companyId: dto.companyId, action: 'blacklist',
      reason: dto.reason, scope: dto.scope ?? 'company',
      propertyId: dto.propertyId, actionedBy, notes: dto.notes,
    });
    // Send notification to relevant property managers
    await this.notificationsService.send({
      templateCode: 'tenant_blacklisted',
      companyId: dto.companyId,
      recipientIds: await this.getPropertyManagerIds(dto.companyId),
      channels: ['in_app'],
      variables: { tenantName: await this.getTenantName(tenantId), reason: dto.reason },
    });
  }

  async checkEmailBlacklist(email: string, companyId: string): Promise<void> {
    const blacklisted = await this.tenantRepo.findOne({
      where: { email, companyId, isBlacklisted: true },
    });
    if (blacklisted) {
      throw new ForbiddenException({
        code: 'TENANT_BLACKLISTED',
        message: 'This email address belongs to a blacklisted tenant.',
        tenantId: blacklisted.id,
      });
    }
  }
}
```

---

## API Contract

### `GET /tenants`
**Access:** `tenants.read`  
**Query:** `?search=&tenantType=individual&kycStatus=pending&isBlacklisted=false&tags=vip&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantType": "individual",
      "displayName": "John Tan Wei Ming",
      "email": "john.tan@email.com",
      "mobile": "+65-9123-4567",
      "kycStatus": "verified",
      "isBlacklisted": false,
      "activeLeases": 1,
      "tags": ["long_term", "vip"],
      "avatarUrl": null,
      "createdAt": "2024-03-01T00:00:00Z"
    }
  ],
  "meta": { "total": 142, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

### `POST /tenants`
**Access:** `tenants.create`

**Individual:**
```json
{
  "tenantType": "individual",
  "firstName": "John",
  "lastName": "Tan Wei Ming",
  "dateOfBirth": "1985-04-15",
  "gender": "male",
  "nationality": "Singaporean",
  "idType": "nric",
  "idNumber": "S8500001A",
  "idExpiryDate": null,
  "email": "john.tan@email.com",
  "phone": "+65-6111-0000",
  "mobile": "+65-9123-4567",
  "addressLine1": "10 Lorong 5",
  "city": "Singapore",
  "country": "SG",
  "source": "referral",
  "tags": ["long_term"]
}
```

**Company:**
```json
{
  "tenantType": "company",
  "companyName": "Tech Startup Pte Ltd",
  "companyRegNo": "202400123A",
  "companyType": "private_limited",
  "gstRegNo": "M90000001Z",
  "email": "office@techstartup.com",
  "phone": "+65-6222-0000",
  "addressLine1": "1 Business Park Drive",
  "city": "Singapore",
  "country": "SG",
  "contactPersonName": "Jane Lim",
  "contactPersonPhone": "+65-9222-0000",
  "contactPersonEmail": "jane@techstartup.com",
  "contactPersonRole": "Office Manager"
}
```

---

### `GET /tenants/:id`
**Access:** `tenants.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantType": "individual",
    "displayName": "John Tan Wei Ming",
    "firstName": "John",
    "lastName": "Tan Wei Ming",
    "dateOfBirth": "1985-04-15",
    "idType": "nric",
    "idNumber": "S8500001A",
    "email": "john.tan@email.com",
    "mobile": "+65-9123-4567",
    "address": "10 Lorong 5, Singapore 310010",
    "kycStatus": "verified",
    "kycVerifiedAt": "2024-03-05T00:00:00Z",
    "isBlacklisted": false,
    "avatarUrl": null,
    "source": "referral",
    "tags": ["long_term", "vip"],
    "notes": null,
    "emergencyContacts": [
      { "id": "uuid", "name": "Mary Tan", "relationship": "spouse", "phone": "+65-9321-0000", "isPrimary": true }
    ],
    "kycSummary": {
      "status": "verified",
      "submitted": 3,
      "approved": 3,
      "pending": 0,
      "rejected": 0
    },
    "activeLeases": 1,
    "totalLeases": 2,
    "createdAt": "2024-03-01T00:00:00Z",
    "updatedAt": "2024-03-05T00:00:00Z"
  }
}
```

---

### `PUT /tenants/:id`
**Access:** `tenants.update`

Partial update of any profile fields.

---

### `DELETE /tenants/:id`
**Access:** `tenants.delete`  
Soft delete. Returns `409` if tenant has active leases.

---

### `GET /tenants/:id/lease-history`
**Access:** `tenants.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "unitNumber": "1201",
      "propertyName": "Acme Tower A",
      "startDate": "2023-02-01",
      "endDate": "2025-01-31",
      "rentAmount": 3500,
      "currency": "SGD",
      "status": "active"
    }
  ]
}
```

---

### KYC Endpoints

### `GET /tenants/:id/kyc`
**Access:** `tenants.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "in_review",
    "verifiedAt": null,
    "documents": [
      {
        "id": "uuid",
        "requirementId": "uuid",
        "docType": "nric",
        "name": "NRIC / National ID",
        "isRequired": true,
        "status": "approved",
        "document": { "id": "uuid", "name": "John_NRIC.pdf", "uploadedAt": "2024-03-02T00:00:00Z" },
        "reviewedBy": { "fullName": "Sarah Admin" },
        "reviewedAt": "2024-03-03T00:00:00Z",
        "expiryDate": null
      },
      {
        "id": "uuid",
        "requirementId": "uuid",
        "docType": "bank_statement",
        "name": "Latest 3 Months Bank Statement",
        "isRequired": true,
        "status": "pending",
        "document": { "id": "uuid", "name": "Bank_Statement_Jan2025.pdf", "uploadedAt": "2024-03-04T00:00:00Z" },
        "reviewedBy": null
      }
    ]
  }
}
```

### `POST /tenants/:id/kyc/documents`
**Access:** `tenants.update`

```json
{
  "requirementId": "uuid",
  "documentId": "uuid"
}
```

### `PUT /tenants/:id/kyc/documents/:kycDocId/review`
**Access:** `tenants.kyc_review`

```json
{
  "decision": "rejected",
  "rejectionReason": "Document is expired. Please provide one issued within the last 3 months."
}
```

---

### Blacklist

### `POST /tenants/:id/blacklist`
**Access:** `tenants.blacklist`

```json
{
  "reason": "Multiple lease payment defaults. Outstanding balance of SGD 15,000.",
  "scope": "company",
  "notes": "Legal proceedings initiated on 2025-01-10"
}
```

### `POST /tenants/:id/whitelist`
**Access:** `tenants.blacklist`

```json
{
  "reason": "Outstanding balance cleared. Reviewed and approved by management."
}
```

### `GET /tenants/blacklisted`
**Access:** `tenants.read`  
**Query:** `?page=1&limit=20`

### `GET /tenants/:id/blacklist-history`

---

### Emergency Contacts

### `GET /tenants/:id/emergency-contacts`
### `POST /tenants/:id/emergency-contacts`

```json
{
  "name": "Mary Tan",
  "relationship": "spouse",
  "phone": "+65-9321-0000",
  "email": "mary@email.com",
  "isPrimary": true
}
```

### `PUT /tenants/:id/emergency-contacts/:contactId`
### `DELETE /tenants/:id/emergency-contacts/:contactId`

---

### Notes

### `GET /tenants/:id/notes`
### `POST /tenants/:id/notes`

```json
{ "content": "Tenant requested early termination due to relocation. To follow up.", "isPinned": true }
```

### `PUT /tenants/:id/notes/:noteId`
### `DELETE /tenants/:id/notes/:noteId`

---

### Merge

### `POST /tenants/merge`
**Access:** `tenants.merge`

```json
{
  "primaryTenantId": "uuid",
  "duplicateTenantId": "uuid"
}
```

**Response 200:**
```json
{ "success": true, "data": { "mergedInto": "uuid", "message": "Tenant records merged successfully." } }
```

---

## Business Logic & Validation Rules

```
Duplicate detection on create:
  Individual: check same (email OR idNumber) within same company
  Company: check same (companyRegNo OR email) within same company
  → Returns 409 with existing tenant ID if found

KYC checklist initialization:
  On tenant create: load all active kyc_requirements matching tenant_type + companyId
  Create one tenant_kyc_documents record per requirement (status = 'pending')
  If company has no custom requirements: use default system requirements

KYC status auto-calculation (after each document review):
  all required docs = approved → kycStatus = 'verified'
  any required doc = rejected  → kycStatus = 'rejected'
  at least one submitted, none rejected, not all approved → kycStatus = 'in_review'
  all still pending (none submitted) → kycStatus = 'pending'

KYC expiry:
  kycExpiryDate = min(expiryDate of all approved KYC docs) OR kycVerifiedAt + 365 days
  Cron job daily: tenants where kycExpiryDate < 30 days → send reminder
  On expiry: kycStatus = 'expired'; lease renewal blocked until re-verified

Blacklist check on CRM inquiry (Module 2.5):
  Before creating Lead with email matching a blacklisted tenant: warn agent
  Inquiry can proceed but is flagged; lease creation for blacklisted tenant blocked

Blacklist scope:
  'company': cannot lease any property in the company
  'property': cannot lease units in specified property only

Merge rules:
  - Must belong to same company
  - duplicateTenantId must have no active leases (or user must explicitly confirm transfer)
  - All data migrated: leases, payments, documents, notes, emergency contacts
  - duplicateTenantId soft-deleted with note: "Merged into {primaryId}"

Avatar upload:
  Resize to 300×300 (square crop), store as WebP
  Path: {companyId}/tenants/{tenantId}/avatar.webp
```

---

## UI Screens & Component Breakdown

```
admin/tenants/
├── TenantListPage/
│   ├── TenantListPage.tsx
│   └── components/
│       ├── TenantTable.tsx
│       │   └── TenantRow.tsx              # avatar + name + type + kyc badge + status + actions
│       ├── TenantFilters.tsx              # search, type tabs (All/Individual/Company), KYC status, tags
│       ├── KycStatusBadge.tsx             # Pending/In Review/Verified/Rejected/Expired
│       ├── BlacklistBadge.tsx             # red 'Blacklisted' chip
│       └── CreateTenantButton.tsx

├── TenantDetailPage/
│   ├── TenantDetailPage.tsx               # tabs: Profile | KYC | Leases | Documents | Notes
│   └── components/
│       ├── TenantProfileHeader.tsx        # avatar + name + type + kyc badge + quick actions
│       ├── tabs/
│       │   ├── ProfileTab/
│       │   │   ├── ProfileTab.tsx
│       │   │   ├── TenantProfileForm.tsx
│       │   │   ├── EmergencyContactsList.tsx
│       │   │   ├── EmergencyContactModal.tsx
│       │   │   └── BlacklistPanel.tsx       # history + blacklist/whitelist action
│       │   ├── KycTab/
│       │   │   ├── KycTab.tsx
│       │   │   ├── KycProgress.tsx          # step-indicator showing overall status
│       │   │   ├── KycDocumentCard.tsx      # doc name + status + preview + review actions
│       │   │   ├── KycReviewModal.tsx       # approve/reject + reason
│       │   │   └── SubmitDocumentModal.tsx  # pick from document vault
│       │   ├── LeasesTab/                   # lease history table (from Module 2.4)
│       │   ├── DocumentsTab/               # document vault filtered to this tenant
│       │   └── NotesTab/
│       │       ├── NotesTab.tsx
│       │       ├── PinnedNotes.tsx
│       │       ├── NoteCard.tsx
│       │       └── NoteEditor.tsx

├── CreateTenantPage/
│   ├── CreateTenantPage.tsx
│   └── components/
│       ├── TenantTypeSelector.tsx          # Individual | Company toggle
│       ├── IndividualForm.tsx
│       ├── CompanyForm.tsx
│       ├── DuplicateWarningModal.tsx       # shows matching existing tenant
│       └── BlacklistWarning.tsx            # shown if email matches blacklisted tenant

└── MergeTenantModal/
    ├── MergeTenantModal.tsx
    ├── TenantSearchCombobox.tsx            # search to find duplicate tenant
    └── MergePreview.tsx                    # shows what will be migrated
```

---

## State Management

```typescript
// src/store/api/tenantsApi.ts
export const tenantsApi = createApi({
  reducerPath: 'tenantsApi',
  tagTypes: ['Tenants', 'TenantKyc', 'EmergencyContacts', 'TenantNotes'],
  endpoints: (builder) => ({
    getTenants: builder.query<PaginatedResponse<TenantListItem>, TenantQueryParams>({
      query: (params) => ({ url: '/tenants', params }),
      providesTags: ['Tenants'],
    }),
    getTenant: builder.query<TenantDetail, string>({
      query: (id) => `/tenants/${id}`,
      providesTags: (_, __, id) => [{ type: 'Tenants', id }],
    }),
    createTenant: builder.mutation<Tenant, CreateTenantDto>({
      query: (body) => ({ url: '/tenants', method: 'POST', body }),
      invalidatesTags: ['Tenants'],
    }),
    updateTenant: builder.mutation<Tenant, { id: string; data: UpdateTenantDto }>({
      query: ({ id, data }) => ({ url: `/tenants/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    getTenantKyc: builder.query<TenantKycDetail, string>({
      query: (id) => `/tenants/${id}/kyc`,
      providesTags: (_, __, id) => [{ type: 'TenantKyc', id }],
    }),
    submitKycDocument: builder.mutation<void, { tenantId: string; requirementId: string; documentId: string }>({
      query: ({ tenantId, ...body }) => ({ url: `/tenants/${tenantId}/kyc/documents`, method: 'POST', body }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantKyc', id: tenantId }],
    }),
    reviewKycDocument: builder.mutation<void, { tenantId: string; kycDocId: string; data: KycReviewDto }>({
      query: ({ tenantId, kycDocId, data }) => ({
        url: `/tenants/${tenantId}/kyc/documents/${kycDocId}/review`, method: 'PUT', body: data,
      }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantKyc', id: tenantId }, { type: 'Tenants', id: tenantId }],
    }),
    blacklistTenant: builder.mutation<void, { id: string; data: BlacklistTenantDto }>({
      query: ({ id, data }) => ({ url: `/tenants/${id}/blacklist`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    whitelistTenant: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/tenants/${id}/whitelist`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tenants', id }, 'Tenants'],
    }),
    getLeaseHistory: builder.query<LeaseHistorySummary[], string>({
      query: (id) => `/tenants/${id}/lease-history`,
    }),
    addNote: builder.mutation<TenantNote, { tenantId: string; data: CreateTenantNoteDto }>({
      query: ({ tenantId, data }) => ({ url: `/tenants/${tenantId}/notes`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { tenantId }) => [{ type: 'TenantNotes', id: tenantId }],
    }),
    mergeTenants: builder.mutation<void, MergeTenantsDto>({
      query: (body) => ({ url: '/tenants/merge', method: 'POST', body }),
      invalidatesTags: ['Tenants'],
    }),
  }),
});
```
