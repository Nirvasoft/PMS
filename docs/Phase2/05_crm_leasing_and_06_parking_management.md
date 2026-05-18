# Module 2.5 — CRM & Leasing

**Phase:** 2 — Property Structure & Leasing  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 2.1, 2.2, 2.3, 2.4, 1.5 (Notifications)

---

## Overview

Lead-to-lease CRM pipeline. Captures enquiries from all channels, tracks the leasing funnel from first contact through unit viewing, offer, and signed lease. Supports agent assignment, Google Calendar sync for viewings, and campaign ROI tracking.

---

## DB Schema

```sql
-- Leads (prospects)
CREATE TABLE leads (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID REFERENCES properties(id),
  lead_number       VARCHAR(30),
  -- Contact info
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  company_name      VARCHAR(255),
  email             VARCHAR(255),
  phone             VARCHAR(50),
  mobile            VARCHAR(50),
  -- Requirements
  unit_type_preference VARCHAR(50),
  min_area_sqft     NUMERIC(10,2),
  max_area_sqft     NUMERIC(10,2),
  move_in_date      DATE,
  budget_min        NUMERIC(15,2),
  budget_max        NUMERIC(15,2),
  lease_term_months SMALLINT,
  -- Pipeline
  stage             VARCHAR(30) NOT NULL DEFAULT 'new',
                    -- 'new' | 'contacted' | 'viewing_scheduled' | 'viewed' | 'offer_sent'
                    -- | 'negotiating' | 'lease_signed' | 'lost' | 'duplicate'
  priority          VARCHAR(10) DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  source            VARCHAR(50),                  -- 'website' | 'walk_in' | 'referral' | 'agent' | 'portal'
  campaign_id       UUID REFERENCES marketing_campaigns(id),
  assigned_to       UUID REFERENCES users(id),
  lost_reason       VARCHAR(255),
  lost_at           TIMESTAMPTZ,
  converted_at      TIMESTAMPTZ,
  converted_lease_id UUID REFERENCES leases(id),
  converted_tenant_id UUID REFERENCES tenants(id),
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_stage ON leads(stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- Viewing appointments
CREATE TABLE lead_viewings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  unit_id          UUID REFERENCES units(id),
  property_id      UUID REFERENCES properties(id),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT DEFAULT 30,
  agent_id         UUID REFERENCES users(id),
  status           VARCHAR(20) DEFAULT 'scheduled',
                   -- 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  outcome          VARCHAR(20),                   -- 'interested' | 'not_interested' | 'undecided'
  agent_notes      TEXT,
  calendar_event_id VARCHAR(255),                 -- Google Calendar event ID
  reminder_sent    BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_viewings_lead ON lead_viewings(lead_id);
CREATE INDEX idx_viewings_scheduled ON lead_viewings(scheduled_at);

-- Marketing campaigns
CREATE TABLE marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     UUID REFERENCES properties(id),
  name            VARCHAR(255) NOT NULL,
  channel         VARCHAR(50),                    -- 'facebook' | 'google_ads' | 'email' | 'portal'
  budget          NUMERIC(15,2),
  start_date      DATE,
  end_date        DATE,
  status          VARCHAR(20) DEFAULT 'active',
  total_leads     SMALLINT DEFAULT 0,             -- denormalized counter
  total_conversions SMALLINT DEFAULT 0,           -- denormalized counter
  total_revenue   NUMERIC(15,2) DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lead activity log (timeline of all interactions)
CREATE TABLE lead_activities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,             -- 'note' | 'call' | 'email' | 'viewing' | 'stage_change'
  description  TEXT NOT NULL,
  performed_by UUID REFERENCES users(id),
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_activities ON lead_activities(lead_id, created_at DESC);
```

### Services

```typescript
// src/modules/crm/leads.service.ts
@Injectable()
export class LeadsService {
  async create(dto: CreateLeadDto, companyId: string): Promise<Lead> {
    // Check blacklist before creating
    if (dto.email) await this.blacklistService.checkEmailBlacklist(dto.email, companyId);
    // Auto-assign to least-loaded agent in the property
    const assignedTo = dto.assignedTo ?? await this.autoAssignAgent(dto.propertyId, companyId);
    const lead = await this.leadRepo.save({ ...dto, companyId, assignedTo });
    await this.logActivity(lead.id, 'note', `Lead created from ${dto.source ?? 'unknown'}`, null);
    return lead;
  }

  async updateStage(leadId: string, stage: string, metadata: Record<string, unknown>, updatedBy: string): Promise<Lead> {
    const lead = await this.findOne(leadId);
    const prevStage = lead.stage;
    await this.leadRepo.update(leadId, { stage, ...(stage === 'lost' ? { lostAt: new Date(), lostReason: metadata.reason as string } : {}) });
    await this.logActivity(leadId, 'stage_change', `Stage changed: ${prevStage} → ${stage}`, updatedBy, { previousStage: prevStage, newStage: stage });
    return this.findOne(leadId);
  }

  async convert(leadId: string, leaseId: string, tenantId: string, convertedBy: string): Promise<Lead> {
    await this.leadRepo.update(leadId, {
      stage: 'lease_signed',
      convertedAt: new Date(),
      convertedLeaseId: leaseId,
      convertedTenantId: tenantId,
    });
    // Update campaign conversion count
    const lead = await this.findOne(leadId);
    if (lead.campaignId) {
      await this.campaignRepo.increment({ id: lead.campaignId }, 'totalConversions', 1);
    }
    return lead;
  }

  async getPipelineStats(companyId: string, propertyId?: string): Promise<PipelineStats> {
    const stages = ['new', 'contacted', 'viewing_scheduled', 'viewed', 'offer_sent', 'negotiating', 'lease_signed'];
    const result = await this.leadRepo
      .createQueryBuilder('l')
      .select('l.stage', 'stage')
      .addSelect('COUNT(*)::int', 'count')
      .where('l.company_id = :companyId', { companyId })
      .andWhere('l.deleted_at IS NULL')
      .andWhere("l.stage NOT IN ('lost', 'duplicate')")
      .andWhere(propertyId ? 'l.property_id = :propertyId' : '1=1', { propertyId })
      .groupBy('l.stage')
      .getRawMany();

    const stageMap = Object.fromEntries(result.map(r => [r.stage, r.count]));
    return { stages: stages.map(s => ({ stage: s, count: stageMap[s] ?? 0 })) };
  }

  private async autoAssignAgent(propertyId: string | undefined, companyId: string): Promise<string | null> {
    // Find agent with least open leads in this property
    if (!propertyId) return null;
    const result = await this.leadRepo
      .createQueryBuilder('l')
      .select('l.assigned_to', 'agentId')
      .addSelect('COUNT(*)::int', 'openLeads')
      .innerJoin('user_roles', 'ur', "ur.user_id = l.assigned_to AND ur.role_id IN (SELECT id FROM roles WHERE name = 'Leasing Agent')")
      .where("l.property_id = :propertyId AND l.stage NOT IN ('lost', 'duplicate', 'lease_signed')", { propertyId })
      .groupBy('l.assigned_to')
      .orderBy('COUNT(*)', 'ASC')
      .limit(1)
      .getRawOne();
    return result?.agentId ?? null;
  }
}
```

---

## API Contract

### `GET /leads`
**Access:** `leads.read`  
**Query:** `?propertyId=&stage=&assignedTo=&source=&search=&page=1&limit=20`

### `POST /leads`
**Access:** `leads.create`

```json
{
  "propertyId": "uuid",
  "firstName": "Sarah",
  "lastName": "Lee",
  "email": "sarah@email.com",
  "mobile": "+65-9111-2222",
  "unitTypePreference": "2br",
  "moveInDate": "2025-03-01",
  "budgetMin": 3000,
  "budgetMax": 4000,
  "leaseTermMonths": 24,
  "source": "website",
  "campaignId": "uuid",
  "assignedTo": "uuid"
}
```

### `GET /leads/pipeline`
**Access:** `leads.read`  
**Query:** `?propertyId=`

**Response 200 (Kanban data):**
```json
{
  "success": true,
  "data": {
    "stages": [
      { "stage": "new", "count": 8, "leads": [{ "id": "uuid", "displayName": "Sarah Lee", "budget": "SGD 3,000–4,000", "moveInDate": "2025-03-01", "priority": "high" }] },
      { "stage": "contacted", "count": 5, "leads": [...] },
      { "stage": "viewing_scheduled", "count": 3, "leads": [...] }
    ]
  }
}
```

### `PUT /leads/:id/stage`
**Access:** `leads.update`

```json
{ "stage": "viewing_scheduled", "reason": null }
```

### `POST /leads/:id/viewings`
**Access:** `leads.update`

```json
{
  "unitId": "uuid",
  "scheduledAt": "2025-01-20T14:00:00Z",
  "durationMinutes": 45,
  "agentId": "uuid"
}
```

### `PUT /leads/:id/viewings/:viewingId`
### `POST /leads/:id/viewings/:viewingId/complete`

```json
{ "outcome": "interested", "agentNotes": "Very interested in unit 1201. Prefers lower floor." }
```

### `POST /leads/:id/convert`
**Access:** `leads.convert`

```json
{ "leaseId": "uuid", "tenantId": "uuid" }
```

### `GET /leads/:id/activities`
**Access:** `leads.read`

### `POST /leads/:id/activities`

```json
{ "activityType": "call", "description": "Called to discuss lease terms. Tenant considering." }
```

### `GET /leads/stats`
**Access:** `leads.read`

```json
{
  "success": true,
  "data": {
    "totalActive": 24,
    "totalThisMonth": 12,
    "conversionRate": 33.3,
    "avgDaysToConvert": 18,
    "bySource": { "website": 8, "referral": 6, "walk_in": 5, "portal": 3 },
    "byAgent": [{ "agentId": "uuid", "name": "Bob Agent", "open": 8, "converted": 3 }]
  }
}
```

### `GET /marketing-campaigns`
### `POST /marketing-campaigns`
### `GET /marketing-campaigns/:id/roi`

---

## Business Logic & Validation Rules

```
Lead auto-assignment (round-robin):
  Find all active agents assigned to the property (via user_roles with role 'Leasing Agent')
  Assign to agent with fewest open leads (stage not in lost/signed)
  If tie: assign by creation order (oldest agent assignment first)

Stage transition allowed paths:
  new → contacted, lost, duplicate
  contacted → viewing_scheduled, offer_sent, lost
  viewing_scheduled → viewed, no_show, lost
  viewed → offer_sent, lost
  offer_sent → negotiating, lost
  negotiating → lease_signed, lost
  Any stage → duplicate

Viewing reminders:
  Bull job: 24h before scheduled_at → send reminder to agent + lead email
  On reminder sent: set reminder_sent = true

Conversion:
  lead.convert() triggered by LeaseService after lease activation
  Updates lead stage, links lease + tenant
  Updates campaign.totalConversions counter

Campaign ROI calculation:
  ROI = (totalRevenue - budget) / budget × 100
  totalRevenue = sum of first-month rent for all converted leases from campaign
```

---

## UI Screens

```
admin/crm/
├── LeadPipelinePage/
│   └── components/
│       ├── KanbanBoard.tsx              # @dnd-kit based drag-and-drop
│       ├── KanbanColumn.tsx             # stage column with count badge
│       ├── LeadCard.tsx                 # name + budget + priority chip + agent avatar
│       └── PipelineStats.tsx            # conversion rate + avg days

├── LeadDetailPage/
│   └── tabs/
│       ├── LeadInfoTab.tsx
│       ├── ViewingsTab.tsx
│       │   ├── ViewingCard.tsx
│       │   └── ScheduleViewingModal.tsx
│       ├── ActivityTab.tsx
│       └── ConvertLeadModal.tsx         # search existing tenant or create new + link lease

└── CampaignPage/
    └── components/
        ├── CampaignTable.tsx
        └── CampaignROICard.tsx           # budget vs revenue vs ROI %
```

---

## State Management

```typescript
export const crmApi = createApi({
  reducerPath: 'crmApi',
  tagTypes: ['Leads', 'Viewings', 'Campaigns'],
  endpoints: (builder) => ({
    getLeads: builder.query<PaginatedResponse<LeadListItem>, LeadQueryParams>({
      query: (params) => ({ url: '/leads', params }),
      providesTags: ['Leads'],
    }),
    getPipeline: builder.query<PipelineData, { propertyId?: string }>({
      query: (params) => ({ url: '/leads/pipeline', params }),
      providesTags: ['Leads'],
    }),
    createLead: builder.mutation<Lead, CreateLeadDto>({
      query: (body) => ({ url: '/leads', method: 'POST', body }),
      invalidatesTags: ['Leads'],
    }),
    updateLeadStage: builder.mutation<Lead, { id: string; stage: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/stage`, method: 'PUT', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leads', id }, 'Leads'],
    }),
    scheduleViewing: builder.mutation<LeadViewing, { leadId: string; data: CreateViewingDto }>({
      query: ({ leadId, data }) => ({ url: `/leads/${leadId}/viewings`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leadId }) => [{ type: 'Viewings', id: leadId }],
    }),
    convertLead: builder.mutation<Lead, { id: string; leaseId: string; tenantId: string }>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/convert`, method: 'POST', body }),
      invalidatesTags: ['Leads'],
    }),
    getLeadStats: builder.query<LeadStats, { propertyId?: string }>({
      query: (params) => ({ url: '/leads/stats', params }),
    }),
  }),
});
```

---
---

# Module 2.6 — Parking Management

**Phase:** 2 — Property Structure & Leasing  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 2.1, 2.3

---

## Overview

Manages the full parking operation: slot catalog, allocation to tenants/residents, visitor parking with time-limited QR passes, billing integration, and RFID access control hooks.

---

## DB Schema

```sql
-- Parking zones / levels
CREATE TABLE parking_zones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         VARCHAR(100) NOT NULL,              -- 'Basement 1', 'Level P1', 'Open Air'
  code         VARCHAR(20),
  zone_type    VARCHAR(20) DEFAULT 'covered',      -- 'covered' | 'open' | 'rooftop'
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parking slots
CREATE TABLE parking_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  zone_id         UUID REFERENCES parking_zones(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  slot_number     VARCHAR(30) NOT NULL,
  slot_type       VARCHAR(20) NOT NULL DEFAULT 'car',
                  -- 'car' | 'motorcycle' | 'lorry' | 'ev' | 'disabled' | 'reserved'
  size            VARCHAR(20) DEFAULT 'standard',  -- 'compact' | 'standard' | 'large'
  has_ev_charger  BOOLEAN NOT NULL DEFAULT FALSE,
  ev_charger_type VARCHAR(30),                     -- 'type1' | 'type2' | 'ccs' | 'chademo'
  status          VARCHAR(20) NOT NULL DEFAULT 'available',
                  -- 'available' | 'allocated' | 'visitor' | 'reserved' | 'blocked'
  monthly_rate    NUMERIC(10,2),
  hourly_rate     NUMERIC(8,2),
  rfid_tag_id     VARCHAR(100),                    -- RFID tag for this slot's barrier
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_slot_number_property UNIQUE (slot_number, property_id)
);

CREATE INDEX idx_parking_slots_property ON parking_slots(property_id);
CREATE INDEX idx_parking_slots_status ON parking_slots(status) WHERE is_active = TRUE;

-- Parking allocations (monthly/long-term assignments to tenants)
CREATE TABLE parking_allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id         UUID NOT NULL REFERENCES parking_slots(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  unit_id         UUID REFERENCES units(id),
  lease_id        UUID REFERENCES leases(id),      -- optional: linked to lease
  start_date      DATE NOT NULL,
  end_date        DATE,                             -- null = open-ended
  monthly_rate    NUMERIC(10,2) NOT NULL,
  billing_day     SMALLINT DEFAULT 1,
  status          VARCHAR(20) DEFAULT 'active',    -- 'active' | 'expired' | 'cancelled'
  vehicle_id      UUID REFERENCES tenant_vehicles(id),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parking_allocations_slot ON parking_allocations(slot_id);
CREATE INDEX idx_parking_allocations_tenant ON parking_allocations(tenant_id);

-- Tenant vehicles
CREATE TABLE tenant_vehicles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  plate_number VARCHAR(30) NOT NULL,
  make         VARCHAR(100),
  model        VARCHAR(100),
  color        VARCHAR(50),
  vehicle_type VARCHAR(20) DEFAULT 'car',
  rfid_tag_no  VARCHAR(100),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_plate_company UNIQUE (plate_number, company_id)
);

-- Visitor parking passes
CREATE TABLE visitor_parking_passes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  slot_id         UUID REFERENCES parking_slots(id),
  issued_by       UUID REFERENCES users(id),       -- security staff or tenant
  issuing_unit_id UUID REFERENCES units(id),       -- which unit the visitor is visiting
  visitor_name    VARCHAR(200) NOT NULL,
  visitor_vehicle_plate VARCHAR(30),
  qr_token        VARCHAR(255) NOT NULL UNIQUE,
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ NOT NULL,
  max_hours       SMALLINT DEFAULT 4,
  actual_entry_at TIMESTAMPTZ,
  actual_exit_at  TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'pending',   -- 'pending' | 'active' | 'completed' | 'expired' | 'cancelled'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visitor_passes_token ON visitor_parking_passes(qr_token);
CREATE INDEX idx_visitor_passes_property ON visitor_parking_passes(property_id, valid_to);

-- RFID access events (log from gate controller)
CREATE TABLE rfid_access_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  rfid_tag_no  VARCHAR(100) NOT NULL,
  vehicle_id   UUID REFERENCES tenant_vehicles(id),
  event_type   VARCHAR(10) NOT NULL,               -- 'entry' | 'exit'
  gate_id      VARCHAR(50),
  event_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_authorized BOOLEAN NOT NULL DEFAULT TRUE,
  denial_reason VARCHAR(100)
);

CREATE INDEX idx_rfid_events_property ON rfid_access_events(property_id, event_at DESC);
```

---

## Server-Side Architecture

```
src/modules/parking/
├── parking.module.ts
├── slots.controller.ts / slots.service.ts
├── allocations.controller.ts / allocations.service.ts
├── vehicles.controller.ts / vehicles.service.ts
├── visitor-passes.controller.ts / visitor-passes.service.ts
├── rfid.controller.ts / rfid.service.ts
└── dto/
    ├── create-slot.dto.ts
    ├── bulk-create-slots.dto.ts
    ├── create-allocation.dto.ts
    ├── create-vehicle.dto.ts
    ├── create-visitor-pass.dto.ts
    └── rfid-event.dto.ts
```

---

## API Contract

### `GET /properties/:propertyId/parking/slots`
**Access:** `parking.read`  
**Query:** `?zoneId=&status=available&slotType=car`

### `POST /properties/:propertyId/parking/slots`
**Access:** `parking.manage`

```json
{
  "slotNumber": "B1-001",
  "zoneId": "uuid",
  "slotType": "car",
  "size": "standard",
  "hasEvCharger": false,
  "monthlyRate": 150,
  "hourlyRate": null
}
```

### `POST /properties/:propertyId/parking/slots/bulk`
```json
{
  "zoneId": "uuid",
  "prefix": "B1-",
  "from": 1,
  "to": 50,
  "slotType": "car",
  "monthlyRate": 150
}
```

---

### `GET /parking/allocations`
**Access:** `parking.read`  
**Query:** `?propertyId=&tenantId=&status=active`

### `POST /parking/allocations`
**Access:** `parking.manage`

```json
{
  "slotId": "uuid",
  "tenantId": "uuid",
  "unitId": "uuid",
  "startDate": "2025-02-01",
  "endDate": "2026-01-31",
  "monthlyRate": 150,
  "vehicleId": "uuid",
  "notes": "Basement 1 slot for Tenant John Tan"
}
```

### `DELETE /parking/allocations/:id`  (cancels allocation, slot back to available)

---

### `GET /tenants/:tenantId/vehicles`
### `POST /tenants/:tenantId/vehicles`

```json
{
  "plateNumber": "SGX1234A",
  "make": "Toyota",
  "model": "Camry",
  "color": "Silver",
  "vehicleType": "car",
  "rfidTagNo": "RFID-00123456"
}
```

### `PUT /tenants/:tenantId/vehicles/:vehicleId`
### `DELETE /tenants/:tenantId/vehicles/:vehicleId`

---

### `POST /parking/visitor-passes`
**Access:** `parking.visitor` (security staff or tenant portal)

```json
{
  "propertyId": "uuid",
  "issuingUnitId": "uuid",
  "visitorName": "David Wong",
  "visitorVehiclePlate": "SBA9999Z",
  "slotId": "uuid",
  "validFrom": "2025-01-20T14:00:00Z",
  "validTo": "2025-01-20T18:00:00Z"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "qrToken": "VP-uuid-random",
    "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?data=VP-uuid-random",
    "validFrom": "2025-01-20T14:00:00Z",
    "validTo": "2025-01-20T18:00:00Z"
  }
}
```

### `POST /parking/visitor-passes/:token/scan`
**Access:** `security.gate` (security app)

```json
{ "eventType": "entry", "gateId": "GATE-MAIN" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "authorized": true,
    "visitorName": "David Wong",
    "plateNumber": "SBA9999Z",
    "issuingUnit": "1201",
    "validTo": "2025-01-20T18:00:00Z",
    "minutesRemaining": 240
  }
}
```

---

### `POST /parking/rfid/events`
**Access:** Internal (RFID controller webhook)

```json
{
  "rfidTagNo": "RFID-00123456",
  "eventType": "entry",
  "gateId": "GATE-MAIN",
  "eventAt": "2025-01-20T08:05:00Z"
}
```

### `GET /properties/:propertyId/parking/occupancy`
**Access:** `parking.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalSlots": 120,
    "allocated": 95,
    "visitorOccupied": 8,
    "available": 17,
    "occupancyRate": 85.8,
    "byZone": [
      { "zoneName": "Basement 1", "total": 60, "allocated": 50, "available": 10 },
      { "zoneName": "Basement 2", "total": 60, "allocated": 45, "available": 15 }
    ]
  }
}
```

---

## Business Logic & Validation Rules

```
Slot allocation:
  1. slot.status must be 'available'
  2. No overlapping active allocation for same slot
     (new startDate >= existing endDate OR existing endDate IS NULL requires explicit cancellation)
  3. On create: slot.status → 'allocated'
  4. On cancel/expire: slot.status → 'available'
  5. Billing: creates recurring charge via Billing module (Phase 3)
     parkingInvoice generated on billingDay per month

Visitor pass validation on scan:
  1. Token must exist and not expired (validTo > NOW())
  2. Status must be 'pending' (entry) or 'active' (exit)
  3. On entry scan: status → 'active', actual_entry_at = NOW()
  4. On exit scan: status → 'completed', actual_exit_at = NOW()
  5. Overstay: if actual_exit_at > validTo: log overstay event (billing hook Phase 3)

RFID event processing:
  1. Look up vehicle by rfid_tag_no
  2. Check active allocation for vehicle's tenant at this property
  3. If no active allocation: log as unauthorized, trigger alert
  4. If allocation expired: log denial with reason 'allocation_expired'
  5. On authorized entry: update slot status to show vehicle present (real-time occupancy)

QR token generation:
  crypto.randomUUID() + property prefix → VP-{propertyCode}-{uuid}
  Store hash in DB, return raw token to client
  QR code URL: generate via qr-code library server-side or use qrserver.com API
```

---

## UI Screens & Component Breakdown

```
properties/[id]/parking/
├── ParkingOverviewPage/
│   └── components/
│       ├── OccupancyWidget.tsx          # donut chart: allocated / visitor / available
│       ├── ZoneGrid.tsx                 # zone cards with slot status heatmap
│       └── SlotStatusLegend.tsx

├── ParkingSlotManager/
│   └── components/
│       ├── SlotTable.tsx                # number + type + zone + status + allocation info
│       ├── SlotFilters.tsx
│       └── BulkCreateSlotsModal.tsx

├── AllocationManager/
│   └── components/
│       ├── AllocationTable.tsx
│       ├── CreateAllocationModal.tsx    # slot picker + tenant picker + dates + rate
│       └── AllocationStatusBadge.tsx

├── VisitorParkingPage/
│   └── components/
│       ├── ActivePassesTable.tsx        # current visitor passes + entry/exit time
│       ├── IssuePassModal.tsx
│       └── QrPassCard.tsx               # shows QR code for printing/sharing

└── VehicleRegistryPage/                 # per tenant
    └── components/
        ├── VehicleCard.tsx              # plate + make/model + RFID tag
        └── AddVehicleModal.tsx
```

---

## State Management

```typescript
export const parkingApi = createApi({
  reducerPath: 'parkingApi',
  tagTypes: ['ParkingSlots', 'Allocations', 'Vehicles', 'VisitorPasses'],
  endpoints: (builder) => ({
    getParkingSlots: builder.query<PaginatedResponse<ParkingSlot>, ParkingSlotQueryParams>({
      query: ({ propertyId, ...params }) => ({ url: `/properties/${propertyId}/parking/slots`, params }),
      providesTags: ['ParkingSlots'],
    }),
    createSlot: builder.mutation<ParkingSlot, { propertyId: string; data: CreateSlotDto }>({
      query: ({ propertyId, data }) => ({ url: `/properties/${propertyId}/parking/slots`, method: 'POST', body: data }),
      invalidatesTags: ['ParkingSlots'],
    }),
    getAllocations: builder.query<PaginatedResponse<ParkingAllocation>, AllocationQueryParams>({
      query: (params) => ({ url: '/parking/allocations', params }),
      providesTags: ['Allocations'],
    }),
    createAllocation: builder.mutation<ParkingAllocation, CreateAllocationDto>({
      query: (body) => ({ url: '/parking/allocations', method: 'POST', body }),
      invalidatesTags: ['Allocations', 'ParkingSlots'],
    }),
    cancelAllocation: builder.mutation<void, string>({
      query: (id) => ({ url: `/parking/allocations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Allocations', 'ParkingSlots'],
    }),
    getTenantVehicles: builder.query<TenantVehicle[], string>({
      query: (tenantId) => `/tenants/${tenantId}/vehicles`,
      providesTags: ['Vehicles'],
    }),
    addVehicle: builder.mutation<TenantVehicle, { tenantId: string; data: CreateVehicleDto }>({
      query: ({ tenantId, data }) => ({ url: `/tenants/${tenantId}/vehicles`, method: 'POST', body: data }),
      invalidatesTags: ['Vehicles'],
    }),
    issueVisitorPass: builder.mutation<VisitorPassResponse, CreateVisitorPassDto>({
      query: (body) => ({ url: '/parking/visitor-passes', method: 'POST', body }),
      invalidatesTags: ['VisitorPasses', 'ParkingSlots'],
    }),
    getParkingOccupancy: builder.query<ParkingOccupancy, string>({
      query: (propertyId) => `/properties/${propertyId}/parking/occupancy`,
    }),
  }),
});
```
