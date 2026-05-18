# Module 4.1 — Maintenance Management

**Phase:** 4 — Maintenance & Facility Operations  
**Stack:** NestJS · PostgreSQL · Redis · Bull Queue · Socket.IO · React 18 · Redux Toolkit  
**Estimated Effort:** 3 weeks (2 backend, 1 frontend)  
**Depends On:** Module 1.1–1.7, 2.1, 2.2, 1.4 (Workflow), 1.5 (Notifications)

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

End-to-end reactive maintenance management: tenant/staff ticket creation, work order generation and assignment, SLA tracking, technician scheduling, priority escalation, photo evidence capture, and tenant satisfaction ratings. Serves as the foundation for Preventive Maintenance (4.2) and feeds cost data to the GL (Phase 3.4).

**Key capabilities:**
- Ticket submission by tenants (portal/mobile), staff, or auto-escalated from building systems
- Automatic work order generation from approved tickets
- Skill-based technician assignment with workload balancing
- SLA enforcement per category/priority with breach alerts and auto-escalation
- Calendar-based technician scheduling view
- Photo upload at creation + completion (mobile-first)
- Tenant rating after job completion (1–5 stars)
- Cost tracking (labor + materials) per work order → GL posting hook
- Real-time status push via WebSocket

---

## DB Schema

```sql
-- Maintenance categories (seeded + customizable)
CREATE TABLE maintenance_categories (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = system
  name         VARCHAR(150) NOT NULL,
  description  TEXT,
  icon         VARCHAR(50),
  parent_id    UUID REFERENCES maintenance_categories(id),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seeds: Plumbing, Electrical, Air Conditioning, Lift/Elevator, Structural,
--        Pest Control, Cleaning, Security, Appliance, Internet/TV, Furniture, General

-- SLA configurations per category + priority
CREATE TABLE maintenance_sla_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id         UUID REFERENCES properties(id),
  category_id         UUID REFERENCES maintenance_categories(id),
  priority            VARCHAR(10) NOT NULL,          -- 'P1'|'P2'|'P3'|'P4'
  response_hours      SMALLINT NOT NULL,             -- time to first response
  resolution_hours    SMALLINT NOT NULL,             -- time to full resolution
  working_hours_only  BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_contact_id UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sla_config UNIQUE (company_id, COALESCE(property_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id,'00000000-0000-0000-0000-000000000000'::uuid), priority)
);

-- Maintenance tickets
CREATE TABLE maintenance_tickets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id         UUID NOT NULL REFERENCES properties(id),
  unit_id             UUID REFERENCES units(id),
  ticket_number       VARCHAR(30) NOT NULL UNIQUE,   -- TKT-2025-00001
  title               VARCHAR(500) NOT NULL,
  description         TEXT,
  category_id         UUID NOT NULL REFERENCES maintenance_categories(id),
  priority            VARCHAR(10) NOT NULL DEFAULT 'P3',
  status              VARCHAR(30) NOT NULL DEFAULT 'open',
                      -- 'open'|'assigned'|'in_progress'|'pending_parts'
                      -- |'completed'|'closed'|'cancelled'|'reopened'
  source              VARCHAR(20) NOT NULL DEFAULT 'staff',
                      -- 'tenant'|'staff'|'preventive'|'inspection'|'system'
  reported_by_tenant  UUID REFERENCES tenants(id),
  reported_by_user    UUID REFERENCES users(id),
  assigned_to         UUID REFERENCES users(id),     -- technician
  assigned_at         TIMESTAMPTZ,
  -- SLA tracking
  sla_response_due_at  TIMESTAMPTZ,
  sla_resolve_due_at   TIMESTAMPTZ,
  sla_response_met     BOOLEAN,
  sla_resolve_met      BOOLEAN,
  first_response_at    TIMESTAMPTZ,
  -- Escalation
  escalation_level     SMALLINT NOT NULL DEFAULT 0,
  escalated_at         TIMESTAMPTZ,
  escalated_to         UUID REFERENCES users(id),
  -- Resolution
  resolution_notes     TEXT,
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES users(id),
  -- Tenant feedback
  rating               SMALLINT,                      -- 1–5
  rating_comment       TEXT,
  rated_at             TIMESTAMPTZ,
  -- Costs
  estimated_cost       NUMERIC(12,2),
  actual_cost          NUMERIC(12,2),
  -- Metadata
  location_detail      VARCHAR(255),                  -- 'Master bathroom', 'Kitchen sink'
  is_urgent            BOOLEAN NOT NULL DEFAULT FALSE,
  requires_access      BOOLEAN NOT NULL DEFAULT TRUE, -- needs tenant access permission
  access_granted       BOOLEAN,
  access_time          TIMESTAMPTZ,
  workflow_instance_id UUID,
  gl_posted            BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_tickets_company ON maintenance_tickets(company_id);
CREATE INDEX idx_tickets_property ON maintenance_tickets(property_id);
CREATE INDEX idx_tickets_status ON maintenance_tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_assigned ON maintenance_tickets(assigned_to) WHERE status NOT IN ('completed','closed','cancelled');
CREATE INDEX idx_tickets_sla_resolve ON maintenance_tickets(sla_resolve_due_at) WHERE status NOT IN ('completed','closed','cancelled');

-- Ticket photos (before + after)
CREATE TABLE ticket_photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES work_orders(id),
  storage_key  VARCHAR(1000) NOT NULL,
  url          VARCHAR(500) NOT NULL,
  photo_type   VARCHAR(10) NOT NULL DEFAULT 'before',  -- 'before'|'during'|'after'
  caption      VARCHAR(255),
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Work orders (generated from tickets)
CREATE TABLE work_orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id        UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id),
  property_id      UUID NOT NULL REFERENCES properties(id),
  wo_number        VARCHAR(30) NOT NULL UNIQUE,        -- WO-2025-00001
  title            VARCHAR(500) NOT NULL,
  description      TEXT,
  assigned_to      UUID NOT NULL REFERENCES users(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
                   -- 'pending'|'accepted'|'in_progress'|'on_hold'|'completed'|'cancelled'
  scheduled_start  TIMESTAMPTZ,
  scheduled_end    TIMESTAMPTZ,
  actual_start     TIMESTAMPTZ,
  actual_end       TIMESTAMPTZ,
  estimated_hours  NUMERIC(5,2),
  actual_hours     NUMERIC(5,2),
  -- Labor cost
  labor_rate       NUMERIC(10,2),                      -- per hour
  labor_cost       NUMERIC(12,2),
  -- Materials cost (from inventory issues)
  materials_cost   NUMERIC(12,2) DEFAULT 0,
  total_cost       NUMERIC(12,2) DEFAULT 0,
  -- Completion
  completion_notes TEXT,
  checklist        JSONB DEFAULT '[]',                 -- [{ item, checked, notes }]
  on_hold_reason   TEXT,
  cancelled_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wo_ticket ON work_orders(ticket_id);
CREATE INDEX idx_wo_assigned ON work_orders(assigned_to) WHERE status NOT IN ('completed','cancelled');
CREATE INDEX idx_wo_scheduled ON work_orders(scheduled_start) WHERE status = 'pending';

-- Work order material usage (links to inventory module 4.4)
CREATE TABLE work_order_materials (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  inventory_item_id UUID,                             -- Phase 4.4
  item_name       VARCHAR(255) NOT NULL,              -- denormalized
  quantity        NUMERIC(10,4) NOT NULL,
  unit_cost       NUMERIC(10,4) NOT NULL,
  total_cost      NUMERIC(12,2) NOT NULL,
  issued_from_stock BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Technician profiles (extends users)
CREATE TABLE technician_profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  property_id    UUID REFERENCES properties(id),
  skills         TEXT[] DEFAULT '{}',                 -- ['plumbing','electrical','hvac']
  certifications TEXT[] DEFAULT '{}',
  hourly_rate    NUMERIC(10,2),
  is_available   BOOLEAN NOT NULL DEFAULT TRUE,
  working_hours  JSONB DEFAULT '{}',                  -- { mon: '08:00-17:00', ... }
  max_concurrent_jobs SMALLINT DEFAULT 3,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SLA breach events
CREATE TABLE sla_breach_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  breach_type  VARCHAR(20) NOT NULL,                  -- 'response'|'resolution'
  breached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated_to UUID REFERENCES users(id),
  notified     BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## Server-Side Architecture

```
src/modules/maintenance/
├── maintenance.module.ts
├── tickets.controller.ts
├── tickets.service.ts
├── work-orders.controller.ts
├── work-orders.service.ts
├── assignment.service.ts          # smart technician assignment logic
├── sla.service.ts                 # SLA calculation + breach detection
├── technicians.controller.ts
├── technicians.service.ts
├── photos.service.ts
├── queues/
│   ├── sla-monitor.processor.ts   # runs every 15 min, checks for SLA breaches
│   └── ticket-assignment.processor.ts
├── dto/
│   ├── create-ticket.dto.ts
│   ├── update-ticket.dto.ts
│   ├── ticket-query.dto.ts
│   ├── create-work-order.dto.ts
│   ├── update-work-order.dto.ts
│   ├── complete-work-order.dto.ts
│   ├── rate-ticket.dto.ts
│   ├── escalate-ticket.dto.ts
│   └── upsert-technician-profile.dto.ts
└── entities/ (as above)
```

### Core Services

```typescript
// src/modules/maintenance/tickets.service.ts
@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(MaintenanceTicket) private ticketRepo: Repository<MaintenanceTicket>,
    @InjectRepository(WorkOrder) private woRepo: Repository<WorkOrder>,
    private slaService: SlaService,
    private assignmentService: AssignmentService,
    private notificationsService: NotificationsService,
    private storageService: StorageService,
    @InjectRedis() private redis: Redis,
  ) {}

  async create(dto: CreateTicketDto, companyId: string): Promise<MaintenanceTicket> {
    // 1. Resolve SLA deadlines based on category + priority
    const sla = await this.slaService.getSlaConfig(companyId, dto.propertyId, dto.categoryId, dto.priority);
    const now = new Date();

    const ticket = await this.ticketRepo.save({
      ...dto,
      companyId,
      status: 'open',
      slaResponseDueAt: sla ? addHours(now, sla.responseHours) : null,
      slaResolveDueAt: sla ? addHours(now, sla.resolutionHours) : null,
    });

    // 2. Schedule SLA breach monitoring jobs
    if (sla) {
      await this.slaService.scheduleBreachChecks(ticket);
    }

    // 3. Notify property manager + maintenance supervisor
    await this.notificationsService.send({
      templateCode: 'ticket_created',
      companyId,
      recipientIds: await this.getMaintenanceSupervisors(dto.propertyId),
      channels: ['in_app', 'push'],
      variables: {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        priority: ticket.priority,
        unitNumber: ticket.unit?.unitNumber,
        propertyName: ticket.property?.name,
      },
      entityType: 'maintenance_ticket',
      entityId: ticket.id,
    });

    // 4. Real-time push via WebSocket
    this.emitTicketEvent('ticket:created', ticket);

    return ticket;
  }

  async assignToTechnician(ticketId: string, technicianId: string, scheduledStart: Date, assignedBy: string): Promise<MaintenanceTicket> {
    const ticket = await this.findOne(ticketId);

    // Create work order
    const wo = await this.woRepo.save({
      ticketId,
      companyId: ticket.companyId,
      propertyId: ticket.propertyId,
      title: ticket.title,
      description: ticket.description,
      assignedTo: technicianId,
      status: 'pending',
      scheduledStart,
      scheduledEnd: addHours(scheduledStart, ticket.estimatedHours ?? 2),
      estimatedHours: ticket.estimatedHours ?? 2,
    });

    await this.ticketRepo.update(ticketId, {
      status: 'assigned',
      assignedTo: technicianId,
      assignedAt: new Date(),
      firstResponseAt: ticket.firstResponseAt ?? new Date(),
    });

    // Notify technician
    await this.notificationsService.send({
      templateCode: 'work_order_assigned',
      companyId: ticket.companyId,
      recipientIds: [technicianId],
      channels: ['push', 'in_app'],
      variables: {
        woNumber: wo.woNumber,
        title: wo.title,
        propertyName: ticket.property?.name,
        unitNumber: ticket.unit?.unitNumber,
        scheduledStart: scheduledStart.toISOString(),
      },
      entityType: 'work_order',
      entityId: wo.id,
    });

    this.emitTicketEvent('ticket:assigned', { ticketId, technicianId, woId: wo.id });
    return this.findOne(ticketId);
  }

  async complete(ticketId: string, dto: CompleteTicketDto, completedBy: string): Promise<MaintenanceTicket> {
    const ticket = await this.findOne(ticketId);
    const wo = await this.woRepo.findOne({ where: { ticketId, assignedTo: completedBy } });

    if (wo) {
      const actualHours = wo.actualStart
        ? (new Date().getTime() - wo.actualStart.getTime()) / 3600000
        : dto.actualHours;

      const techProfile = await this.techRepo.findOne({ where: { userId: completedBy } });
      const laborCost = actualHours * Number(techProfile?.hourlyRate ?? 0);

      await this.woRepo.update(wo.id, {
        status: 'completed',
        actualEnd: new Date(),
        actualHours,
        completionNotes: dto.completionNotes,
        laborCost,
        totalCost: laborCost + Number(wo.materialsCost ?? 0),
      });
    }

    const now = new Date();
    await this.ticketRepo.update(ticketId, {
      status: 'completed',
      resolvedAt: now,
      resolvedBy: completedBy,
      resolutionNotes: dto.resolutionNotes,
      slaResolveMet: ticket.slaResolveDueAt ? now <= ticket.slaResolveDueAt : null,
      actualCost: wo?.totalCost ?? 0,
    });

    // Send rating request to tenant after 2 hours
    if (ticket.reportedByTenant) {
      await this.billingQueue.add('send-rating-request', { ticketId }, { delay: 7200000 });
    }

    this.emitTicketEvent('ticket:completed', { ticketId });
    return this.findOne(ticketId);
  }

  async rateTicket(ticketId: string, dto: RateTicketDto, tenantId: string): Promise<MaintenanceTicket> {
    const ticket = await this.findOne(ticketId);
    if (ticket.reportedByTenant !== tenantId) throw new ForbiddenException();
    if (ticket.status !== 'completed') throw new BadRequestException('Can only rate completed tickets');
    await this.ticketRepo.update(ticketId, {
      rating: dto.rating,
      ratingComment: dto.comment,
      ratedAt: new Date(),
      status: 'closed',
    });
    return this.findOne(ticketId);
  }

  private emitTicketEvent(event: string, data: unknown): void {
    this.maintenanceGateway.server.emit(event, data);
  }
}

// src/modules/maintenance/assignment.service.ts
@Injectable()
export class AssignmentService {
  /**
   * Auto-assigns ticket to best available technician.
   * Algorithm:
   * 1. Filter techs by: property assignment + skill match + availability
   * 2. Score each tech: skill match (40%) + current workload (40%) + last assignment time (20%)
   * 3. Assign to highest scorer
   */
  async autoAssign(ticket: MaintenanceTicket): Promise<string | null> {
    const category = await this.categoryRepo.findOne({ where: { id: ticket.categoryId } });
    const requiredSkill = category?.name.toLowerCase().replace(/\s+/g, '_');

    const techs = await this.techRepo.find({
      where: { propertyId: ticket.propertyId, isAvailable: true },
    });

    const scored = await Promise.all(techs.map(async (tech) => {
      const skillMatch = requiredSkill && tech.skills.includes(requiredSkill) ? 40 : 0;

      const openJobs = await this.woRepo.count({
        where: { assignedTo: tech.userId, status: Not(In(['completed','cancelled'])) },
      });
      const workloadScore = Math.max(0, 40 - (openJobs / tech.maxConcurrentJobs) * 40);

      const lastJob = await this.woRepo.findOne({
        where: { assignedTo: tech.userId },
        order: { createdAt: 'DESC' },
      });
      const hoursSinceLast = lastJob
        ? (Date.now() - lastJob.createdAt.getTime()) / 3600000
        : 24;
      const recencyScore = Math.min(20, hoursSinceLast);

      return { userId: tech.userId, score: skillMatch + workloadScore + recencyScore };
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.userId ?? null;
  }
}

// src/modules/maintenance/sla.service.ts
@Injectable()
export class MaintenanceSlaService {
  async scheduleBreachChecks(ticket: MaintenanceTicket): Promise<void> {
    if (ticket.slaResponseDueAt) {
      const delay = ticket.slaResponseDueAt.getTime() - Date.now();
      if (delay > 0) {
        await this.slaQueue.add('check-response', { ticketId: ticket.id }, {
          delay, jobId: `sla-response:${ticket.id}`,
        });
      }
    }
    if (ticket.slaResolveDueAt) {
      // Warning 2 hours before
      const warnDelay = ticket.slaResolveDueAt.getTime() - Date.now() - 7200000;
      if (warnDelay > 0) {
        await this.slaQueue.add('warn-resolve', { ticketId: ticket.id }, {
          delay: warnDelay, jobId: `sla-warn:${ticket.id}`,
        });
      }
      const breachDelay = ticket.slaResolveDueAt.getTime() - Date.now();
      if (breachDelay > 0) {
        await this.slaQueue.add('check-resolve', { ticketId: ticket.id }, {
          delay: breachDelay, jobId: `sla-resolve:${ticket.id}`,
        });
      }
    }
  }

  async handleResponseBreach(ticketId: string): Promise<void> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket || ticket.firstResponseAt) return; // already responded

    await this.ticketRepo.update(ticketId, { slaResponseMet: false, escalationLevel: 1 });
    await this.breachRepo.save({ ticketId, breachType: 'response' });

    const slaConfig = await this.getSlaConfig(ticket.companyId, ticket.propertyId, ticket.categoryId, ticket.priority);

    await this.notificationsService.send({
      templateCode: 'ticket_sla_breach',
      companyId: ticket.companyId,
      recipientIds: [slaConfig?.escalationContactId ?? ticket.assignedTo!].filter(Boolean),
      channels: ['email', 'in_app', 'push'],
      variables: {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        breachType: 'response',
        priority: ticket.priority,
      },
    });
  }
}
```

### WebSocket Gateway

```typescript
// src/modules/maintenance/gateways/maintenance.gateway.ts
@WebSocketGateway({ namespace: '/maintenance', cors: { origin: process.env.FRONTEND_URL } })
export class MaintenanceGateway {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const { companyId, propertyId } = client.handshake.query;
    client.join(`company:${companyId}`);
    if (propertyId) client.join(`property:${propertyId}`);
  }

  emitToProperty(propertyId: string, event: string, data: unknown) {
    this.server.to(`property:${propertyId}`).emit(event, data);
  }

  emitToCompany(companyId: string, event: string, data: unknown) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }
}
```

---

## API Contract

### `GET /maintenance/tickets`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&unitId=&status=open&priority=P1&categoryId=&assignedTo=&source=&search=&from=&to=&page=1&limit=20&sort=createdAt&order=desc`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "ticketNumber": "TKT-2025-00042",
      "title": "Water leaking from ceiling in master bathroom",
      "category": { "id": "uuid", "name": "Plumbing", "icon": "droplet" },
      "priority": "P1",
      "status": "assigned",
      "source": "tenant",
      "unit": { "id": "uuid", "unitNumber": "1201" },
      "property": { "id": "uuid", "name": "Acme Tower A" },
      "assignedTo": { "id": "uuid", "fullName": "Ahmad Technician" },
      "slaResolveDueAt": "2025-01-16T14:00:00Z",
      "slaStatus": "at_risk",
      "hoursUntilSla": 3.5,
      "rating": null,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "meta": { "total": 87, "page": 1, "limit": 20, "totalPages": 5 }
}
```

---

### `POST /maintenance/tickets`
**Access:** `maintenance.create` or tenant portal

```json
{
  "propertyId": "uuid",
  "unitId": "uuid",
  "title": "Water leaking from ceiling in master bathroom",
  "description": "Persistent drip since yesterday afternoon. Bucket placed. Urgency: high.",
  "categoryId": "uuid",
  "priority": "P1",
  "source": "tenant",
  "locationDetail": "Master bathroom ceiling near light fixture",
  "requiresAccess": true,
  "isUrgent": true,
  "estimatedCost": null
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "ticketNumber": "TKT-2025-00042",
    "status": "open",
    "slaResponseDueAt": "2025-01-15T12:00:00Z",
    "slaResolveDueAt": "2025-01-16T10:00:00Z"
  }
}
```

---

### `GET /maintenance/tickets/:id`
**Access:** `maintenance.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "ticketNumber": "TKT-2025-00042",
    "title": "Water leaking from ceiling in master bathroom",
    "description": "...",
    "category": { "id": "uuid", "name": "Plumbing" },
    "priority": "P1",
    "status": "in_progress",
    "unit": { "id": "uuid", "unitNumber": "1201", "floor": 12 },
    "property": { "id": "uuid", "name": "Acme Tower A" },
    "reportedByTenant": { "id": "uuid", "displayName": "John Tan" },
    "assignedTo": { "id": "uuid", "fullName": "Ahmad Tech", "skills": ["plumbing"] },
    "slaResponseDueAt": "2025-01-15T12:00:00Z",
    "slaResolveDueAt": "2025-01-16T10:00:00Z",
    "slaResponseMet": true,
    "firstResponseAt": "2025-01-15T11:30:00Z",
    "photos": [
      { "id": "uuid", "url": "https://cdn...", "photoType": "before", "caption": "Ceiling drip" }
    ],
    "workOrders": [
      {
        "id": "uuid",
        "woNumber": "WO-2025-00018",
        "status": "in_progress",
        "assignedTo": { "fullName": "Ahmad Tech" },
        "scheduledStart": "2025-01-15T14:00:00Z",
        "actualStart": "2025-01-15T14:05:00Z",
        "estimatedHours": 3,
        "checklist": [
          { "item": "Identify leak source", "checked": true, "notes": "Burst pipe from unit above" },
          { "item": "Isolate water supply", "checked": true, "notes": "" },
          { "item": "Repair pipe joint", "checked": false, "notes": "" }
        ]
      }
    ],
    "escalationLevel": 0,
    "actualCost": null,
    "rating": null,
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

---

### `PUT /maintenance/tickets/:id`
**Access:** `maintenance.update`

---

### `POST /maintenance/tickets/:id/assign`
**Access:** `maintenance.assign`

```json
{
  "technicianId": "uuid",
  "scheduledStart": "2025-01-15T14:00:00Z",
  "notes": "Bring pipe repair kit, check unit above first"
}
```

---

### `POST /maintenance/tickets/:id/auto-assign`
**Access:** `maintenance.assign`  
Triggers the auto-assignment algorithm.

---

### `POST /maintenance/tickets/:id/escalate`
**Access:** `maintenance.escalate`

```json
{
  "escalateTo": "uuid",
  "reason": "P1 ticket unresolved for 6 hours. Tenant very upset."
}
```

---

### `POST /maintenance/tickets/:id/cancel`
**Access:** `maintenance.update`

```json
{ "reason": "Tenant resolved issue independently" }
```

---

### `POST /maintenance/tickets/:id/rate`
**Access:** Tenant portal only

```json
{ "rating": 4, "comment": "Quick response but left some mess in bathroom." }
```

---

### `POST /maintenance/tickets/:id/photos`
**Access:** `maintenance.update`  
**Content-Type:** `multipart/form-data`  
**Body:** `photos[]`, `photoType` (before/during/after)

---

### Work Orders

### `GET /maintenance/work-orders`
**Access:** `maintenance.read`  
**Query:** `?assignedTo=&status=pending&propertyId=&scheduledFrom=&scheduledTo=&page=1&limit=20`

### `GET /maintenance/work-orders/:id`
### `PUT /maintenance/work-orders/:id`

### `POST /maintenance/work-orders/:id/start`
**Access:** Technician (own WO)

```json
{ "notes": "On-site. Starting inspection." }
```

### `POST /maintenance/work-orders/:id/complete`
**Access:** Technician (own WO)

```json
{
  "completionNotes": "Replaced burst pipe joint. Tested — no further leak. Cleaned area.",
  "actualHours": 2.5,
  "checklist": [
    { "item": "Identify leak source", "checked": true, "notes": "Burst joint at 12F pipe run" },
    { "item": "Isolate water supply", "checked": true, "notes": "" },
    { "item": "Repair pipe joint", "checked": true, "notes": "Replaced with 25mm copper joint" }
  ],
  "materialsUsed": [
    { "itemName": "25mm Copper Pipe Joint", "quantity": 2, "unitCost": 8.50 },
    { "itemName": "PTFE Tape", "quantity": 1, "unitCost": 1.20 }
  ]
}
```

### `POST /maintenance/work-orders/:id/on-hold`

```json
{ "reason": "Waiting for replacement part. ETA 2 days." }
```

---

### Technicians

### `GET /maintenance/technicians`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&skill=plumbing&isAvailable=true`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "fullName": "Ahmad Tech",
      "skills": ["plumbing", "general"],
      "hourlyRate": 25,
      "isAvailable": true,
      "openJobs": 2,
      "maxConcurrentJobs": 3,
      "todaySchedule": [
        { "woId": "uuid", "title": "AC filter replacement", "from": "10:00", "to": "11:00", "status": "completed" },
        { "woId": "uuid", "title": "Pipe repair Unit 1201", "from": "14:00", "to": "17:30", "status": "in_progress" }
      ]
    }
  ]
}
```

### `GET /maintenance/technicians/:userId/schedule`
**Access:** `maintenance.read`  
**Query:** `?from=2025-01-15&to=2025-01-21`

Returns calendar-compatible events for the technician's work orders in the given week.

### `PUT /maintenance/technicians/:userId/profile`
**Access:** `maintenance.manage`

```json
{
  "skills": ["plumbing", "electrical", "general"],
  "hourlyRate": 28,
  "maxConcurrentJobs": 3,
  "workingHours": {
    "mon": "08:00-17:00", "tue": "08:00-17:00", "wed": "08:00-17:00",
    "thu": "08:00-17:00", "fri": "08:00-17:00", "sat": null, "sun": null
  }
}
```

---

### Analytics

### `GET /maintenance/stats`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&from=&to=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "ticketSummary": {
      "total": 142, "open": 18, "inProgress": 12, "completed": 105,
      "cancelled": 7, "overdue": 3
    },
    "slaCompliance": {
      "responseRate": 94.5,
      "resolutionRate": 89.2,
      "totalBreaches": 8
    },
    "avgResolutionHours": 18.4,
    "avgRating": 4.2,
    "byPriority": { "P1": 8, "P2": 22, "P3": 89, "P4": 23 },
    "byCategory": [
      { "category": "Air Conditioning", "count": 42, "pct": 29.6 },
      { "category": "Plumbing", "count": 31, "pct": 21.8 }
    ],
    "totalCost": 15420.50
  }
}
```

### `GET /maintenance/sla-report`
**Access:** `maintenance.read`  
**Query:** `?propertyId=&from=&to=&groupBy=category`

---

## Business Logic & Validation Rules

```
Ticket number generation:
  TKT-{YYYY}-{NNNNN} per company sequence (same pattern as lease/invoice numbers)

Priority definitions (default; configurable via SLA config):
  P1 – Emergency / Safety: Response 2h, Resolve 8h
  P2 – Urgent: Response 4h, Resolve 24h
  P3 – Normal: Response 8h, Resolve 72h
  P4 – Low: Response 24h, Resolve 168h (7 days)

SLA clock rules:
  Default: 24/7 calendar hours
  If sla_config.working_hours_only = TRUE:
    SLA clock pauses outside tech working hours (08:00–17:00 weekdays)
    Clock resumes at next working hour start
  Clock starts at ticket.created_at
  Response clock stops at ticket.first_response_at
  Resolve clock stops at ticket.resolved_at

Auto-assignment rules:
  Runs when: ticket created with priority P1 or P2 (immediate)
  For P3/P4: supervisor manually assigns or uses auto-assign button
  If no available tech found: notify supervisor + leave as 'open'
  Max open jobs per tech: techProfile.maxConcurrentJobs (default 3)

Escalation chain:
  Level 0: assigned technician
  Level 1 (response SLA breach): maintenance supervisor
  Level 2 (resolve SLA breach): property manager
  Level 3 (escalation_level manually set): company director
  Each level: reassign open WO + notify new assignee + original assignee

Work order cost calculation:
  laborCost = actualHours × techProfile.hourlyRate
  materialsCost = SUM(work_order_materials.total_cost)
  totalCost = laborCost + materialsCost
  On WO completion: update ticket.actual_cost, post to GL (expense account)

Rating request:
  Sent 2 hours after ticket.status = 'completed' (if reportedByTenant is set)
  Tenant has 7 days to rate; after that, ticket auto-closes without rating
  Rating affects technician performance metrics

Status machine:
  open → assigned (on technician assignment)
  open → cancelled
  assigned → in_progress (tech starts WO)
  assigned → cancelled
  in_progress → pending_parts (WO on hold)
  in_progress → completed (WO completed)
  pending_parts → in_progress
  completed → closed (after tenant rates OR 7 days)
  closed → reopened (if tenant reports issue recurs within 30 days)
  reopened → assigned
```

---

## UI Screens & Component Breakdown

```
admin/maintenance/
├── MaintenanceDashboard/
│   └── components/
│       ├── TicketSummaryCards.tsx       # Open | In Progress | Overdue | Avg Rating
│       ├── SlaComplianceGauge.tsx       # response + resolution rates
│       ├── TicketsByPriorityChart.tsx   # P1-P4 bar chart
│       ├── TicketsByCategoryChart.tsx   # pie chart
│       └── RecentTicketsFeed.tsx        # live-updating WebSocket feed

├── TicketListPage/
│   ├── TicketListPage.tsx               # Kanban or Table toggle
│   └── components/
│       ├── TicketKanban/
│       │   ├── TicketKanban.tsx         # columns: Open | Assigned | In Progress | Pending Parts
│       │   ├── KanbanColumn.tsx
│       │   └── TicketKanbanCard.tsx     # priority badge + SLA countdown + assignee avatar
│       ├── TicketTable/
│       │   ├── TicketTable.tsx
│       │   └── TicketTableRow.tsx
│       ├── TicketFilters.tsx
│       ├── SlaCountdown.tsx             # red/amber/green countdown chip
│       ├── PriorityBadge.tsx            # P1(red)/P2(orange)/P3(blue)/P4(gray)
│       ├── TicketStatusBadge.tsx
│       └── CreateTicketButton.tsx

├── TicketDetailPage/
│   ├── TicketDetailPage.tsx
│   └── components/
│       ├── TicketHeader.tsx             # number + priority + status + SLA bar
│       ├── SlaProgressBar.tsx           # visual time remaining bar
│       ├── TicketInfoPanel.tsx          # unit, category, description, location
│       ├── PhotoGallery.tsx             # before/during/after photos
│       ├── WorkOrderPanel/
│       │   ├── WorkOrderPanel.tsx
│       │   ├── WorkOrderCard.tsx        # technician + schedule + status + checklist
│       │   ├── ChecklistEditor.tsx      # checkable list with notes per item
│       │   └── MaterialsTable.tsx       # parts used with costs
│       ├── AssignmentPanel/
│       │   ├── TechnicianPicker.tsx     # search + availability + skills indicator
│       │   └── ScheduleTimePicker.tsx
│       ├── EscalationPanel.tsx
│       ├── RatingDisplay.tsx            # 1–5 stars + comment
│       └── ActivityTimeline.tsx         # full audit trail

├── TechnicianSchedulePage/
│   └── components/
│       ├── TechnicianSelector.tsx
│       ├── WeekCalendar.tsx             # 7-day calendar with WO blocks
│       │   └── WorkOrderBlock.tsx       # colored block: title + time + status
│       └── WorkloadSummary.tsx          # open jobs / max concurrent

├── CreateTicketModal/
│   └── components/
│       ├── CategorySelector.tsx         # icon grid of categories
│       ├── PrioritySelector.tsx         # P1–P4 with descriptions
│       ├── PhotoUploadZone.tsx          # multi-photo drag-drop
│       └── UnitSearch.tsx

└── SlaConfigPage/
    └── components/
        ├── SlaConfigTable.tsx           # category × priority matrix
        └── SlaConfigModal.tsx
```

### Key UI Behaviors

```
TicketKanbanCard SLA chip:
  > 50% time remaining: green  "8h 30m left"
  20–50% remaining: amber "2h 15m left"
  < 20% remaining: red + pulsing "45m left"
  Breached: red solid "OVERDUE 3h 20m"

Real-time updates (WebSocket):
  On ticket:created → new card appears in Kanban Open column with slide-in animation
  On ticket:assigned → card moves to Assigned column
  On ticket:completed → card moves to Completed column + confetti if P1
  On sla_breach → card border turns red + toast notification

TechnicianPicker shows per-tech:
  Skills as colored chips (matching required skill highlighted)
  Current workload bar (open/max)
  Availability dot (green=available, gray=busy)
  Next available slot if currently at capacity

WeekCalendar:
  Each work order rendered as time-block
  Colors by status: pending=gray, in_progress=blue, completed=green, on_hold=orange
  Click block → open WO detail drawer
  Drag to reschedule (triggers PUT work-order scheduled_start)
```

---

## State Management

```typescript
// src/store/slices/maintenanceSlice.ts
interface MaintenanceState {
  selectedTicketId: string | null;
  viewMode: 'kanban' | 'table';
  filters: {
    status: string[];
    priority: string[];
    categoryId: string | null;
    assignedTo: string | null;
    propertyId: string | null;
    search: string;
  };
  socketConnected: boolean;
}

export const maintenanceSlice = createSlice({
  name: 'maintenance',
  initialState: {
    selectedTicketId: null,
    viewMode: 'kanban',
    filters: { status: ['open','assigned','in_progress','pending_parts'], priority: [], categoryId: null, assignedTo: null, propertyId: null, search: '' },
    socketConnected: false,
  } as MaintenanceState,
  reducers: {
    selectTicket: (state, a: PayloadAction<string | null>) => { state.selectedTicketId = a.payload; },
    setViewMode: (state, a: PayloadAction<'kanban' | 'table'>) => { state.viewMode = a.payload; },
    setFilter: (state, a: PayloadAction<Partial<MaintenanceState['filters']>>) => {
      state.filters = { ...state.filters, ...a.payload };
    },
  },
});

// src/store/api/maintenanceApi.ts
export const maintenanceApi = createApi({
  reducerPath: 'maintenanceApi',
  tagTypes: ['Tickets', 'WorkOrders', 'Technicians', 'MaintenanceStats'],
  endpoints: (builder) => ({
    getTickets: builder.query<PaginatedResponse<TicketListItem>, TicketQueryParams>({
      query: (params) => ({ url: '/maintenance/tickets', params }),
      providesTags: ['Tickets'],
    }),
    getTicket: builder.query<TicketDetail, string>({
      query: (id) => `/maintenance/tickets/${id}`,
      providesTags: (_, __, id) => [{ type: 'Tickets', id }],
    }),
    createTicket: builder.mutation<MaintenanceTicket, CreateTicketDto>({
      query: (body) => ({ url: '/maintenance/tickets', method: 'POST', body }),
      invalidatesTags: ['Tickets', 'MaintenanceStats'],
    }),
    assignTicket: builder.mutation<MaintenanceTicket, { id: string; data: AssignTicketDto }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}/assign`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tickets', id }, 'Tickets', 'WorkOrders'],
    }),
    escalateTicket: builder.mutation<void, { id: string; data: EscalateTicketDto }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}/escalate`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tickets', id }],
    }),
    rateTicket: builder.mutation<void, { id: string; data: RateTicketDto }>({
      query: ({ id, data }) => ({ url: `/maintenance/tickets/${id}/rate`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Tickets', id }],
    }),
    getWorkOrders: builder.query<PaginatedResponse<WorkOrder>, WorkOrderQueryParams>({
      query: (params) => ({ url: '/maintenance/work-orders', params }),
      providesTags: ['WorkOrders'],
    }),
    startWorkOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/maintenance/work-orders/${id}/start`, method: 'POST' }),
      invalidatesTags: ['WorkOrders', 'Tickets'],
    }),
    completeWorkOrder: builder.mutation<void, { id: string; data: CompleteWorkOrderDto }>({
      query: ({ id, data }) => ({ url: `/maintenance/work-orders/${id}/complete`, method: 'POST', body: data }),
      invalidatesTags: ['WorkOrders', 'Tickets', 'MaintenanceStats'],
    }),
    getTechnicians: builder.query<TechnicianProfile[], TechnicianQueryParams>({
      query: (params) => ({ url: '/maintenance/technicians', params }),
      providesTags: ['Technicians'],
    }),
    getTechnicianSchedule: builder.query<CalendarEvent[], { userId: string; from: string; to: string }>({
      query: ({ userId, ...params }) => ({ url: `/maintenance/technicians/${userId}/schedule`, params }),
    }),
    getMaintenanceStats: builder.query<MaintenanceStats, { propertyId?: string; from?: string; to?: string }>({
      query: (params) => ({ url: '/maintenance/stats', params }),
      providesTags: ['MaintenanceStats'],
    }),
    getCategories: builder.query<MaintenanceCategory[], void>({
      query: () => '/maintenance/categories',
    }),
  }),
});

// Real-time WebSocket integration
// src/hooks/useMaintenanceSocket.ts
export const useMaintenanceSocket = (propertyId: string) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const socket = io('/maintenance', {
      auth: { token: store.getState().auth.accessToken },
      query: { propertyId },
    });

    socket.on('ticket:created', () => dispatch(maintenanceApi.util.invalidateTags(['Tickets'])));
    socket.on('ticket:assigned', () => dispatch(maintenanceApi.util.invalidateTags(['Tickets', 'WorkOrders'])));
    socket.on('ticket:completed', () => dispatch(maintenanceApi.util.invalidateTags(['Tickets', 'MaintenanceStats'])));
    socket.on('ticket:sla_breach', (data: { ticketId: string }) => {
      dispatch(maintenanceApi.util.invalidateTags([{ type: 'Tickets', id: data.ticketId }]));
      toast.error(`SLA breach: Ticket ${data.ticketNumber}`, { duration: 10000 });
    });

    return () => { socket.disconnect(); };
  }, [propertyId]);
};
```
