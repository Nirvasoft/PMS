# Module 4.4 — Inventory & Store Management

**Phase:** 4 — Maintenance & Facility Operations  
**Stack:** NestJS · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 4.1, 3.3 (AP for purchase orders), 3.4 (GL)

---

## Overview

Tracks spare parts, consumables, and maintenance materials. Manages stock movements (goods receipt, issue to work order, transfer, write-off), auto-generates purchase requisitions on reorder breach, and integrates material costs into work order billing.

---

## DB Schema

```sql
-- Stores (physical storage locations per property)
CREATE TABLE stores (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id  UUID NOT NULL REFERENCES properties(id),
  name         VARCHAR(150) NOT NULL,
  location     VARCHAR(255),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory items (parts catalog)
CREATE TABLE inventory_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_code         VARCHAR(50) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),                   -- 'plumbing'|'electrical'|'hvac'|'cleaning'|'general'
  unit_of_measure   VARCHAR(20) NOT NULL,            -- 'pcs'|'meters'|'kg'|'litres'|'roll'|'box'
  unit_cost         NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency          VARCHAR(3) DEFAULT 'USD',
  reorder_point     NUMERIC(10,3) NOT NULL DEFAULT 0,
  reorder_qty       NUMERIC(10,3) NOT NULL DEFAULT 1,
  max_stock         NUMERIC(10,3),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_item_code_company UNIQUE (item_code, company_id)
);

-- Stock levels per item per store
CREATE TABLE stock_levels (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  qty_on_hand  NUMERIC(10,3) NOT NULL DEFAULT 0,
  qty_reserved NUMERIC(10,3) NOT NULL DEFAULT 0,   -- reserved for open WOs
  qty_available NUMERIC(10,3) GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
  last_counted_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_item_store UNIQUE (item_id, store_id)
);

CREATE INDEX idx_stock_levels_store ON stock_levels(store_id);
CREATE INDEX idx_stock_levels_reorder ON stock_levels(item_id)
  WHERE qty_on_hand <= (SELECT reorder_point FROM inventory_items WHERE id = item_id);

-- Stock movements (full audit trail)
CREATE TABLE stock_movements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  item_id           UUID NOT NULL REFERENCES inventory_items(id),
  store_id          UUID NOT NULL REFERENCES stores(id),
  movement_type     VARCHAR(20) NOT NULL,           -- 'receipt'|'issue'|'transfer_in'|'transfer_out'|'adjustment'|'write_off'
  quantity          NUMERIC(10,3) NOT NULL,         -- positive=in, negative=out
  unit_cost         NUMERIC(12,4),
  total_cost        NUMERIC(12,2),
  reference_type    VARCHAR(30),                    -- 'work_order'|'po'|'adjustment'
  reference_id      UUID,
  from_store_id     UUID REFERENCES stores(id),    -- for transfers
  to_store_id       UUID REFERENCES stores(id),    -- for transfers
  notes             TEXT,
  performed_by      UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_item ON stock_movements(item_id, created_at DESC);
CREATE INDEX idx_stock_movements_wo ON stock_movements(reference_type, reference_id);

-- Purchase requisitions (auto-generated on reorder breach)
CREATE TABLE purchase_requisitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  pr_number       VARCHAR(30) NOT NULL UNIQUE,       -- PR-2025-00001
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                  -- 'draft'|'submitted'|'approved'|'rejected'|'ordered'
  items           JSONB NOT NULL,                    -- [{ itemId, itemName, qty, unitCost }]
  total_amount    NUMERIC(15,2),
  requested_by    UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  workflow_instance_id UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Service

```typescript
// src/modules/inventory/inventory.service.ts
@Injectable()
export class InventoryService {
  async issueToWorkOrder(dto: IssueToWorkOrderDto, issuedBy: string): Promise<void> {
    const stockLevel = await this.stockLevelRepo.findOneOrFail({
      where: { itemId: dto.itemId, storeId: dto.storeId },
    });

    if (stockLevel.qtyAvailable < dto.quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        message: `Available: ${stockLevel.qtyAvailable} ${dto.unit}. Requested: ${dto.quantity}`,
      });
    }

    const item = await this.itemRepo.findOneOrFail({ where: { id: dto.itemId } });
    const totalCost = dto.quantity * Number(item.unitCost);

    await this.dataSource.transaction(async (em) => {
      // Deduct stock
      await em.decrement(StockLevel, { itemId: dto.itemId, storeId: dto.storeId }, 'qtyOnHand', dto.quantity);

      // Record movement
      await em.save(StockMovement, {
        companyId: dto.companyId,
        itemId: dto.itemId,
        storeId: dto.storeId,
        movementType: 'issue',
        quantity: -dto.quantity,
        unitCost: item.unitCost,
        totalCost,
        referenceType: 'work_order',
        referenceId: dto.workOrderId,
        performedBy: issuedBy,
      });

      // Update WO materials cost
      await em.increment(WorkOrder, { id: dto.workOrderId }, 'materialsCost', totalCost);
      await em.increment(WorkOrder, { id: dto.workOrderId }, 'totalCost', totalCost);
    });

    // Check if stock fell below reorder point
    await this.checkAndCreateReorderRequest(dto.itemId, dto.storeId, dto.companyId);
  }

  async receiveStock(dto: ReceiveStockDto, receivedBy: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      // Upsert stock level
      const existing = await em.findOne(StockLevel, { where: { itemId: dto.itemId, storeId: dto.storeId } });
      if (existing) {
        await em.increment(StockLevel, { itemId: dto.itemId, storeId: dto.storeId }, 'qtyOnHand', dto.quantity);
      } else {
        await em.save(StockLevel, { itemId: dto.itemId, storeId: dto.storeId, qtyOnHand: dto.quantity });
      }

      // Update item unit cost (weighted average)
      const item = await em.findOne(InventoryItem, { where: { id: dto.itemId } });
      if (item && dto.unitCost) {
        const currentQty = Number(existing?.qtyOnHand ?? 0);
        const newUnitCost = (Number(item.unitCost) * currentQty + dto.unitCost * dto.quantity) / (currentQty + dto.quantity);
        await em.update(InventoryItem, dto.itemId, { unitCost: newUnitCost });
      }

      await em.save(StockMovement, {
        companyId: dto.companyId,
        itemId: dto.itemId,
        storeId: dto.storeId,
        movementType: 'receipt',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        totalCost: (dto.unitCost ?? 0) * dto.quantity,
        referenceType: 'po',
        referenceId: dto.poId,
        notes: dto.notes,
        performedBy: receivedBy,
      });
    });
  }

  private async checkAndCreateReorderRequest(itemId: string, storeId: string, companyId: string): Promise<void> {
    const item = await this.itemRepo.findOneOrFail({ where: { id: itemId } });
    const stock = await this.stockLevelRepo.findOneOrFail({ where: { itemId, storeId } });

    if (stock.qtyOnHand <= item.reorderPoint) {
      // Check no pending PR already exists for this item
      const existingPr = await this.prRepo
        .createQueryBuilder('pr')
        .where("pr.items @> :item", { item: JSON.stringify([{ itemId }]) })
        .andWhere("pr.status NOT IN ('rejected','ordered')")
        .getOne();

      if (!existingPr) {
        await this.prRepo.save({
          companyId,
          propertyId: (await this.storeRepo.findOne({ where: { id: storeId } }))!.propertyId,
          status: 'draft',
          items: [{ itemId, itemName: item.name, qty: item.reorderQty, unitCost: item.unitCost }],
          totalAmount: Number(item.reorderQty) * Number(item.unitCost),
          requestedBy: 'system',
          notes: `Auto-generated: stock fell below reorder point (${stock.qtyOnHand} ≤ ${item.reorderPoint})`,
        });

        await this.notificationsService.send({
          templateCode: 'stock_reorder_required',
          companyId,
          recipientIds: await this.getStoreManagers(companyId),
          channels: ['in_app'],
          variables: { itemName: item.name, currentStock: stock.qtyOnHand, reorderPoint: item.reorderPoint },
        });
      }
    }
  }
}
```

---

## API Contract

### `GET /inventory/items`
**Access:** `inventory.read`  
**Query:** `?companyId=&category=&search=&lowStock=true&page=1&limit=20`

### `POST /inventory/items`

```json
{
  "itemCode": "PIPE-25MM-COPPER",
  "name": "25mm Copper Pipe (per metre)",
  "category": "plumbing",
  "unitOfMeasure": "meters",
  "unitCost": 12.50,
  "currency": "SGD",
  "reorderPoint": 10,
  "reorderQty": 25,
  "maxStock": 100
}
```

### `GET /inventory/items/:id`
### `PUT /inventory/items/:id`

### `GET /inventory/stock-levels`
**Query:** `?storeId=&itemId=&lowStock=true`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "itemId": "uuid",
      "itemCode": "PIPE-25MM-COPPER",
      "itemName": "25mm Copper Pipe",
      "storeId": "uuid",
      "storeName": "Main Store — Tower A",
      "qtyOnHand": 8,
      "qtyReserved": 2,
      "qtyAvailable": 6,
      "reorderPoint": 10,
      "isLowStock": true,
      "unitCost": 12.50
    }
  ]
}
```

### `POST /inventory/movements/receive`

```json
{
  "itemId": "uuid",
  "storeId": "uuid",
  "quantity": 25,
  "unitCost": 12.50,
  "poId": "uuid",
  "notes": "Received against PO-2025-00018"
}
```

### `POST /inventory/movements/issue`

```json
{
  "itemId": "uuid",
  "storeId": "uuid",
  "workOrderId": "uuid",
  "quantity": 3,
  "notes": "Issued for pipe repair WO-2025-00018"
}
```

### `POST /inventory/movements/transfer`

```json
{
  "itemId": "uuid",
  "fromStoreId": "uuid",
  "toStoreId": "uuid",
  "quantity": 5,
  "notes": "Transfer to Tower B store"
}
```

### `POST /inventory/movements/adjust`

```json
{
  "itemId": "uuid",
  "storeId": "uuid",
  "adjustedQty": 12,
  "reason": "Physical count — found 12 units (was showing 15)"
}
```

### `GET /inventory/movements`
**Query:** `?itemId=&storeId=&movementType=&from=&to=&page=1&limit=50`

### `GET /inventory/purchase-requisitions`
### `POST /inventory/purchase-requisitions/:id/submit`
### `POST /inventory/purchase-requisitions/:id/approve`

### `GET /inventory/stores`
### `POST /inventory/stores`

---

## Business Logic

```
Stock valuation: weighted average cost method
  On each receipt: recalculate item.unitCost = (current_qty × current_cost + new_qty × new_cost) / (current_qty + new_qty)

Issue to WO:
  Deduct qtyOnHand, record movement type='issue'
  Update WO.materialsCost and WO.totalCost atomically
  Check reorder threshold → auto-PR if breached

Physical count adjustment:
  adjustedQty = new actual quantity
  difference = adjustedQty - current qtyOnHand
  Record movement type='adjustment', quantity=difference (positive or negative)
  If negative adjustment: record as inventory shrinkage → GL posting (Dr Shrinkage Expense / Cr Inventory)

Reserved stock:
  When WO is created requesting materials: increment qty_reserved
  When materials issued: decrement qty_reserved (already deducted from qty_on_hand)
  When WO cancelled: decrement qty_reserved (no change to qty_on_hand)
```

---

## UI Screens

```
admin/inventory/
├── InventoryDashboard/
│   └── components/
│       ├── LowStockAlerts.tsx          # items below reorder point
│       ├── RecentMovements.tsx
│       └── StockValueSummary.tsx       # total inventory value

├── ItemCatalogPage/
│   └── components/
│       ├── ItemTable.tsx
│       ├── LowStockBadge.tsx
│       └── CreateItemModal.tsx

├── StockLevelsPage/
│   └── components/
│       ├── StockTable.tsx              # item + store + on_hand + reserved + available
│       ├── StockLevelBar.tsx           # visual on_hand/max bar
│       └── QuickIssueModal.tsx

├── MovementsPage/
│   └── MovementTable.tsx               # full movement log

├── ReceiveStockModal.tsx
├── IssueStockModal.tsx
├── TransferStockModal.tsx
└── PurchaseRequisitionsPage/
    └── PrTable.tsx
```

---
---

# Module 4.5 — Housekeeping Management

**Phase:** 4  
**Estimated Effort:** 1 week (0.75 backend, 0.25 frontend)  
**Depends On:** Module 2.1, 4.1

---

## DB Schema

```sql
-- Housekeeping zones
CREATE TABLE housekeeping_zones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         VARCHAR(150) NOT NULL,              -- 'Lobby', 'Level 5 Corridor', 'Car Park B1'
  zone_type    VARCHAR(30),                        -- 'corridor'|'lobby'|'car_park'|'amenity'|'office'
  floor        VARCHAR(20),
  area_sqm     NUMERIC(10,2),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleaning schedules
CREATE TABLE cleaning_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  zone_id         UUID NOT NULL REFERENCES housekeeping_zones(id),
  name            VARCHAR(255) NOT NULL,
  frequency_type  VARCHAR(20) NOT NULL,            -- 'daily'|'weekly'|'monthly'|'custom'
  days_of_week    SMALLINT[],                      -- 0=Sun...6=Sat for weekly
  scheduled_time  TIME,
  duration_minutes SMALLINT,
  assigned_to     UUID REFERENCES users(id),
  staff_count     SMALLINT DEFAULT 1,
  cleaning_type   VARCHAR(30),                     -- 'routine'|'deep_clean'|'sanitization'
  checklist       JSONB DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleaning tasks (generated from schedules, daily)
CREATE TABLE cleaning_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id     UUID NOT NULL REFERENCES cleaning_schedules(id),
  zone_id         UUID NOT NULL REFERENCES housekeeping_zones(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  assigned_to     UUID REFERENCES users(id),
  task_date       DATE NOT NULL,
  scheduled_time  TIME,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                  -- 'pending'|'in_progress'|'completed'|'missed'
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  checklist_results JSONB DEFAULT '[]',
  quality_score   SMALLINT,                        -- 1-5 from supervisor inspection
  notes           TEXT,
  photos          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cleaning_tasks_date ON cleaning_tasks(task_date, property_id);
CREATE INDEX idx_cleaning_tasks_assigned ON cleaning_tasks(assigned_to, task_date);

-- Housekeeping inspections
CREATE TABLE housekeeping_inspections (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id      UUID NOT NULL REFERENCES properties(id),
  company_id       UUID NOT NULL REFERENCES companies(id),
  zone_id          UUID REFERENCES housekeeping_zones(id),
  inspected_by     UUID NOT NULL REFERENCES users(id),
  inspection_date  DATE NOT NULL,
  overall_score    SMALLINT,                       -- 1-5
  checklist        JSONB NOT NULL,                 -- [{ item, score, notes, photoUrl }]
  issues_found     TEXT[],
  action_required  BOOLEAN DEFAULT FALSE,
  ticket_id        UUID REFERENCES maintenance_tickets(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Service

```typescript
// src/modules/housekeeping/housekeeping.service.ts
@Injectable()
export class HousekeepingService {
  @Cron('0 4 * * *')
  async generateDailyTasks(): Promise<void> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();

    const schedules = await this.scheduleRepo.find({ where: { status: 'active' } });
    const toCreate: Partial<CleaningTask>[] = [];

    for (const sched of schedules) {
      let shouldCreate = false;
      switch (sched.frequencyType) {
        case 'daily': shouldCreate = true; break;
        case 'weekly': shouldCreate = sched.daysOfWeek?.includes(dayOfWeek) ?? false; break;
        case 'monthly': shouldCreate = today.getDate() === 1; break;
        case 'custom': shouldCreate = await this.isCustomDue(sched, today); break;
      }

      if (shouldCreate) {
        const alreadyCreated = await this.taskRepo.findOne({ where: { scheduleId: sched.id, taskDate: todayStr } });
        if (!alreadyCreated) {
          toCreate.push({
            scheduleId: sched.id,
            zoneId: sched.zoneId,
            propertyId: sched.propertyId,
            companyId: sched.companyId,
            assignedTo: sched.assignedTo,
            taskDate: todayStr,
            scheduledTime: sched.scheduledTime,
            status: 'pending',
          });
        }
      }
    }
    if (toCreate.length) await this.taskRepo.save(toCreate);
  }
}
```

---

## API Contract

### `GET /housekeeping/zones`
### `POST /housekeeping/zones`
### `GET /housekeeping/schedules`
### `POST /housekeeping/schedules`

```json
{
  "propertyId": "uuid",
  "zoneId": "uuid",
  "name": "Daily Lobby Cleaning",
  "frequencyType": "daily",
  "scheduledTime": "07:00",
  "durationMinutes": 60,
  "assignedTo": "uuid",
  "cleaningType": "routine",
  "checklist": [
    { "item": "Mop lobby floor", "isRequired": true },
    { "item": "Clean glass entrance doors", "isRequired": true },
    { "item": "Empty waste bins", "isRequired": true },
    { "item": "Check plant condition", "isRequired": false }
  ]
}
```

### `GET /housekeeping/tasks`
**Query:** `?propertyId=&date=2025-01-15&assignedTo=&status=pending`

### `POST /housekeeping/tasks/:id/start`
### `POST /housekeeping/tasks/:id/complete`

```json
{
  "checklistResults": [
    { "item": "Mop lobby floor", "checked": true, "notes": "" },
    { "item": "Clean glass doors", "checked": true, "notes": "Used glass cleaner" }
  ],
  "notes": "All done. Minor scratch on door frame — reported.",
  "qualityScore": 4,
  "photos": []
}
```

### `POST /housekeeping/inspections`

```json
{
  "propertyId": "uuid",
  "zoneId": "uuid",
  "inspectionDate": "2025-01-15",
  "overallScore": 4,
  "checklist": [
    { "item": "Floor cleanliness", "score": 5, "notes": "" },
    { "item": "Glass doors", "score": 3, "notes": "Streaks visible" }
  ],
  "issuesFound": ["Streaks on lobby glass doors"],
  "actionRequired": false
}
```

### `GET /housekeeping/stats`
**Query:** `?propertyId=&from=&to=`

---
---

# Module 4.6 — Security Management

**Phase:** 4  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 2.1, 1.5 (Notifications)

---

## DB Schema

```sql
-- Security incidents
CREATE TABLE security_incidents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id      UUID NOT NULL REFERENCES properties(id),
  incident_number  VARCHAR(30) NOT NULL UNIQUE,    -- INC-2025-00001
  incident_type    VARCHAR(50) NOT NULL,            -- 'theft'|'vandalism'|'trespassing'|'fire'
                                                   -- |'medical'|'accident'|'suspicious_activity'|'other'
  severity         VARCHAR(10) NOT NULL DEFAULT 'medium',
                   -- 'low'|'medium'|'high'|'critical'
  title            VARCHAR(255) NOT NULL,
  description      TEXT NOT NULL,
  location_detail  VARCHAR(255),
  unit_id          UUID REFERENCES units(id),
  incident_at      TIMESTAMPTZ NOT NULL,
  reported_by      UUID NOT NULL REFERENCES users(id),
  assigned_to      UUID REFERENCES users(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'open',
                   -- 'open'|'investigating'|'resolved'|'closed'|'escalated'
  resolution       TEXT,
  resolved_at      TIMESTAMPTZ,
  police_report_no VARCHAR(100),
  involves_tenant  BOOLEAN DEFAULT FALSE,
  tenant_id        UUID REFERENCES tenants(id),
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_notes  TEXT,
  photos           JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_property ON security_incidents(property_id, incident_at DESC);
CREATE INDEX idx_incidents_status ON security_incidents(status) WHERE status NOT IN ('closed');

-- Guard patrol checkpoints
CREATE TABLE patrol_checkpoints (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         VARCHAR(150) NOT NULL,              -- 'Main Gate', 'Basement B1', 'Rooftop'
  location     VARCHAR(255),
  qr_code      VARCHAR(255) NOT NULL UNIQUE,       -- QR/NFC tag value
  floor        VARCHAR(20),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patrol schedules
CREATE TABLE patrol_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            VARCHAR(150) NOT NULL,
  checkpoints     UUID[],                          -- ordered list of checkpoint IDs
  frequency_type  VARCHAR(20) NOT NULL,            -- 'hourly'|'every_2h'|'every_4h'|'custom'
  custom_times    TIME[],
  assigned_to     UUID REFERENCES users(id),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patrol logs (guard scans checkpoint QR/NFC)
CREATE TABLE patrol_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id     UUID REFERENCES patrol_schedules(id),
  checkpoint_id   UUID NOT NULL REFERENCES patrol_checkpoints(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  guard_id        UUID NOT NULL REFERENCES users(id),
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_at     TIMESTAMPTZ,
  is_on_time      BOOLEAN,
  notes           TEXT,
  lat             NUMERIC(9,6),
  lng             NUMERIC(9,6)
);

CREATE INDEX idx_patrol_logs_property ON patrol_logs(property_id, scanned_at DESC);
CREATE INDEX idx_patrol_logs_guard ON patrol_logs(guard_id, scanned_at DESC);

-- Access control events (synced from HID/Suprema hardware)
CREATE TABLE access_control_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  device_id       VARCHAR(100) NOT NULL,
  device_name     VARCHAR(150),
  door_name       VARCHAR(150),
  card_number     VARCHAR(100),
  user_id         UUID REFERENCES users(id),
  tenant_id       UUID REFERENCES tenants(id),
  event_type      VARCHAR(20) NOT NULL,             -- 'access_granted'|'access_denied'|'door_forced'|'door_held_open'
  event_at        TIMESTAMPTZ NOT NULL,
  denial_reason   VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ace_property ON access_control_events(property_id, event_at DESC);
```

### Service

```typescript
// src/modules/security/security.service.ts
@Injectable()
export class SecurityService {
  async createIncident(dto: CreateIncidentDto, reportedBy: string): Promise<SecurityIncident> {
    const incident = await this.incidentRepo.save({
      ...dto,
      reportedBy,
      status: 'open',
    });

    // Notify security manager + property manager
    const managers = await this.getSecurityManagers(dto.propertyId);
    await this.notificationsService.send({
      templateCode: 'security_incident_reported',
      companyId: dto.companyId,
      recipientIds: managers,
      channels: dto.severity === 'critical' ? ['email', 'sms', 'push', 'in_app'] : ['push', 'in_app'],
      variables: {
        incidentNumber: incident.incidentNumber,
        incidentType: incident.incidentType,
        severity: incident.severity,
        location: incident.locationDetail,
        description: incident.description.substring(0, 100),
      },
    });

    return incident;
  }

  async logPatrolCheckpoint(guardId: string, qrCode: string, lat?: number, lng?: number): Promise<PatrolLog> {
    const checkpoint = await this.checkpointRepo.findOne({ where: { qrCode } });
    if (!checkpoint) throw new NotFoundException('Invalid checkpoint QR code');

    const log = await this.patrolLogRepo.save({
      checkpointId: checkpoint.id,
      propertyId: checkpoint.propertyId,
      companyId: checkpoint.companyId,
      guardId,
      scannedAt: new Date(),
      lat,
      lng,
    });

    // Check for missed checkpoints (patrol gap > expected interval)
    await this.checkMissedPatrol(checkpoint.propertyId, guardId);
    return log;
  }

  private async checkMissedPatrol(propertyId: string, guardId: string): Promise<void> {
    const lastLog = await this.patrolLogRepo.findOne({
      where: { propertyId, guardId },
      order: { scannedAt: 'DESC' },
      skip: 1,  // skip current
    });

    if (lastLog) {
      const gapMinutes = (Date.now() - lastLog.scannedAt.getTime()) / 60000;
      if (gapMinutes > 90) { // missed patrol window
        await this.notificationsService.send({
          templateCode: 'patrol_gap_detected',
          companyId: lastLog.companyId,
          recipientIds: await this.getSecurityManagers(propertyId),
          channels: ['push', 'in_app'],
          variables: { guardName: 'Guard', gapMinutes: Math.round(gapMinutes), propertyId },
        });
      }
    }
  }

  async handleAccessControlWebhook(dto: AccessControlEventDto): Promise<void> {
    await this.aceRepo.save(dto);

    if (dto.eventType === 'door_forced') {
      // Auto-create security incident
      await this.createIncident({
        propertyId: dto.propertyId,
        companyId: dto.companyId,
        incidentType: 'trespassing',
        severity: 'high',
        title: `Door forced open — ${dto.doorName}`,
        description: `Access control detected forced door opening at ${dto.doorName}`,
        locationDetail: dto.doorName,
        incidentAt: dto.eventAt,
      }, 'system');
    }
  }
}
```

---

## API Contract

### `GET /security/incidents`
**Access:** `security.read`  
**Query:** `?propertyId=&severity=&status=open&incidentType=&from=&to=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "incidentNumber": "INC-2025-00018",
      "incidentType": "theft",
      "severity": "high",
      "title": "Bicycle theft at car park B1",
      "status": "investigating",
      "incidentAt": "2025-01-15T22:30:00Z",
      "reportedBy": { "fullName": "Security Officer Raju" },
      "assignedTo": { "fullName": "Sgt Ahmad" },
      "policeReportNo": null,
      "createdAt": "2025-01-15T22:35:00Z"
    }
  ]
}
```

### `POST /security/incidents`

```json
{
  "propertyId": "uuid",
  "incidentType": "theft",
  "severity": "high",
  "title": "Bicycle theft at car park B1",
  "description": "Tenant reported bicycle missing from slot B1-045. CCTV footage needed.",
  "locationDetail": "Car Park B1, slot 045",
  "incidentAt": "2025-01-15T22:30:00Z",
  "policeReportNo": null,
  "involvesTenant": true,
  "tenantId": "uuid",
  "followUpRequired": true,
  "followUpNotes": "Review CCTV footage for 21:00-23:00"
}
```

### `GET /security/incidents/:id`
### `PUT /security/incidents/:id`

### `POST /security/incidents/:id/resolve`

```json
{
  "resolution": "CCTV identified suspect. Police report filed. Tenant notified.",
  "policeReportNo": "RPT-2025-00123"
}
```

---

### Patrol

### `GET /security/patrol/checkpoints`
**Query:** `?propertyId=`

### `POST /security/patrol/checkpoints`

```json
{
  "propertyId": "uuid",
  "name": "Main Entrance Gate",
  "location": "Ground floor, east wing",
  "floor": "G"
}
```

### `POST /security/patrol/scan`
**Access:** Security App (guard)

```json
{
  "qrCode": "CHKPT-uuid",
  "lat": 1.2842,
  "lng": 103.8512
}
```

### `GET /security/patrol/logs`
**Query:** `?propertyId=&guardId=&from=&to=&page=1&limit=50`

### `GET /security/patrol/schedules`
### `POST /security/patrol/schedules`

### `GET /security/access-events`
**Query:** `?propertyId=&eventType=access_denied&from=&to=&page=1&limit=50`

### `POST /security/access-events/webhook`
**Access:** Internal (access control hardware)

### `GET /security/stats`
**Query:** `?propertyId=&from=&to=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "incidentSummary": { "total": 8, "open": 2, "resolved": 5, "closed": 1 },
    "bySeverity": { "low": 3, "medium": 3, "high": 2, "critical": 0 },
    "byType": [{ "type": "theft", "count": 3 }, { "type": "vandalism", "count": 2 }],
    "patrolCompliance": { "scheduled": 48, "completed": 45, "missed": 3, "complianceRate": 93.8 },
    "accessDenied24h": 7
  }
}
```

---

## UI Screens (All Phase 4 Security + Housekeeping)

```
admin/security/
├── SecurityDashboard/
│   └── components/
│       ├── IncidentSummaryCards.tsx    # open | investigating | by severity
│       ├── PatrolComplianceWidget.tsx
│       └── AccessDeniedFeed.tsx        # real-time denied access events

├── IncidentListPage/
│   └── components/
│       ├── IncidentTable.tsx
│       ├── SeverityBadge.tsx          # critical(red)/high(orange)/medium(yellow)/low(gray)
│       └── CreateIncidentModal.tsx

├── IncidentDetailPage/
│   └── components/
│       ├── IncidentHeader.tsx
│       ├── IncidentTimeline.tsx
│       ├── PhotoEvidence.tsx
│       └── ResolveIncidentModal.tsx

├── PatrolManagementPage/
│   └── components/
│       ├── CheckpointMap.tsx           # property map with checkpoint pins
│       ├── PatrolLogTable.tsx          # guard | checkpoint | time | on_time badge
│       ├── PatrolScheduleCard.tsx
│       └── MissedPatrolAlert.tsx

└── AccessControlPage/
    └── AccessEventTable.tsx            # card | door | event type | time

admin/housekeeping/
├── HousekeepingDashboard/
│   └── components/
│       ├── TaskCompletionRate.tsx      # today's tasks: done/pending/missed
│       ├── ZoneScoreHeatmap.tsx        # property map colored by last inspection score
│       └── ScheduleCalendar.tsx

├── TaskListPage/
│   └── components/
│       ├── TaskTable.tsx
│       ├── TaskStatusBadge.tsx
│       └── CompleteTaskModal/
│           ├── ChecklistForm.tsx
│           └── PhotoUploadSection.tsx

└── InspectionPage/
    └── components/
        ├── InspectionForm.tsx          # zone selector + per-item scoring
        └── InspectionScoreCard.tsx     # 1-5 with color coding
```

---

## Phase 4 Combined State Management

```typescript
export const inventoryApi = createApi({
  reducerPath: 'inventoryApi',
  tagTypes: ['Items', 'StockLevels', 'Movements', 'PurchaseRequisitions'],
  endpoints: (builder) => ({
    getInventoryItems: builder.query<PaginatedResponse<InventoryItem>, ItemQueryParams>({
      query: (params) => ({ url: '/inventory/items', params }),
      providesTags: ['Items'],
    }),
    getStockLevels: builder.query<StockLevel[], StockLevelQueryParams>({
      query: (params) => ({ url: '/inventory/stock-levels', params }),
      providesTags: ['StockLevels'],
    }),
    receiveStock: builder.mutation<void, ReceiveStockDto>({
      query: (body) => ({ url: '/inventory/movements/receive', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'Movements'],
    }),
    issueStock: builder.mutation<void, IssueStockDto>({
      query: (body) => ({ url: '/inventory/movements/issue', method: 'POST', body }),
      invalidatesTags: ['StockLevels', 'Movements'],
    }),
    getMovements: builder.query<PaginatedResponse<StockMovement>, MovementQueryParams>({
      query: (params) => ({ url: '/inventory/movements', params }),
      providesTags: ['Movements'],
    }),
  }),
});

export const securityApi = createApi({
  reducerPath: 'securityApi',
  tagTypes: ['Incidents', 'PatrolLogs', 'Checkpoints', 'AccessEvents'],
  endpoints: (builder) => ({
    getIncidents: builder.query<PaginatedResponse<SecurityIncident>, IncidentQueryParams>({
      query: (params) => ({ url: '/security/incidents', params }),
      providesTags: ['Incidents'],
    }),
    createIncident: builder.mutation<SecurityIncident, CreateIncidentDto>({
      query: (body) => ({ url: '/security/incidents', method: 'POST', body }),
      invalidatesTags: ['Incidents'],
    }),
    resolveIncident: builder.mutation<void, { id: string; resolution: string; policeReportNo?: string }>({
      query: ({ id, ...body }) => ({ url: `/security/incidents/${id}/resolve`, method: 'POST', body }),
      invalidatesTags: ['Incidents'],
    }),
    scanPatrolCheckpoint: builder.mutation<PatrolLog, { qrCode: string; lat?: number; lng?: number }>({
      query: (body) => ({ url: '/security/patrol/scan', method: 'POST', body }),
      invalidatesTags: ['PatrolLogs'],
    }),
    getPatrolLogs: builder.query<PaginatedResponse<PatrolLog>, PatrolLogQueryParams>({
      query: (params) => ({ url: '/security/patrol/logs', params }),
      providesTags: ['PatrolLogs'],
    }),
    getSecurityStats: builder.query<SecurityStats, { propertyId?: string; from?: string; to?: string }>({
      query: (params) => ({ url: '/security/stats', params }),
    }),
  }),
});

export const housekeepingApi = createApi({
  reducerPath: 'housekeepingApi',
  tagTypes: ['CleaningTasks', 'CleaningSchedules', 'Inspections'],
  endpoints: (builder) => ({
    getCleaningTasks: builder.query<PaginatedResponse<CleaningTask>, CleaningTaskQueryParams>({
      query: (params) => ({ url: '/housekeeping/tasks', params }),
      providesTags: ['CleaningTasks'],
    }),
    completeCleaningTask: builder.mutation<void, { id: string; data: CompleteTaskDto }>({
      query: ({ id, data }) => ({ url: `/housekeeping/tasks/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['CleaningTasks'],
    }),
    createInspection: builder.mutation<HousekeepingInspection, CreateInspectionDto>({
      query: (body) => ({ url: '/housekeeping/inspections', method: 'POST', body }),
      invalidatesTags: ['Inspections'],
    }),
    getSchedules: builder.query<CleaningSchedule[], { propertyId?: string }>({
      query: (params) => ({ url: '/housekeeping/schedules', params }),
      providesTags: ['CleaningSchedules'],
    }),
    createSchedule: builder.mutation<CleaningSchedule, CreateCleaningScheduleDto>({
      query: (body) => ({ url: '/housekeeping/schedules', method: 'POST', body }),
      invalidatesTags: ['CleaningSchedules'],
    }),
  }),
});
```
