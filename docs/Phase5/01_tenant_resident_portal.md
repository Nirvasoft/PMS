# Module 5.1 — Tenant & Resident Portal

**Phase:** 5 — Tenant Experience & Mobile Applications  
**Stack:** NestJS (backend) · React 18 (web portal) · Redux Toolkit · Stripe  
**Estimated Effort:** 2.5 weeks (1.5 backend, 1 frontend)  
**Depends On:** Module 2.3, 2.4, 3.1, 3.2, 4.1, 1.5 (Notifications), 1.6 (Documents)

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)

---

## Overview

The self-service web portal for tenants and residents. Provides a dedicated, branded interface (separate from admin) where occupants can manage their account, view and pay invoices, submit maintenance requests, access lease documents, manage visitors, and receive community announcements — all without requiring admin assistance.

**Key capabilities:**
- Tenant-scoped login (links to existing `users` table with tenant role)
- Dashboard: outstanding balance, active lease summary, open tickets, upcoming bookings
- Invoice viewing and online payment (Stripe checkout)
- Payment history and downloadable receipts
- Maintenance request submission with photo upload
- Lease document access + e-signature status
- Resident profile management (family members / occupants)
- Notification preference management
- KYC document self-upload

---

## DB Schema

```sql
-- Tenant portal users (tenants who have portal access)
-- These are regular users with role 'tenant' scoped to a property
-- No extra table needed — uses users + user_roles (property-scoped, role='Tenant')

-- Resident (occupant) profiles — people living in a unit, not necessarily the lease signatory
CREATE TABLE residents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id      UUID NOT NULL REFERENCES properties(id),
  unit_id          UUID NOT NULL REFERENCES units(id),
  lease_id         UUID REFERENCES leases(id),
  user_id          UUID REFERENCES users(id),          -- if resident has portal access
  tenant_id        UUID REFERENCES tenants(id),        -- the primary tenant on the lease
  resident_type    VARCHAR(20) NOT NULL DEFAULT 'occupant',
                   -- 'primary_tenant'|'family_member'|'occupant'|'domestic_helper'
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  date_of_birth    DATE,
  relationship     VARCHAR(50),                        -- 'spouse'|'child'|'parent'|'sibling'|'employee'
  id_type          VARCHAR(30),
  id_number        VARCHAR(100),
  mobile           VARCHAR(50),
  email            VARCHAR(255),
  avatar_url       VARCHAR(500),
  has_portal_access BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_plate    VARCHAR(30),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  move_in_date     DATE,
  move_out_date    DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_residents_unit ON residents(unit_id) WHERE is_active = TRUE;
CREATE INDEX idx_residents_lease ON residents(lease_id);
CREATE INDEX idx_residents_user ON residents(user_id);

-- Resident access cards / fobs
CREATE TABLE resident_access_cards (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resident_id  UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  property_id  UUID NOT NULL REFERENCES properties(id),
  card_number  VARCHAR(100) NOT NULL,
  card_type    VARCHAR(20) DEFAULT 'rfid',            -- 'rfid'|'nfc'|'qr'|'barcode'
  issued_at    DATE NOT NULL,
  expires_at   DATE,
  status       VARCHAR(20) DEFAULT 'active',          -- 'active'|'suspended'|'cancelled'|'lost'
  notes        TEXT,
  issued_by    UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Portal sessions (track portal-specific analytics)
CREATE TABLE portal_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  tenant_id   UUID REFERENCES tenants(id),
  unit_id     UUID REFERENCES units(id),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  ip_address  INET,
  user_agent  TEXT,
  pages_visited SMALLINT DEFAULT 0
);

-- Portal quick actions (for dashboard shortcuts, customizable per property)
CREATE TABLE portal_quick_actions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  label       VARCHAR(100) NOT NULL,
  icon        VARCHAR(50),
  action_type VARCHAR(30) NOT NULL,                   -- 'link'|'modal'|'page'
  action_url  VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT DEFAULT 0
);
```

---

## Server-Side Architecture

```
src/modules/portal/
├── portal.module.ts
├── portal-auth.controller.ts        # portal-specific login (tenant role only)
├── portal-dashboard.controller.ts
├── portal-dashboard.service.ts
├── portal-invoices.controller.ts
├── portal-maintenance.controller.ts
├── portal-lease.controller.ts
├── residents.controller.ts
├── residents.service.ts
├── access-cards.service.ts
├── guards/
│   └── tenant-portal.guard.ts      # ensures user has tenant role + owns the data
├── dto/
│   ├── portal-dashboard.dto.ts
│   ├── create-resident.dto.ts
│   ├── update-resident.dto.ts
│   └── issue-access-card.dto.ts
└── entities/
    ├── resident.entity.ts
    ├── resident-access-card.entity.ts
    └── portal-session.entity.ts
```

### Portal Guard

```typescript
// src/modules/portal/guards/tenant-portal.guard.ts
@Injectable()
export class TenantPortalGuard implements CanActivate {
  constructor(
    @InjectRepository(Lease) private leaseRepo: Repository<Lease>,
    @InjectRepository(Resident) private residentRepo: Repository<Resident>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload;

    // Must have tenant role
    if (!user.roles.includes('tenant') && !user.roles.includes('resident')) {
      throw new ForbiddenException('Portal access requires tenant role');
    }

    // Verify requested data belongs to user's unit/lease
    const resourceId = req.params.id ?? req.params.leaseId ?? req.params.invoiceId;
    if (resourceId) {
      await this.verifyOwnership(user.sub, resourceId, req.path);
    }

    return true;
  }

  private async verifyOwnership(userId: string, resourceId: string, path: string): Promise<void> {
    // Check ownership based on resource type inferred from path
    if (path.includes('/leases/')) {
      const lease = await this.leaseRepo.findOne({ where: { id: resourceId } });
      const resident = await this.residentRepo.findOne({ where: { userId, leaseId: resourceId, isActive: true } });
      if (!resident) throw new ForbiddenException('Access denied to this lease');
    }
    if (path.includes('/invoices/')) {
      const invoice = await this.invoiceRepo.findOne({ where: { id: resourceId } });
      const resident = await this.residentRepo.findOne({ where: { userId, unitId: invoice?.unitId, isActive: true } });
      if (!resident) throw new ForbiddenException('Access denied to this invoice');
    }
  }
}
```

### Dashboard Service

```typescript
// src/modules/portal/portal-dashboard.service.ts
@Injectable()
export class PortalDashboardService {
  async getDashboardData(userId: string): Promise<PortalDashboardData> {
    const resident = await this.residentRepo.findOne({
      where: { userId, isActive: true },
      relations: ['unit', 'unit.property', 'lease'],
    });

    if (!resident) throw new NotFoundException('No active residence found for this user');

    const [invoiceSummary, openTickets, upcomingBookings, recentAnnouncements] =
      await Promise.all([
        this.getInvoiceSummary(resident.tenantId!),
        this.getOpenTickets(resident.unitId),
        this.getUpcomingBookings(userId),
        this.getRecentAnnouncements(resident.propertyId),
      ]);

    return {
      resident,
      lease: resident.lease,
      unit: resident.unit,
      property: resident.unit.property,
      invoiceSummary,
      openTickets,
      upcomingBookings,
      recentAnnouncements,
    };
  }

  private async getInvoiceSummary(tenantId: string) {
    const result = await this.invoiceRepo
      .createQueryBuilder('i')
      .select([
        "SUM(i.outstanding_amount) FILTER (WHERE i.status IN ('issued','sent','overdue','partially_paid')) AS outstanding",
        "COUNT(*) FILTER (WHERE i.status = 'overdue') AS overdue_count",
        "SUM(i.total_amount) FILTER (WHERE i.status = 'paid' AND i.invoice_date >= date_trunc('month', NOW())) AS paid_this_month",
        "MIN(i.due_date) FILTER (WHERE i.status IN ('issued','sent','partially_paid')) AS next_due_date",
      ])
      .where('i.tenant_id = :tenantId', { tenantId })
      .getRawOne();

    return result;
  }
}
```

---

## API Contract

> **Base URL for portal:** `/api/v1/portal`  
> All portal endpoints require the `TenantPortalGuard`.

---

### `GET /portal/dashboard`
**Access:** Tenant portal user

**Response 200:**
```json
{
  "success": true,
  "data": {
    "resident": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Tan",
      "avatarUrl": null,
      "residentType": "primary_tenant"
    },
    "unit": { "id": "uuid", "unitNumber": "1201", "unitType": "2br", "floorNumber": 12 },
    "property": {
      "id": "uuid",
      "name": "Acme Tower A",
      "address": "123 Main Street, Singapore",
      "coverImageUrl": "https://cdn...",
      "contacts": [
        { "role": "building_manager", "name": "Bob Smith", "phone": "+65-6111-0000" }
      ]
    },
    "lease": {
      "id": "uuid",
      "leaseNumber": "LSE-2025-00042",
      "startDate": "2025-02-01",
      "endDate": "2027-01-31",
      "rentAmount": 3500,
      "currency": "SGD",
      "daysUntilExpiry": 716,
      "status": "active"
    },
    "invoiceSummary": {
      "outstanding": 3815,
      "overdueCount": 0,
      "paidThisMonth": 3815,
      "nextDueDate": "2025-03-01"
    },
    "openTickets": [
      { "id": "uuid", "ticketNumber": "TKT-2025-00042", "title": "AC not cooling", "status": "in_progress", "createdAt": "2025-01-14T00:00:00Z" }
    ],
    "upcomingBookings": [
      { "id": "uuid", "facilityName": "BBQ Terrace", "bookingDate": "2025-01-20", "startTime": "18:00", "endTime": "22:00" }
    ],
    "recentAnnouncements": [
      { "id": "uuid", "title": "CNY Lobby Decoration", "preview": "We are pleased to announce...", "publishedAt": "2025-01-13T00:00:00Z" }
    ]
  }
}
```

---

### `GET /portal/invoices`
**Access:** Tenant portal  
**Query:** `?status=issued,overdue,partially_paid&page=1&limit=10`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-2025-00042",
      "invoiceDate": "2025-02-01",
      "dueDate": "2025-02-08",
      "description": "Monthly Charges — Feb 2025",
      "totalAmount": 3815,
      "paidAmount": 0,
      "outstandingAmount": 3815,
      "currency": "SGD",
      "status": "issued",
      "lines": [
        { "description": "Rent — Unit 1201", "amount": 3500 },
        { "description": "GST (9%)", "amount": 315 }
      ]
    }
  ],
  "meta": { "total": 12, "page": 1 }
}
```

---

### `POST /portal/invoices/:id/pay`
**Access:** Tenant portal

```json
{ "returnUrl": "https://portal.pms.com/payments/complete" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
    "sessionId": "cs_test_...",
    "amount": 3815,
    "currency": "SGD"
  }
}
```

---

### `GET /portal/invoices/:id/download`
**Access:** Tenant portal

Returns pre-signed PDF download URL.

---

### `GET /portal/payments/history`
**Access:** Tenant portal

```json
{
  "success": true,
  "data": [
    {
      "receiptNumber": "RCT-2025-00021",
      "receiptDate": "2025-02-08",
      "amount": 3815,
      "currency": "SGD",
      "paymentMethod": "online",
      "allocations": [{ "invoiceNumber": "INV-2025-00042", "amount": 3815 }],
      "downloadUrl": "https://..."
    }
  ]
}
```

---

### `GET /portal/lease`
**Access:** Tenant portal

Returns the tenant's current active lease with escalation schedule, clauses, and e-sign status.

### `GET /portal/lease/documents`
**Access:** Tenant portal

Returns all documents linked to the tenant's lease.

---

### `POST /portal/maintenance`
**Access:** Tenant portal

```json
{
  "title": "AC not cooling in master bedroom",
  "description": "AC unit runs but room temperature not going below 28°C. Issue since 3 days.",
  "categoryId": "uuid",
  "priority": "P2",
  "locationDetail": "Master bedroom",
  "requiresAccess": true,
  "preferredAccessTime": "2025-01-16T10:00:00Z"
}
```

### `GET /portal/maintenance`
**Access:** Tenant portal  
Returns only tickets submitted by this resident's unit.

### `GET /portal/maintenance/:id`
**Access:** Tenant portal

### `POST /portal/maintenance/:id/photos`
**Access:** Tenant portal

### `POST /portal/maintenance/:id/rate`
**Access:** Tenant portal

---

### Residents

### `GET /portal/residents`
**Access:** Tenant portal  
Returns all residents registered in the unit.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Tan",
      "residentType": "primary_tenant",
      "relationship": null,
      "mobile": "+65-9123-4567",
      "hasPortalAccess": true,
      "moveInDate": "2025-02-01",
      "vehiclePlate": "SGX1234A"
    },
    {
      "id": "uuid",
      "firstName": "Mary",
      "lastName": "Tan",
      "residentType": "family_member",
      "relationship": "spouse",
      "mobile": "+65-9321-0000",
      "hasPortalAccess": false,
      "moveInDate": "2025-02-01"
    }
  ]
}
```

### `POST /portal/residents`
**Access:** Tenant portal (primary tenant only)

```json
{
  "firstName": "Ah Boy",
  "lastName": "Tan",
  "residentType": "family_member",
  "relationship": "child",
  "dateOfBirth": "2015-06-10",
  "idType": "birth_cert",
  "idNumber": "T1511111A",
  "moveInDate": "2025-02-01"
}
```

### `PUT /portal/residents/:id`
### `DELETE /portal/residents/:id`

### `POST /portal/residents/:id/invite-portal`
**Access:** Tenant portal (primary tenant only)  
Sends portal invitation to resident's email.

```json
{ "email": "mary.tan@email.com" }
```

---

### `GET /portal/kyc`
**Access:** Tenant portal  
Returns KYC status and document list with upload instructions.

### `POST /portal/kyc/documents`
**Access:** Tenant portal  
Tenant uploads their own KYC document.

```json
{ "requirementId": "uuid", "documentId": "uuid" }
```

---

### `GET /portal/notifications/preferences`
### `PUT /portal/notifications/preferences`
Same structure as Module 1.5 preferences, but scoped to portal-relevant templates only.

---

### `GET /portal/profile`
**Access:** Tenant portal

### `PUT /portal/profile`

```json
{
  "mobile": "+65-9123-4567",
  "avatarUrl": "https://cdn...",
  "timezone": "Asia/Singapore",
  "locale": "en-SG"
}
```

---

## Business Logic & Validation Rules

```
Portal authentication:
  Tenants log in via same /auth/login endpoint
  JWT contains role 'tenant', companyId, propertyId, unitId (embedded at invite time)
  TenantPortalGuard enforces: user can only view data for their own unit/lease/tenantId

Resident self-registration:
  Primary tenant can add up to 10 residents (configurable)
  Child residents (under 18): no portal access allowed
  On invite-portal: generate invitation token with 72h expiry
  New portal user gets role='resident' scoped to the unit's propertyId

Payment:
  Payment via Stripe Checkout Session
  returnUrl includes ?session_id={CHECKOUT_SESSION_ID} for verification
  On Stripe webhook (checkout.session.completed): auto-create receipt, update invoice
  Portal shows live payment status via polling every 5 seconds

Maintenance ticket from portal:
  source='tenant', reportedByTenant=tenant.id, reportedByUser=null
  Unit auto-populated from resident.unitId (cannot submit for other units)
  Photo upload: max 5 photos, 10MB each, JPEG/PNG/WebP only
  After submission: show ticket number + expected response time based on SLA config

KYC self-upload:
  Tenant uploads document → document goes through normal virus scan + OCR pipeline
  Document status = 'pending' until admin reviews
  Tenant cannot approve their own KYC documents

Portal branding:
  Each property can have custom portal settings:
    - Logo, primary color, welcome message
    - Which quick actions to show
    - Whether online payment is enabled
  Stored in properties.settings.portal JSONB
```

---

## UI Screens & Component Breakdown

```
portal/                              # Separate React app or sub-route under /portal
├── PortalApp.tsx                    # root: checks auth, applies property branding
├── PortalLogin/
│   └── PortalLoginPage.tsx          # branded login with property logo

├── PortalDashboard/
│   ├── PortalDashboardPage.tsx
│   └── components/
│       ├── WelcomeBanner.tsx        # "Good morning, John. Unit 1201, Tower A"
│       ├── OutstandingBalanceCard.tsx # amount due + Pay Now button
│       ├── LeaseStatusCard.tsx      # dates + days remaining progress bar
│       ├── OpenTicketsWidget.tsx    # list of 3 latest open tickets
│       ├── UpcomingBookingsWidget.tsx
│       ├── AnnouncementsBanner.tsx  # latest 1-2 announcements
│       └── QuickActionsGrid.tsx     # customizable shortcuts grid

├── PortalInvoices/
│   ├── InvoiceListPage.tsx
│   └── components/
│       ├── InvoiceCard.tsx          # amount + due date + status + Pay / Download
│       ├── PaymentModal.tsx         # Stripe checkout redirect flow
│       ├── PaymentSuccessPage.tsx   # after Stripe return
│       └── PaymentHistoryTab.tsx

├── PortalMaintenance/
│   ├── MaintenanceListPage.tsx
│   ├── SubmitRequestPage.tsx
│   └── components/
│       ├── TicketCard.tsx           # status + category + created date
│       ├── RequestForm.tsx
│       ├── CategoryIconGrid.tsx     # visual category picker
│       ├── PhotoUploadArea.tsx
│       └── TicketDetailPage.tsx     # status timeline + WO info + rating

├── PortalLease/
│   ├── LeaseDetailPage.tsx
│   └── components/
│       ├── LeaseHighlights.tsx      # key dates + rent + escalation
│       ├── ClausesList.tsx
│       ├── EscalationSchedule.tsx
│       └── LeaseDocuments.tsx

├── PortalResidents/
│   ├── ResidentsPage.tsx
│   └── components/
│       ├── ResidentCard.tsx         # avatar + name + type + portal badge
│       ├── AddResidentModal.tsx
│       └── InvitePortalModal.tsx

├── PortalProfile/
│   └── components/
│       ├── ProfileForm.tsx
│       ├── ChangePasswordForm.tsx
│       ├── NotificationPreferences.tsx
│       └── KycStatusPanel.tsx
│           └── KycDocumentUploader.tsx

└── PortalSettings/
    └── PropertyDirectoryPage.tsx    # contacts + emergency numbers
```

---

## State Management

```typescript
// src/store/api/portalApi.ts
export const portalApi = createApi({
  reducerPath: 'portalApi',
  tagTypes: ['PortalDashboard', 'PortalInvoices', 'PortalMaintenance', 'PortalResidents', 'PortalLease'],
  endpoints: (builder) => ({
    getDashboard: builder.query<PortalDashboardData, void>({
      query: () => '/portal/dashboard',
      providesTags: ['PortalDashboard'],
    }),
    getInvoices: builder.query<PaginatedResponse<PortalInvoice>, PortalInvoiceQueryParams>({
      query: (params) => ({ url: '/portal/invoices', params }),
      providesTags: ['PortalInvoices'],
    }),
    payInvoice: builder.mutation<{ checkoutUrl: string }, { invoiceId: string; returnUrl: string }>({
      query: ({ invoiceId, returnUrl }) => ({
        url: `/portal/invoices/${invoiceId}/pay`, method: 'POST', body: { returnUrl },
      }),
    }),
    getPaymentHistory: builder.query<Receipt[], void>({
      query: () => '/portal/payments/history',
    }),
    submitMaintenanceRequest: builder.mutation<MaintenanceTicket, CreatePortalTicketDto>({
      query: (body) => ({ url: '/portal/maintenance', method: 'POST', body }),
      invalidatesTags: ['PortalDashboard', 'PortalMaintenance'],
    }),
    getMaintenanceRequests: builder.query<PortalTicketListItem[], void>({
      query: () => '/portal/maintenance',
      providesTags: ['PortalMaintenance'],
    }),
    rateMaintenanceTicket: builder.mutation<void, { id: string; rating: number; comment?: string }>({
      query: ({ id, ...body }) => ({ url: `/portal/maintenance/${id}/rate`, method: 'POST', body }),
      invalidatesTags: ['PortalMaintenance'],
    }),
    getLease: builder.query<PortalLease, void>({
      query: () => '/portal/lease',
      providesTags: ['PortalLease'],
    }),
    getResidents: builder.query<Resident[], void>({
      query: () => '/portal/residents',
      providesTags: ['PortalResidents'],
    }),
    addResident: builder.mutation<Resident, CreateResidentDto>({
      query: (body) => ({ url: '/portal/residents', method: 'POST', body }),
      invalidatesTags: ['PortalResidents'],
    }),
    inviteResidentToPortal: builder.mutation<void, { id: string; email: string }>({
      query: ({ id, email }) => ({ url: `/portal/residents/${id}/invite-portal`, method: 'POST', body: { email } }),
    }),
    getPortalProfile: builder.query<PortalProfile, void>({
      query: () => '/portal/profile',
    }),
    updatePortalProfile: builder.mutation<void, UpdatePortalProfileDto>({
      query: (body) => ({ url: '/portal/profile', method: 'PUT', body }),
    }),
  }),
});
```
