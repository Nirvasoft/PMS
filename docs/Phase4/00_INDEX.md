# PMS — Phase 4: Maintenance & Facility Operations
## Developer Specification Index

**Tech Stack:** Node.js 20+ · Express · Prisma · TypeScript · PostgreSQL 15+ · Redis 7+ · Socket.IO · React 18 · Redux Toolkit  
**Timeline:** Months 10–12  
**Depends On:** Phase 1 + Phase 2 + Phase 3 (all modules)  
**Total Effort:** ~11 developer-weeks

---

## Module Index

| File | Modules Covered | Backend | Frontend |
|------|----------------|---------|----------|
| `01_maintenance_management.md` | 4.1 Maintenance Management | 2 weeks | 1 week |
| `02_preventive_maintenance_and_03_facility_management.md` | 4.2 Preventive Maintenance + 4.3 Facility Mgmt | 2.5 weeks | 0.5 weeks |
| `03_inventory_housekeeping_security.md` | 4.4 Inventory + 4.5 Housekeeping + 4.6 Security | 3 weeks | 1 week |

---

## Dependency Graph (Phase 4)

```
Phase 3 (all modules)
    └─► 4.1 Maintenance Management (reactive ticketing)
            ├─► 4.2 Preventive Maintenance (PM schedules → tickets)
            │       └─► 4.3 Facility Management (asset register)
            └─► 4.4 Inventory & Store (materials → WO cost)
                    └─► Phase 3.3 AP (purchase requisitions)
                    └─► Phase 3.4 GL (inventory cost postings)
    └─► 4.5 Housekeeping (cleaning tasks)
    └─► 4.6 Security Management (incidents + patrol)
```

Build order: 4.3 Facility → 4.1 Maintenance → 4.2 PM → 4.4 Inventory → (4.5 + 4.6 in parallel)

---

## Cross-Cutting Concerns (Phase 4)

### 1. Ticket Number Sequences

All Phase 4 entities use the same company-scoped sequence pattern from Phase 2/3:

```typescript
// Sequences needed:
// TKT-{YYYY}-{NNNNN} → maintenance_tickets
// WO-{YYYY}-{NNNNN}  → work_orders
// INC-{YYYY}-{NNNNN} → security_incidents
// PR-{YYYY}-{NNNNN}  → purchase_requisitions

// Reuse the next_company_seq() function from Phase 2 migration
CREATE TRIGGER trg_ticket_number
BEFORE INSERT ON maintenance_tickets
FOR EACH ROW WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
EXECUTE FUNCTION generate_company_seq_number('TKT', 'maintenance_ticket');
```

### 2. Work Order GL Cost Posting

When a work order is completed with `totalCost > 0`, a GL journal is auto-posted:

```typescript
// Dr: Maintenance Expense (5100)
// Cr: Accrued Expenses Payable (2300) — until matched to AP invoice
// OR
// Cr: Cash (if paid directly from petty cash)

// Hook in WorkOrdersService.complete():
if (wo.totalCost > 0) {
  await this.glService.postJournal({
    entryType: 'work_order',
    referenceType: 'work_order',
    referenceId: wo.id,
    description: `Maintenance cost — ${wo.woNumber}`,
    lines: [
      { accountCode: '5100', debit: wo.totalCost, credit: 0 },   // Maintenance Expense
      { accountCode: '2300', debit: 0, credit: wo.totalCost },   // Accrued Payable
    ],
  });
}
```

### 3. SLA Working Hours Calculator

For SLA configs with `workingHoursOnly = true`:

```typescript
// src/modules/maintenance/utils/working-hours.util.ts
export function addWorkingHours(from: Date, hours: number, workingHours: WorkingHours): Date {
  let remaining = hours * 60; // in minutes
  let current = new Date(from);

  while (remaining > 0) {
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][current.getDay()];
    const dayHours = workingHours[dayOfWeek];

    if (!dayHours) {
      // Non-working day: advance to next day 08:00
      current = new Date(current);
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
      continue;
    }

    const [startHour, endHour] = dayHours.split('-').map(t => {
      const [h, m] = t.split(':').map(Number);
      return h + m / 60;
    });

    const currentHour = current.getHours() + current.getMinutes() / 60;

    if (currentHour < startHour) {
      current.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
    }

    if (currentHour >= endHour) {
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
      continue;
    }

    const availableMinutes = (endHour - Math.max(currentHour, startHour)) * 60;
    if (remaining <= availableMinutes) {
      current = addMinutes(current, remaining);
      remaining = 0;
    } else {
      remaining -= availableMinutes;
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
    }
  }
  return current;
}
```

### 4. Cron Jobs (Phase 4)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `pm-wo-generation` | `0 6 * * *` | Generate PM work orders due within advance_days |
| `pm-overdue-check` | `0 0 * * *` | Mark PM work orders overdue |
| `cleaning-task-generation` | `0 4 * * *` | Generate daily cleaning tasks |
| `asset-warranty-alerts` | `0 7 * * *` | Alert on expiring warranties (90/30/7 days) |
| `stock-reorder-check` | `0 5 * * *` | Check stock levels and create PRs |
| `patrol-gap-monitor` | `*/30 * * * *` | Check for patrol gaps > threshold |

### 5. Mobile App Integration (Phase 4)

Phase 4 introduces the **Technician App** and **Security App**. These React Native apps consume the same APIs with mobile-specific considerations:

```typescript
// Technician App key endpoints:
GET  /maintenance/work-orders?assignedTo={myUserId}&status=pending,accepted,in_progress
POST /maintenance/work-orders/:id/start
POST /maintenance/work-orders/:id/complete
POST /maintenance/tickets/:id/photos  (multipart, from camera)
GET  /pm/work-orders?assignedTo={myUserId}&status=scheduled

// Security App key endpoints:
POST /security/patrol/scan              (QR/NFC scan)
POST /security/incidents                (create incident with photos)
GET  /security/incidents?propertyId=&status=open
GET  /security/patrol/logs?guardId={myUserId}&from={today}

// Both apps:
// - GPS coordinates sent with patrol scans
// - Offline queue: if no network, store actions locally, sync on reconnect
// - Push notifications via FCM for new assignments and SLA breaches
```

### 6. New Notification Templates (Phase 4)

```typescript
export const PHASE4_NOTIFICATION_TEMPLATES = [
  { code: 'ticket_created',            name: 'Maintenance Ticket Created',      channels: ['in_app', 'push'] },
  { code: 'work_order_assigned',       name: 'Work Order Assigned',             channels: ['push', 'in_app'] },
  { code: 'ticket_completed',          name: 'Maintenance Ticket Completed',    channels: ['in_app', 'push'] },
  { code: 'ticket_sla_breach',         name: 'SLA Breach Alert',               channels: ['email', 'push', 'in_app'] },
  { code: 'ticket_sla_warning',        name: 'SLA Warning (2h remaining)',      channels: ['push', 'in_app'] },
  { code: 'ticket_escalated',          name: 'Ticket Escalated',               channels: ['push', 'in_app'] },
  { code: 'rate_maintenance_request',  name: 'Rate Your Maintenance Request',   channels: ['push', 'in_app'] },
  { code: 'pm_due_reminder',           name: 'PM Schedule Due Soon',           channels: ['in_app', 'push'] },
  { code: 'pm_overdue',                name: 'PM Schedule Overdue',            channels: ['email', 'in_app'] },
  { code: 'asset_warranty_expiring',   name: 'Asset Warranty Expiring',        channels: ['email', 'in_app'] },
  { code: 'stock_reorder_required',    name: 'Stock Reorder Required',         channels: ['in_app'] },
  { code: 'security_incident_reported',name: 'Security Incident Reported',     channels: ['push', 'in_app'] },
  { code: 'patrol_gap_detected',       name: 'Patrol Gap Detected',            channels: ['push', 'in_app'] },
];
```

### 7. New Dashboard Widgets (Phase 4)

```typescript
export const PHASE4_WIDGETS = [
  // Already seeded with real providers now:
  { code: 'maintenance_open',      category: 'maintenance', widgetType: 'kpi_card' },
  { code: 'maintenance_sla',       category: 'maintenance', widgetType: 'kpi_card' },
  { code: 'tickets_by_category',   category: 'maintenance', widgetType: 'pie_chart' },
  { code: 'maintenance_trend',     category: 'maintenance', widgetType: 'line_chart' },
  // New Phase 4:
  { code: 'pm_compliance_rate',    category: 'maintenance', widgetType: 'gauge',      requiredPermissions: ['maintenance.read'] },
  { code: 'upcoming_pm_count',     category: 'maintenance', widgetType: 'kpi_card',   requiredPermissions: ['maintenance.read'] },
  { code: 'avg_ticket_rating',     category: 'maintenance', widgetType: 'kpi_card',   requiredPermissions: ['maintenance.read'] },
  { code: 'low_stock_items',       category: 'facility',    widgetType: 'kpi_card',   requiredPermissions: ['inventory.read'] },
  { code: 'incidents_this_week',   category: 'security',    widgetType: 'kpi_card',   requiredPermissions: ['security.read'] },
  { code: 'patrol_compliance',     category: 'security',    widgetType: 'gauge',      requiredPermissions: ['security.read'] },
  { code: 'cleaning_completion',   category: 'facility',    widgetType: 'gauge',      requiredPermissions: ['housekeeping.read'] },
];
```

### 8. Phase 4 Migration Files

```
migrations/
├── 1700030001-create-maintenance-categories.ts
├── 1700030002-create-maintenance-sla-configs.ts
├── 1700030003-create-maintenance-tickets.ts
├── 1700030004-create-work-orders.ts
├── 1700030005-create-technician-profiles.ts
├── 1700030006-create-ticket-photos.ts
├── 1700030007-create-sla-breach-events.ts
├── 1700030008-create-pm-schedules.ts
├── 1700030009-create-pm-work-orders.ts
├── 1700030010-create-facility-assets.ts
├── 1700030011-create-cam-cost-entries.ts
├── 1700030012-create-stores.ts
├── 1700030013-create-inventory-items.ts
├── 1700030014-create-stock-levels.ts
├── 1700030015-create-stock-movements.ts
├── 1700030016-create-purchase-requisitions.ts
├── 1700030017-create-housekeeping-zones.ts
├── 1700030018-create-cleaning-schedules.ts
├── 1700030019-create-cleaning-tasks.ts
├── 1700030020-create-housekeeping-inspections.ts
├── 1700030021-create-security-incidents.ts
├── 1700030022-create-patrol-checkpoints.ts
├── 1700030023-create-patrol-schedules.ts
├── 1700030024-create-patrol-logs.ts
├── 1700030025-create-access-control-events.ts
├── 1700030026-seed-maintenance-categories.ts
└── 1700030027-seed-phase4-notification-templates.ts
```

---

## Phase 4 Acceptance Criteria

- [ ] P1 ticket creation → auto-assignment algorithm selects best technician within 30 seconds
- [ ] SLA breach: after configured time, breach event fires, escalation notification received
- [ ] Work order complete → ticket status updates, GL journal posted, tenant rating request queued
- [ ] PM WO generated 7 days before due date (advance_days=7) via cron job
- [ ] PM completion with severity='requires_repair' → reactive ticket auto-created
- [ ] Monthly depreciation for facility assets: amounts match straight-line formula
- [ ] Stock issue to WO: qty_on_hand decremented, WO.materialsCost updated atomically
- [ ] Auto-PR created when stock falls below reorder_point (test with manual adjustment)
- [ ] Daily cleaning tasks generated for all active schedules (test for weekly schedules on correct days)
- [ ] Inspection score saved, issue-flagged inspections create maintenance tickets
- [ ] Security incident: P1/critical → SMS + push sent to all security managers
- [ ] Patrol checkpoint scan: log created, GPS recorded, gap >90min triggers alert
- [ ] Access control webhook (door_forced) → auto-incident created
- [ ] Real-time WebSocket: ticket creation visible in kanban without page refresh
- [ ] All Phase 4 cron jobs verified with test data in staging environment
- [ ] Technician App: WO list loads, start/complete flow works end-to-end
- [ ] Security App: checkpoint scan, incident create with photo upload — all functional
- [ ] Performance: `/maintenance/tickets` with 5,000 tickets responds p95 < 300ms
- [ ] UAT sign-off from Operations/Facilities stakeholder
