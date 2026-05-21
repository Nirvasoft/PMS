# Module 4.2 — Preventive Maintenance

**Phase:** 4 — Maintenance & Facility Operations  
**Stack:** NestJS · PostgreSQL · Bull Queue · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 4.1, 2.1

---

## Overview

Schedule-driven maintenance: asset-linked recurring jobs (monthly AC servicing, annual fire system inspection, quarterly elevator maintenance). Auto-generates work orders from PM schedules via Bull queue. Maintains full service history per asset and calculates next service due dates.

---

## DB Schema

```sql
-- PM schedules
CREATE TABLE pm_schedules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id),
  asset_id          UUID REFERENCES facility_assets(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  category_id       UUID REFERENCES maintenance_categories(id),
  frequency_type    VARCHAR(20) NOT NULL,           -- 'daily'|'weekly'|'monthly'|'quarterly'|'semi_annual'|'annual'|'custom_days'
  frequency_value   SMALLINT DEFAULT 1,             -- e.g. every N months
  custom_days       SMALLINT,                       -- if frequency_type='custom_days'
  estimated_hours   NUMERIC(5,2) DEFAULT 1,
  assigned_role     VARCHAR(100),                   -- role name of default assignee
  assigned_to       UUID REFERENCES users(id),      -- specific technician (overrides role)
  checklist_template JSONB DEFAULT '[]',            -- [{ item, isRequired, notes }]
  last_performed_at TIMESTAMPTZ,
  next_due_date     DATE NOT NULL,
  advance_days      SMALLINT DEFAULT 7,             -- create WO N days before due
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active'|'paused'|'archived'
  priority          VARCHAR(10) DEFAULT 'P3',
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pm_schedules_next_due ON pm_schedules(next_due_date) WHERE status = 'active';
CREATE INDEX idx_pm_schedules_property ON pm_schedules(property_id);

-- PM work orders (generated from schedules — links back to maintenance_tickets)
CREATE TABLE pm_work_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  schedule_id       UUID NOT NULL REFERENCES pm_schedules(id) ON DELETE CASCADE,
  ticket_id         UUID REFERENCES maintenance_tickets(id),
  work_order_id     UUID REFERENCES work_orders(id),
  due_date          DATE NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'scheduled',
                    -- 'scheduled'|'in_progress'|'completed'|'skipped'|'overdue'
  completed_at      TIMESTAMPTZ,
  completed_by      UUID REFERENCES users(id),
  checklist_results JSONB DEFAULT '[]',             -- [{ item, checked, notes, failPhoto }]
  findings          TEXT,
  next_due_date     DATE,                           -- computed next occurrence after this completion
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pm_wo_schedule ON pm_work_orders(schedule_id, due_date DESC);
CREATE INDEX idx_pm_wo_status ON pm_work_orders(status) WHERE status IN ('scheduled','in_progress','overdue');

-- Asset service history (flattened view of completed PM work orders per asset)
-- View for convenience:
CREATE VIEW asset_service_history AS
SELECT
  ps.asset_id,
  ps.id AS schedule_id,
  ps.name AS schedule_name,
  pw.id AS pm_wo_id,
  pw.due_date,
  pw.completed_at,
  pw.completed_by,
  pw.findings,
  pw.status,
  u.first_name || ' ' || u.last_name AS technician_name
FROM pm_schedules ps
JOIN pm_work_orders pw ON pw.schedule_id = ps.id
LEFT JOIN users u ON u.id = pw.completed_by
WHERE pw.status = 'completed';
```

### Service

```typescript
// src/modules/preventive-maintenance/pm.service.ts
@Injectable()
export class PmService {
  constructor(
    @InjectRepository(PmSchedule) private scheduleRepo: Repository<PmSchedule>,
    @InjectRepository(PmWorkOrder) private pmWoRepo: Repository<PmWorkOrder>,
    private ticketsService: TicketsService,
    @InjectQueue('pm') private pmQueue: Queue,
  ) {}

  /**
   * Daily cron: find schedules where next_due_date <= today + advance_days
   * Create PM work orders for each
   */
  @Cron('0 6 * * *')
  async generateDueWorkOrders(): Promise<void> {
    const today = new Date();
    const lookAheadDate = addDays(today, 30); // look ahead max 30 days

    const dueSched = await this.scheduleRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.next_due_date - s.advance_days <= :today', { today: today.toISOString().split('T')[0] })
      .andWhere('s.next_due_date <= :ahead', { ahead: lookAheadDate.toISOString().split('T')[0] })
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM pm_work_orders pw
        WHERE pw.schedule_id = s.id
          AND pw.due_date = s.next_due_date
          AND pw.status NOT IN ('skipped')
      )`)
      .getMany();

    for (const sched of dueSched) {
      await this.pmQueue.add('create-pm-wo', { scheduleId: sched.id });
    }
  }

  async createPmWorkOrderFromSchedule(scheduleId: string): Promise<PmWorkOrder> {
    const sched = await this.scheduleRepo.findOneOrFail({ where: { id: scheduleId }, relations: ['property', 'asset'] });

    // Create a maintenance ticket of source='preventive'
    const ticket = await this.ticketsService.create({
      propertyId: sched.propertyId,
      title: `[PM] ${sched.name}`,
      description: sched.description ?? `Scheduled preventive maintenance: ${sched.name}`,
      categoryId: sched.categoryId!,
      priority: sched.priority,
      source: 'preventive',
      estimatedHours: sched.estimatedHours,
      requiresAccess: false,
    }, sched.companyId);

    // Assign to configured technician/role
    if (sched.assignedTo) {
      await this.ticketsService.assignToTechnician(ticket.id, sched.assignedTo, new Date(sched.nextDueDate), 'system');
    }

    const pmWo = await this.pmWoRepo.save({
      scheduleId,
      ticketId: ticket.id,
      dueDate: sched.nextDueDate,
      status: 'scheduled',
    });

    return pmWo;
  }

  async completePmWorkOrder(pmWoId: string, dto: CompletePmWorkOrderDto, completedBy: string): Promise<PmWorkOrder> {
    const pmWo = await this.pmWoRepo.findOneOrFail({ where: { id: pmWoId }, relations: ['schedule'] });

    const nextDueDate = this.computeNextDueDate(pmWo.schedule, pmWo.dueDate);

    await this.pmWoRepo.update(pmWoId, {
      status: 'completed',
      completedAt: new Date(),
      completedBy,
      checklistResults: dto.checklistResults,
      findings: dto.findings,
      nextDueDate,
    });

    // Advance schedule's next_due_date
    await this.scheduleRepo.update(pmWo.scheduleId, {
      nextDueDate,
      lastPerformedAt: new Date(),
    });

    // If findings indicate issue, auto-create reactive ticket
    if (dto.findings && dto.severity === 'requires_repair') {
      await this.ticketsService.create({
        propertyId: pmWo.schedule.propertyId,
        title: `[Follow-up] ${pmWo.schedule.name} — Repair Required`,
        description: dto.findings,
        categoryId: pmWo.schedule.categoryId!,
        priority: 'P2',
        source: 'inspection',
      }, pmWo.schedule.companyId);
    }

    return this.pmWoRepo.findOneOrFail({ where: { id: pmWoId } });
  }

  private computeNextDueDate(schedule: PmSchedule, currentDue: Date): string {
    const base = new Date(currentDue);
    switch (schedule.frequencyType) {
      case 'daily':        return addDays(base, schedule.frequencyValue ?? 1).toISOString().split('T')[0];
      case 'weekly':       return addDays(base, (schedule.frequencyValue ?? 1) * 7).toISOString().split('T')[0];
      case 'monthly':      return addMonths(base, schedule.frequencyValue ?? 1).toISOString().split('T')[0];
      case 'quarterly':    return addMonths(base, 3).toISOString().split('T')[0];
      case 'semi_annual':  return addMonths(base, 6).toISOString().split('T')[0];
      case 'annual':       return addMonths(base, 12).toISOString().split('T')[0];
      case 'custom_days':  return addDays(base, schedule.customDays ?? 30).toISOString().split('T')[0];
      default: return addMonths(base, 1).toISOString().split('T')[0];
    }
  }
}
```

---

## API Contract

### `GET /pm/schedules`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&assetId=&status=active&frequencyType=monthly&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "AC Unit Filter Replacement — Tower A",
      "frequencyType": "monthly",
      "nextDueDate": "2025-02-01",
      "daysUntilDue": 17,
      "status": "active",
      "asset": { "id": "uuid", "name": "AHU-B1-01", "location": "Basement Plant Room" },
      "assignedTo": { "fullName": "Ahmad Tech" },
      "lastPerformedAt": "2025-01-02T00:00:00Z",
      "estimatedHours": 1.5
    }
  ]
}
```

### `POST /pm/schedules`
**Access:** `maintenance.manage`

```json
{
  "propertyId": "uuid",
  "assetId": "uuid",
  "name": "Monthly AC Filter Replacement — Tower A",
  "description": "Replace all AHU filters on floors 1–15",
  "categoryId": "uuid",
  "frequencyType": "monthly",
  "frequencyValue": 1,
  "estimatedHours": 3,
  "nextDueDate": "2025-02-01",
  "advanceDays": 5,
  "assignedTo": "uuid",
  "priority": "P3",
  "checklistTemplate": [
    { "item": "Inspect filter condition", "isRequired": true },
    { "item": "Replace filter if >50% blocked", "isRequired": true },
    { "item": "Log filter change in log book", "isRequired": false }
  ]
}
```

### `PUT /pm/schedules/:id`
### `POST /pm/schedules/:id/pause`
### `POST /pm/schedules/:id/resume`
### `POST /pm/schedules/:id/generate`  
Manually trigger WO generation for this schedule.

### `GET /pm/work-orders`
**Query:** `?propertyId=&scheduleId=&status=scheduled&from=&to=`

### `GET /pm/work-orders/:id`

### `POST /pm/work-orders/:id/complete`

```json
{
  "checklistResults": [
    { "item": "Inspect filter condition", "checked": true, "notes": "Filter at 60% — replaced" },
    { "item": "Replace filter if >50% blocked", "checked": true, "notes": "New filter installed" },
    { "item": "Log filter change in log book", "checked": false, "notes": "" }
  ],
  "findings": "All 15 filters replaced. Unit on floor 8 making slight noise — monitoring.",
  "severity": "monitoring",
  "photos": []
}
```

### `GET /pm/schedules/:id/history`
**Access:** `maintenance.read`

Returns all past PM work orders for this schedule, sorted newest first.

### `GET /assets/:assetId/service-history`
**Access:** `maintenance.read`

Returns all completed PM + reactive tickets linked to this asset.

### `GET /pm/upcoming`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&days=30`

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "scheduleId": "uuid", "name": "AC Filter Check", "dueDate": "2025-02-01", "daysUntilDue": 17, "assignedTo": "Ahmad Tech" },
    { "scheduleId": "uuid", "name": "Fire Suppression Annual Inspection", "dueDate": "2025-02-15", "daysUntilDue": 31 }
  ]
}
```

---

## Business Logic

```
PM WO generation:
  advance_days before next_due_date → Bull job queues PM WO creation
  Idempotency check: skip if PM WO already exists for (schedule_id, due_date)
  Created as maintenance ticket with source='preventive'

Overdue PM:
  If due_date < TODAY and pm_wo status still 'scheduled': set status='overdue'
  Nightly cron (0 0 * * *) marks overdue PM WOs
  Notify property manager of overdue PMs

Finding severity levels:
  'none'           → no follow-up needed
  'monitoring'     → note logged, no ticket
  'requires_repair'→ auto-create reactive ticket (P2)
  'critical'       → auto-create reactive ticket (P1) + notify manager immediately
```

---

## UI Screens

```
admin/maintenance/pm/
├── PmScheduleListPage/
│   └── components/
│       ├── PmScheduleTable.tsx
│       ├── PmScheduleCard.tsx          # name + frequency + next due + assignee
│       ├── DueDateBadge.tsx            # green/amber/red + days count
│       └── CreateScheduleModal.tsx
│           ├── FrequencyPicker.tsx
│           └── ChecklistBuilder.tsx    # drag-to-reorder checklist items

├── PmScheduleDetailPage/
│   └── components/
│       ├── ScheduleHeader.tsx
│       ├── UpcomingWoCard.tsx
│       └── ServiceHistoryTable.tsx     # date | technician | status | findings

├── PmCalendarPage/
│   └── PmCalendar.tsx                  # month view with PM events per day

└── UpcomingPmWidget/                   # used in dashboard
    └── UpcomingPmList.tsx
```

---
---

# Module 4.3 — Facility Management

**Phase:** 4 — Maintenance & Facility Operations  
**Stack:** NestJS · PostgreSQL · React 18 · Redux Toolkit  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 2.1, 4.1, 4.2

---

## Overview

Tracks physical assets and equipment within each property: HVAC units, elevators, generators, fire systems, water tanks, common area equipment. Assets feed into Preventive Maintenance schedules and generate maintenance cost reports. Common Area Maintenance (CAM) cost tracking feeds Phase 6 (Mall Module).

---

## DB Schema

```sql
-- Facility assets (property equipment)
CREATE TABLE facility_assets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id           UUID NOT NULL REFERENCES properties(id),
  asset_number          VARCHAR(50) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  asset_type            VARCHAR(50) NOT NULL,        -- 'hvac'|'elevator'|'generator'|'fire_system'
                                                     -- |'water_pump'|'cctv'|'access_control'|'lighting'|'other'
  make                  VARCHAR(100),
  model                 VARCHAR(100),
  serial_number         VARCHAR(100),
  installation_date     DATE,
  warranty_expiry       DATE,
  expected_lifespan_years SMALLINT,
  location              VARCHAR(255),               -- 'Basement Plant Room', 'Rooftop', etc.
  floor                 VARCHAR(20),
  unit_id               UUID REFERENCES units(id),  -- if within a specific unit
  status                VARCHAR(20) DEFAULT 'operational',
                        -- 'operational'|'under_maintenance'|'decommissioned'|'fault'
  last_serviced_at      DATE,
  next_service_due      DATE,
  responsible_person_id UUID REFERENCES users(id),
  vendor_name           VARCHAR(255),               -- maintenance contractor
  vendor_contact        VARCHAR(100),
  service_contract_no   VARCHAR(100),
  service_contract_expiry DATE,
  purchase_cost         NUMERIC(15,2),
  current_value         NUMERIC(15,2),
  notes                 TEXT,
  photo_url             VARCHAR(500),
  qr_code               VARCHAR(255),               -- QR code for mobile scanning
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asset_number_property UNIQUE (asset_number, property_id)
);

CREATE INDEX idx_facility_assets_property ON facility_assets(property_id);
CREATE INDEX idx_facility_assets_warranty ON facility_assets(warranty_expiry) WHERE warranty_expiry IS NOT NULL;

-- Common area maintenance cost allocations (feeds CAM billing in Phase 6)
CREATE TABLE cam_cost_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  cost_category   VARCHAR(100) NOT NULL,            -- 'cleaning'|'security'|'landscaping'|'utilities'|'insurance'
  description     VARCHAR(500) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  period_month    SMALLINT NOT NULL,                -- 1–12
  period_year     SMALLINT NOT NULL,
  source_type     VARCHAR(30),                      -- 'ap_invoice'|'work_order'|'manual'
  source_id       UUID,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cam_entries_property ON cam_cost_entries(property_id, period_year, period_month);

-- Utility systems (building-level meters)
CREATE TABLE utility_systems (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id),
  system_type     VARCHAR(30) NOT NULL,             -- 'electricity'|'water'|'gas'|'chilled_water'
  meter_id        VARCHAR(100),
  capacity        NUMERIC(12,3),
  unit_of_measure VARCHAR(20),                      -- 'kWh'|'m3'|'litres'
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Service

```typescript
// src/modules/facility/facility.service.ts
@Injectable()
export class FacilityService {
  async create(dto: CreateFacilityAssetDto, companyId: string): Promise<FacilityAsset> {
    const asset = await this.assetRepo.save({ ...dto, companyId });
    // Auto-generate QR code for mobile scanning
    asset.qrCode = `ASSET-${asset.id}`;
    await this.assetRepo.save(asset);
    return asset;
  }

  async getAssetsNeedingService(propertyId: string, withinDays = 30): Promise<FacilityAsset[]> {
    const cutoff = addDays(new Date(), withinDays).toISOString().split('T')[0];
    return this.assetRepo.find({
      where: {
        propertyId,
        nextServiceDue: LessThanOrEqual(cutoff),
        status: Not('decommissioned'),
      },
      order: { nextServiceDue: 'ASC' },
    });
  }

  async getWarrantyExpiring(companyId: string, withinDays = 90): Promise<FacilityAsset[]> {
    const today = new Date().toISOString().split('T')[0];
    const cutoff = addDays(new Date(), withinDays).toISOString().split('T')[0];
    return this.assetRepo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.warranty_expiry BETWEEN :today AND :cutoff', { today, cutoff })
      .orderBy('a.warranty_expiry', 'ASC')
      .getMany();
  }

  async getCamCostSummary(propertyId: string, year: number, month: number): Promise<CamCostSummary> {
    const rows = await this.camEntryRepo
      .createQueryBuilder('c')
      .select('c.cost_category', 'category')
      .addSelect('SUM(c.amount)', 'total')
      .where('c.property_id = :propertyId AND c.period_year = :year AND c.period_month = :month',
        { propertyId, year, month })
      .groupBy('c.cost_category')
      .getRawMany();

    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    return { year, month, categories: rows, total };
  }
}
```

---

## API Contract

### `GET /facility/assets`
**Access:** `facility.read`  
**Query:** `?propertyId=&assetType=hvac&status=operational&serviceOverdue=true&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "assetNumber": "HVAC-B1-01",
      "name": "Air Handling Unit — Basement 1",
      "assetType": "hvac",
      "make": "Carrier",
      "model": "AHU-30XT",
      "serialNumber": "SN-123456",
      "location": "Basement Plant Room",
      "status": "operational",
      "warrantyExpiry": "2026-03-31",
      "daysUntilWarrantyExpiry": 440,
      "nextServiceDue": "2025-02-01",
      "daysUntilService": 17,
      "serviceContractExpiry": "2025-12-31",
      "qrCode": "ASSET-uuid"
    }
  ]
}
```

### `POST /facility/assets`

```json
{
  "propertyId": "uuid",
  "assetNumber": "HVAC-B1-01",
  "name": "Air Handling Unit — Basement 1",
  "assetType": "hvac",
  "make": "Carrier",
  "model": "AHU-30XT",
  "serialNumber": "SN-123456",
  "installationDate": "2020-06-15",
  "warrantyExpiry": "2026-03-31",
  "expectedLifespanYears": 15,
  "location": "Basement Plant Room",
  "floor": "B1",
  "vendorName": "Carrier Singapore",
  "serviceContractNo": "CTR-2025-001",
  "serviceContractExpiry": "2025-12-31",
  "purchaseCost": 28000
}
```

### `GET /facility/assets/:id`
### `PUT /facility/assets/:id`
### `DELETE /facility/assets/:id`

### `GET /facility/assets/:id/scan`
**Access:** Public (QR code scan landing page)  
Returns asset summary for display to scanning technician.

### `GET /facility/assets/service-due`
**Query:** `?propertyId=&days=30`

### `GET /facility/assets/warranty-expiring`
**Query:** `?companyId=&days=90`

### `GET /facility/cam-costs`
**Access:** `facility.read`  
**Query:** `?propertyId=&year=2025&month=1`

### `POST /facility/cam-costs`

```json
{
  "propertyId": "uuid",
  "costCategory": "cleaning",
  "description": "Monthly cleaning services — January 2025",
  "amount": 8500,
  "currency": "SGD",
  "periodMonth": 1,
  "periodYear": 2025,
  "sourceType": "ap_invoice",
  "sourceId": "uuid"
}
```

### `GET /facility/cam-costs/summary`
**Query:** `?propertyId=&year=2025&month=1`

---

## Business Logic

```
Asset QR code scanning (mobile app):
  Tech scans QR → loads asset profile + last service date + next service due
  + open PM schedules for this asset + recent service history
  → one-tap create reactive ticket for this asset

Warranty expiry alerts:
  Cron job daily: assets where warranty_expiry BETWEEN today AND today+90
  Alert levels: 90 days (info), 30 days (warning), 7 days (urgent)
  Notify property manager + responsible person

Service contract expiry: same alert pattern as warranty

CAM cost accumulation:
  Auto-entries created when:
    AP invoice for maintenance vendor marked paid → cam_cost_entry (source=ap_invoice)
    Work order completed with actualCost > 0 → cam_cost_entry (source=work_order)
  Manual entries for insurance, utilities, management fees
  Monthly CAM report = sum by category for billing purposes (Phase 6)
```

---

## UI Screens

```
admin/facility/
├── AssetRegistryPage/
│   └── components/
│       ├── AssetTable.tsx
│       ├── AssetCard.tsx               # asset type icon + name + status + service badge
│       ├── ServiceDueBadge.tsx
│       ├── WarrantyBadge.tsx
│       └── CreateAssetModal.tsx

├── AssetDetailPage/
│   └── components/
│       ├── AssetSummaryCard.tsx
│       ├── AssetPmSchedules.tsx        # linked PM schedules
│       ├── AssetServiceHistory.tsx
│       └── AssetDocuments.tsx          # manuals, warranties from document module

├── CamCostPage/
│   └── components/
│       ├── CamCostTable.tsx
│       ├── CamCostSummaryChart.tsx     # donut by category
│       └── AddCamEntryModal.tsx

└── FacilityAlertWidget/               # dashboard: upcoming service + expiring warranties
```

---

## State Management

```typescript
export const pmApi = createApi({
  reducerPath: 'pmApi',
  tagTypes: ['PmSchedules', 'PmWorkOrders', 'FacilityAssets', 'CamCosts'],
  endpoints: (builder) => ({
    getPmSchedules: builder.query<PaginatedResponse<PmSchedule>, PmScheduleQueryParams>({
      query: (params) => ({ url: '/pm/schedules', params }),
      providesTags: ['PmSchedules'],
    }),
    createPmSchedule: builder.mutation<PmSchedule, CreatePmScheduleDto>({
      query: (body) => ({ url: '/pm/schedules', method: 'POST', body }),
      invalidatesTags: ['PmSchedules'],
    }),
    completePmWorkOrder: builder.mutation<PmWorkOrder, { id: string; data: CompletePmWoDto }>({
      query: ({ id, data }) => ({ url: `/pm/work-orders/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['PmWorkOrders', 'PmSchedules'],
    }),
    getUpcomingPm: builder.query<PmSchedule[], { propertyId?: string; days: number }>({
      query: (params) => ({ url: '/pm/upcoming', params }),
      providesTags: ['PmSchedules'],
    }),
    getFacilityAssets: builder.query<PaginatedResponse<FacilityAsset>, AssetQueryParams>({
      query: (params) => ({ url: '/facility/assets', params }),
      providesTags: ['FacilityAssets'],
    }),
    createFacilityAsset: builder.mutation<FacilityAsset, CreateFacilityAssetDto>({
      query: (body) => ({ url: '/facility/assets', method: 'POST', body }),
      invalidatesTags: ['FacilityAssets'],
    }),
    getServiceDueAssets: builder.query<FacilityAsset[], { propertyId?: string; days: number }>({
      query: (params) => ({ url: '/facility/assets/service-due', params }),
    }),
    getCamCostSummary: builder.query<CamCostSummary, { propertyId: string; year: number; month: number }>({
      query: (params) => ({ url: '/facility/cam-costs/summary', params }),
      providesTags: ['CamCosts'],
    }),
    addCamCostEntry: builder.mutation<CamCostEntry, CreateCamCostDto>({
      query: (body) => ({ url: '/facility/cam-costs', method: 'POST', body }),
      invalidatesTags: ['CamCosts'],
    }),
  }),
});
```
