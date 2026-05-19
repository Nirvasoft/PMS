# Module 2.4 — Lease Management

**Phase:** 2 — Property Structure & Leasing
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit
**Estimated Effort:** 4 weeks (3 backend, 1 frontend)
**Depends On:** Module 2.1, 2.2, 2.3, 1.4 (Workflow Engine), 1.5 (Notifications), 1.6 (Documents)
**Status:** ✅ Implemented (2026-05-19)

> **Implementation Notes:**
> - Plain service classes used (consistent with Modules 2.1–2.3); NestJS DI not applicable
> - Workflow integration stub: no active workflow def → lease moves directly to 'approved' on submit
> - E-signature is provider-agnostic stub (envelope ID generated locally); swap `esignService.send()` for DocuSign/HelloSign SDK in production
> - Escalation schedule generated atomically on lease activation; regenerated on amendment approval
> - Early termination penalty: `min(3 months rent, remaining_months × rent × 0.5)` — configurable per company in Phase 3
> - Enhancement: `daysUntilExpiry` computed on every list/detail response (no client-side calculation needed)
> - Enhancement: Lease number auto-generated server-side (`LSE-YYYY-NNNNN`) — no DB sequence needed (uses random 5-digit suffix, collision-safe at scale via retry in Phase 3)
> - Enhancement: Amendment approve atomically updates lease fields + regenerates escalation schedule
> - Billing setup hook (`billingSetupService`) commented in service as Phase 3 integration point
> - Tenant's lease history (stub in Module 2.3) now returns real data via `GET /leases?tenantId=`

---


## Overview

The lease lifecycle engine — the most complex module in Phase 2. Manages the full arc from draft to expiry: creation, approval workflow, activation, amendment, renewal, and termination. Drives unit status changes and feeds the billing engine (Phase 3) with charge schedules.

**Key capabilities:**
- Lease creation from templates or scratch
- Multi-step approval via Workflow Engine
- Rent escalation rules (fixed %, CPI-linked, fixed-amount, stepped)
- Lease amendments with version history
- Renewal pipeline with auto-alert at 90/60/30 days
- Early termination with penalty calculation
- E-signature integration (DocuSign / HelloSign)
- Automatic unit status management on lease transitions
- Lease clauses library

---

## DB Schema

```sql
-- Lease templates
CREATE TABLE lease_templates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  property_type  VARCHAR(50),                      -- null = applies to all types
  description    TEXT,
  default_terms  JSONB DEFAULT '{}',               -- default lease term settings
  clauses        JSONB DEFAULT '[]',               -- array of clause objects
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leases
CREATE TABLE leases (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id           UUID NOT NULL REFERENCES properties(id),
  unit_id               UUID NOT NULL REFERENCES units(id),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  template_id           UUID REFERENCES lease_templates(id),
  lease_number          VARCHAR(50) NOT NULL,           -- e.g. LSE-2025-00042
  status                VARCHAR(30) NOT NULL DEFAULT 'draft',
                        -- 'draft' | 'pending_approval' | 'approved' | 'active' | 'expired'
                        -- | 'terminated' | 'renewed' | 'cancelled'
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  handover_date         DATE,                           -- actual key handover date
  lease_term_months     SMALLINT NOT NULL,              -- computed: months between start and end
  rent_amount           NUMERIC(15,2) NOT NULL,         -- base rent
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle         VARCHAR(20) NOT NULL DEFAULT 'monthly',
                        -- 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  billing_day           SMALLINT NOT NULL DEFAULT 1,    -- day of month invoice generated
  payment_due_days      SMALLINT NOT NULL DEFAULT 7,    -- days after invoice to pay
  security_deposit      NUMERIC(15,2) DEFAULT 0,
  deposit_paid          BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_paid_at       TIMESTAMPTZ,
  deposit_refunded      BOOLEAN NOT NULL DEFAULT FALSE,
  deposit_refunded_at   TIMESTAMPTZ,
  -- Escalation
  escalation_type       VARCHAR(20),                    -- null | 'fixed_percent' | 'fixed_amount' | 'cpi' | 'stepped'
  escalation_value      NUMERIC(8,4),                   -- % or amount depending on type
  escalation_frequency  VARCHAR(20) DEFAULT 'annual',   -- 'annual' | 'biennial'
  escalation_day        SMALLINT,                       -- day of month escalation applies
  escalation_month      SMALLINT,                       -- month of year escalation applies
  -- Renewal
  is_renewed            BOOLEAN NOT NULL DEFAULT FALSE,
  parent_lease_id       UUID REFERENCES leases(id),     -- original lease if renewal
  renewal_offered_at    TIMESTAMPTZ,
  renewal_offer_expires_at TIMESTAMPTZ,
  renewal_accepted_at   TIMESTAMPTZ,
  -- Termination
  termination_date      DATE,
  termination_reason    TEXT,
  termination_type      VARCHAR(20),                    -- 'normal' | 'early' | 'breach'
  early_termination_penalty NUMERIC(15,2),
  -- E-signature
  esign_status          VARCHAR(20) DEFAULT 'not_started',
                        -- 'not_started' | 'sent' | 'partial' | 'completed' | 'voided'
  esign_envelope_id     VARCHAR(255),                   -- DocuSign/HelloSign envelope ID
  esign_completed_at    TIMESTAMPTZ,
  -- Workflow
  workflow_instance_id  UUID,
  -- Notes and clauses
  notes                 TEXT,
  special_conditions    TEXT,
  clauses               JSONB DEFAULT '[]',
  -- Metadata
  created_by            UUID NOT NULL REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),
  approved_at           TIMESTAMPTZ,
  activated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_leases_company ON leases(company_id);
CREATE INDEX idx_leases_property ON leases(property_id);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leases_end_date ON leases(end_date) WHERE status IN ('active', 'approved');

-- Auto-generate lease number trigger
CREATE SEQUENCE lease_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_lease_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.lease_number := 'LSE-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('lease_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lease_number
BEFORE INSERT ON leases
FOR EACH ROW WHEN (NEW.lease_number IS NULL OR NEW.lease_number = '')
EXECUTE FUNCTION generate_lease_number();

-- Lease amendments
CREATE TABLE lease_amendments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lease_id          UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  amendment_number  SMALLINT NOT NULL,
  amendment_type    VARCHAR(50) NOT NULL,          -- 'rent_revision' | 'term_extension' | 'unit_change' | 'other'
  description       TEXT NOT NULL,
  effective_date    DATE NOT NULL,
  -- Changed fields (null = not changed)
  new_rent_amount   NUMERIC(15,2),
  new_end_date      DATE,
  new_unit_id       UUID REFERENCES units(id),
  old_values        JSONB NOT NULL DEFAULT '{}',   -- snapshot of fields before change
  new_values        JSONB NOT NULL DEFAULT '{}',   -- snapshot of fields after change
  status            VARCHAR(20) DEFAULT 'pending_approval',
  workflow_instance_id UUID,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_amendment_number UNIQUE (lease_id, amendment_number)
);

-- Lease escalation schedule (pre-computed schedule)
CREATE TABLE lease_escalation_schedule (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lease_id       UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  new_rent       NUMERIC(15,2) NOT NULL,
  applied        BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at     TIMESTAMPTZ,
  CONSTRAINT uq_escalation_date UNIQUE (lease_id, effective_date)
);

-- Lease clauses library
CREATE TABLE lease_clauses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  category    VARCHAR(100),                        -- 'general' | 'payment' | 'termination' | 'use'
  is_standard BOOLEAN NOT NULL DEFAULT FALSE,      -- standard clauses auto-included in templates
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- E-signature recipients tracking
CREATE TABLE esign_recipients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lease_id         UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  envelope_id      VARCHAR(255),
  recipient_type   VARCHAR(20) NOT NULL,           -- 'tenant' | 'landlord' | 'witness'
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'sent' | 'viewed' | 'signed' | 'declined'
  signed_at        TIMESTAMPTZ,
  declined_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Server-Side Architecture

```
src/modules/leases/
├── leases.module.ts
├── leases.controller.ts
├── leases.service.ts
├── leases-lifecycle.service.ts        # status transitions + side effects
├── amendments.service.ts
├── escalation.service.ts              # schedule generation + application
├── renewal.service.ts                 # renewal pipeline + alerts
├── termination.service.ts
├── esign.service.ts                   # DocuSign/HelloSign adapter
├── clauses.controller.ts
├── clauses.service.ts
├── queues/
│   ├── renewal-alert.processor.ts
│   └── escalation-apply.processor.ts
├── dto/
│   ├── create-lease.dto.ts
│   ├── update-lease.dto.ts
│   ├── lease-query.dto.ts
│   ├── create-amendment.dto.ts
│   ├── create-renewal.dto.ts
│   ├── terminate-lease.dto.ts
│   ├── esign-send.dto.ts
│   └── create-clause.dto.ts
└── entities/
    ├── lease.entity.ts
    ├── lease-template.entity.ts
    ├── lease-amendment.entity.ts
    ├── lease-escalation-schedule.entity.ts
    ├── lease-clause.entity.ts
    └── esign-recipient.entity.ts
```

### Services

```typescript
// src/modules/leases/leases-lifecycle.service.ts
@Injectable()
export class LeasesLifecycleService {
  constructor(
    @InjectRepository(Lease) private leaseRepo: Repository<Lease>,
    private workflowEngine: WorkflowEngineService,
    private unitService: UnitsService,
    private billingSetupService: BillingSetupService,  // Phase 3
    private notificationsService: NotificationsService,
    private escalationService: EscalationService,
    private esignService: EsignService,
  ) {}

  async submitForApproval(leaseId: string, submittedBy: string): Promise<Lease> {
    const lease = await this.findOne(leaseId);
    this.assertStatus(lease, 'draft');
    await this.validateLeaseReadyForApproval(lease);

    // Start workflow instance
    const workflowDef = await this.workflowEngine.getActiveDefinition('lease', lease.companyId);
    const instance = await this.workflowEngine.startInstance(
      workflowDef.id, 'lease', leaseId,
      { entity: this.buildLeaseSnapshot(lease) },
      submittedBy,
    );

    await this.leaseRepo.update(leaseId, {
      status: 'pending_approval',
      workflowInstanceId: instance.id,
    });

    return this.findOne(leaseId);
  }

  async activate(leaseId: string, activatedBy: string): Promise<Lease> {
    /**
     * Called when workflow approves lease OR manually if no workflow configured.
     * Side effects:
     *  1. unit status → 'occupied' (if handover_date <= today)
     *  2. unit status → 'reserved' (if handover_date > today)
     *  3. Generate escalation schedule
     *  4. Setup recurring billing in Billing module (Phase 3)
     *  5. Send lease activation notification to tenant
     */
    const lease = await this.findOne(leaseId);
    this.assertStatus(lease, ['approved', 'pending_approval']);

    await this.leaseRepo.update(leaseId, {
      status: 'active',
      activatedAt: new Date(),
      approvedBy: activatedBy,
      approvedAt: new Date(),
    });

    const today = new Date();
    const handoverDate = lease.handoverDate ?? lease.startDate;
    const unitStatus = new Date(handoverDate) <= today ? 'occupied' : 'reserved';

    await this.unitService.updateStatus(lease.unitId, { status: unitStatus, reason: `Lease ${lease.leaseNumber} activated` }, activatedBy);
    await this.escalationService.generateSchedule(lease);
    // await this.billingSetupService.createLeaseChargeSchedule(lease);  // Phase 3

    await this.notificationsService.send({
      templateCode: 'lease_activated',
      companyId: lease.companyId,
      recipientIds: [lease.tenantId],  // tenant's user account if exists
      channels: ['email', 'in_app'],
      variables: {
        leaseNumber: lease.leaseNumber,
        unitNumber: lease.unit.unitNumber,
        startDate: lease.startDate,
        rentAmount: lease.rentAmount,
        currency: lease.currency,
      },
    });

    return this.findOne(leaseId);
  }

  async terminate(leaseId: string, dto: TerminateLeaseDto, terminatedBy: string): Promise<Lease> {
    const lease = await this.findOne(leaseId);
    this.assertStatus(lease, 'active');

    const terminationType = dto.terminationDate < lease.endDate ? 'early' : 'normal';
    let penalty = 0;
    if (terminationType === 'early') {
      penalty = await this.terminationService.calculatePenalty(lease, dto.terminationDate);
    }

    await this.leaseRepo.update(leaseId, {
      status: 'terminated',
      terminationDate: dto.terminationDate,
      terminationReason: dto.reason,
      terminationType,
      earlyTerminationPenalty: penalty,
    });

    // Unit back to available (after move-out inspection)
    await this.unitService.updateStatus(lease.unitId, { status: 'available', reason: 'Lease terminated' }, terminatedBy);

    // Cancel pending billing (Phase 3 hook)
    // await this.billingSetupService.cancelLeaseCharges(leaseId, dto.terminationDate);

    await this.notificationsService.send({
      templateCode: 'lease_terminated',
      companyId: lease.companyId,
      recipientIds: [lease.createdBy],
      channels: ['email', 'in_app'],
      variables: { leaseNumber: lease.leaseNumber, terminationDate: dto.terminationDate, penalty },
    });

    return this.findOne(leaseId);
  }

  private validateLeaseReadyForApproval(lease: Lease): void {
    const errors: string[] = [];
    if (!lease.tenantId) errors.push('Tenant is required');
    if (!lease.unitId) errors.push('Unit is required');
    if (lease.startDate >= lease.endDate) errors.push('End date must be after start date');
    if (lease.rentAmount <= 0) errors.push('Rent amount must be greater than 0');
    if (errors.length) throw new BadRequestException({ code: 'LEASE_VALIDATION_FAILED', errors });
  }
}

// src/modules/leases/escalation.service.ts
@Injectable()
export class EscalationService {
  async generateSchedule(lease: Lease): Promise<void> {
    if (!lease.escalationType) return;

    const schedule: Partial<LeaseEscalationSchedule>[] = [];
    let currentRent = Number(lease.rentAmount);
    let escalationDate = this.nextEscalationDate(lease);

    while (escalationDate <= new Date(lease.endDate)) {
      let newRent: number;

      switch (lease.escalationType) {
        case 'fixed_percent':
          newRent = currentRent * (1 + Number(lease.escalationValue) / 100);
          break;
        case 'fixed_amount':
          newRent = currentRent + Number(lease.escalationValue);
          break;
        case 'stepped':
          // escalationValue is a JSONB array: [{afterMonths: 12, newRent: 4000}, ...]
          // handled separately
          newRent = currentRent;
          break;
        default:
          newRent = currentRent;
      }

      newRent = Math.round(newRent * 100) / 100;  // round to 2 dp
      schedule.push({ leaseId: lease.id, effectiveDate: new Date(escalationDate), newRent, applied: false });
      currentRent = newRent;

      // Advance by escalation frequency
      escalationDate = addMonths(escalationDate, lease.escalationFrequency === 'biennial' ? 24 : 12);
    }

    await this.scheduleRepo.delete({ leaseId: lease.id });  // remove old schedule if regenerating
    if (schedule.length) await this.scheduleRepo.save(schedule);
  }

  @Cron('0 1 * * *')  // 1 AM daily
  async applyDueEscalations(): Promise<void> {
    const today = new Date();
    const dueItems = await this.scheduleRepo.find({
      where: { effectiveDate: LessThanOrEqual(today), applied: false },
      relations: ['lease'],
    });

    for (const item of dueItems) {
      await this.leaseRepo.update(item.leaseId, { rentAmount: item.newRent });
      await this.scheduleRepo.update(item.id, { applied: true, appliedAt: today });
      // Also update billing recurring charge (Phase 3 hook)
    }
  }
}

// src/modules/leases/renewal.service.ts
@Injectable()
export class RenewalService {
  @Cron('0 8 * * *')  // 8 AM daily
  async sendRenewalAlerts(): Promise<void> {
    const alertDays = [90, 60, 30, 14, 7];
    const today = new Date();

    for (const days of alertDays) {
      const targetDate = addDays(today, days);
      const leases = await this.leaseRepo.find({
        where: {
          status: 'active',
          endDate: Between(
            startOfDay(targetDate).toISOString().split('T')[0],
            endOfDay(targetDate).toISOString().split('T')[0],
          ),
        },
        relations: ['unit', 'unit.property', 'tenant'],
      });

      for (const lease of leases) {
        await this.notificationsService.send({
          templateCode: 'lease_expiring_soon',
          companyId: lease.companyId,
          recipientIds: [lease.createdBy],
          channels: ['email', 'in_app'],
          variables: {
            leaseNumber: lease.leaseNumber,
            tenantName: this.getTenantName(lease.tenant),
            unitNumber: lease.unit.unitNumber,
            propertyName: lease.unit.property.name,
            endDate: lease.endDate,
            daysRemaining: days,
          },
          entityType: 'lease',
          entityId: lease.id,
        });
      }
    }
  }

  async createRenewalOffer(leaseId: string, dto: CreateRenewalDto, createdBy: string): Promise<Lease> {
    const originalLease = await this.leaseRepo.findOneOrFail({ where: { id: leaseId } });
    this.assertStatus(originalLease, 'active');

    // Create a new draft lease as the renewal
    const renewalLease = await this.leaseRepo.save({
      companyId: originalLease.companyId,
      propertyId: originalLease.propertyId,
      unitId: originalLease.unitId,
      tenantId: originalLease.tenantId,
      parentLeaseId: leaseId,
      status: 'draft',
      startDate: dto.startDate ?? addDays(new Date(originalLease.endDate), 1),
      endDate: dto.endDate,
      rentAmount: dto.rentAmount ?? originalLease.rentAmount,
      currency: originalLease.currency,
      billingCycle: originalLease.billingCycle,
      billingDay: originalLease.billingDay,
      paymentDueDays: originalLease.paymentDueDays,
      securityDeposit: dto.securityDeposit ?? 0,
      escalationType: dto.escalationType ?? originalLease.escalationType,
      escalationValue: dto.escalationValue ?? originalLease.escalationValue,
      createdBy,
      renewalOfferedAt: new Date(),
      renewalOfferExpiresAt: dto.offerExpiresAt,
    });

    // Mark original lease as renewal offered
    await this.leaseRepo.update(leaseId, { renewalOfferedAt: new Date() });

    await this.notificationsService.send({
      templateCode: 'lease_renewal_offer',
      companyId: originalLease.companyId,
      recipientIds: [originalLease.tenantId],
      channels: ['email', 'in_app'],
      variables: { leaseNumber: renewalLease.leaseNumber, newRent: renewalLease.rentAmount, newEndDate: renewalLease.endDate },
    });

    return renewalLease;
  }
}
```

---

## API Contract

### `GET /leases`
**Access:** `leases.read`  
**Query:** `?propertyId=&unitId=&tenantId=&status=active&expiringWithinDays=90&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "leaseNumber": "LSE-2025-00042",
      "status": "active",
      "unit": { "id": "uuid", "unitNumber": "1201", "unitType": "2br" },
      "property": { "id": "uuid", "name": "Acme Tower A" },
      "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming" },
      "startDate": "2024-02-01",
      "endDate": "2026-01-31",
      "leaseTermMonths": 24,
      "rentAmount": 3500,
      "currency": "SGD",
      "daysUntilExpiry": 351,
      "esignStatus": "completed",
      "createdAt": "2024-01-15T00:00:00Z"
    }
  ],
  "meta": { "total": 68, "page": 1, "limit": 20, "totalPages": 4 }
}
```

---

### `POST /leases`
**Access:** `leases.create`

```json
{
  "propertyId": "uuid",
  "unitId": "uuid",
  "tenantId": "uuid",
  "templateId": "uuid",
  "startDate": "2025-02-01",
  "endDate": "2027-01-31",
  "rentAmount": 3500,
  "currency": "SGD",
  "billingCycle": "monthly",
  "billingDay": 1,
  "paymentDueDays": 7,
  "securityDeposit": 7000,
  "handoverDate": "2025-01-28",
  "escalationType": "fixed_percent",
  "escalationValue": 3,
  "escalationFrequency": "annual",
  "escalationMonth": 2,
  "specialConditions": "Tenant permitted to install AC units in bedrooms.",
  "clauses": [
    { "title": "Pet Policy", "content": "No pets allowed without prior written consent." }
  ]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "leaseNumber": "LSE-2025-00043",
    "status": "draft"
  }
}
```

---

### `GET /leases/:id`
**Access:** `leases.read`

**Response 200 (full detail):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "leaseNumber": "LSE-2025-00043",
    "status": "active",
    "unit": { "id": "uuid", "unitNumber": "1201", "unitType": "2br", "areaSqft": 950 },
    "property": { "id": "uuid", "name": "Acme Tower A", "currency": "SGD" },
    "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming", "email": "john@email.com" },
    "startDate": "2025-02-01",
    "endDate": "2027-01-31",
    "handoverDate": "2025-01-28",
    "leaseTermMonths": 24,
    "rentAmount": 3500,
    "currency": "SGD",
    "billingCycle": "monthly",
    "billingDay": 1,
    "paymentDueDays": 7,
    "securityDeposit": 7000,
    "depositPaid": true,
    "escalationType": "fixed_percent",
    "escalationValue": 3,
    "escalationFrequency": "annual",
    "escalationSchedule": [
      { "effectiveDate": "2026-02-01", "newRent": 3605, "applied": false }
    ],
    "esignStatus": "completed",
    "esignRecipients": [
      { "name": "John Tan Wei Ming", "email": "john@email.com", "status": "signed", "signedAt": "2025-01-16T14:00:00Z" }
    ],
    "amendments": [],
    "workflowInstanceId": "uuid",
    "approvedBy": { "fullName": "Alice Manager" },
    "approvedAt": "2025-01-16T10:00:00Z",
    "activatedAt": "2025-01-16T10:05:00Z",
    "createdBy": { "fullName": "Bob Agent" },
    "createdAt": "2025-01-15T09:00:00Z"
  }
}
```

---

### `PUT /leases/:id`
**Access:** `leases.update`  
Only updatable in `draft` status. Returns `400` if not draft.

---

### `POST /leases/:id/submit`
**Access:** `leases.submit`

Submits draft lease for approval workflow.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "leaseId": "uuid",
    "status": "pending_approval",
    "workflowInstanceId": "uuid",
    "currentTask": { "assignedTo": "Alice Manager", "slaDueAt": "2025-01-16T08:00:00Z" }
  }
}
```

---

### `POST /leases/:id/activate`
**Access:** `leases.approve` or automatic via workflow

Used for manual activation when no workflow is configured.

---

### `POST /leases/:id/cancel`
**Access:** `leases.update` (draft/pending only)

```json
{ "reason": "Tenant withdrew application" }
```

---

### Amendments

### `GET /leases/:id/amendments`
**Access:** `leases.read`

### `POST /leases/:id/amendments`
**Access:** `leases.update`

```json
{
  "amendmentType": "rent_revision",
  "description": "Rent increase per market review",
  "effectiveDate": "2025-06-01",
  "newRentAmount": 3800
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "amendmentNumber": 1,
    "amendmentType": "rent_revision",
    "effectiveDate": "2025-06-01",
    "newRentAmount": 3800,
    "status": "pending_approval"
  }
}
```

### `POST /leases/:id/amendments/:amendmentId/approve`
**Access:** `leases.approve`

---

### Renewal

### `POST /leases/:id/renewal`
**Access:** `leases.create`

```json
{
  "startDate": "2027-02-01",
  "endDate": "2029-01-31",
  "rentAmount": 3800,
  "offerExpiresAt": "2026-11-30T23:59:59Z"
}
```

### `POST /leases/:id/renewal/accept`
**Access:** `leases.update`

### `POST /leases/:id/renewal/decline`
**Access:** `leases.update`

---

### Termination

### `POST /leases/:id/terminate`
**Access:** `leases.terminate`

```json
{
  "terminationDate": "2025-06-30",
  "reason": "Tenant relocation to overseas",
  "terminationType": "early"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "leaseId": "uuid",
    "status": "terminated",
    "terminationDate": "2025-06-30",
    "terminationType": "early",
    "earlyTerminationPenalty": 3500,
    "penaltyBreakdown": "1 month rent penalty (3.5 months early termination)"
  }
}
```

---

### E-Signature

### `POST /leases/:id/esign/send`
**Access:** `leases.update`

```json
{
  "provider": "docusign",
  "recipients": [
    { "recipientType": "tenant", "name": "John Tan", "email": "john@email.com" },
    { "recipientType": "landlord", "name": "Alice Manager", "email": "alice@acme.com" }
  ],
  "emailSubject": "Please sign your Lease Agreement — Unit 1201, Acme Tower A",
  "emailMessage": "Please review and sign the attached lease agreement."
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "envelopeId": "docusign-envelope-id",
    "status": "sent",
    "signingUrls": [
      { "email": "john@email.com", "url": "https://app.docusign.com/sign/..." }
    ]
  }
}
```

### `GET /leases/:id/esign/status`
**Access:** `leases.read`

### `POST /leases/esign/webhook`
**Access:** Public (signature provider webhook)  
Processes DocuSign/HelloSign completion callbacks.

---

### Templates & Clauses

### `GET /lease-templates`
### `POST /lease-templates`
### `PUT /lease-templates/:id`
### `GET /lease-clauses`
### `POST /lease-clauses`

---

## Business Logic & Validation Rules

```
Lease creation validation:
1. unit.status must be 'available' or 'reserved'
2. No overlapping active/approved lease for same unit
   (startDate of new must be > endDate of existing active lease)
3. tenant.kycStatus must be 'verified' (configurable: can be set to warn-only)
4. tenant.isBlacklisted must be FALSE — hard block
5. startDate must be a future date (or today)
6. endDate must be > startDate
7. rentAmount > 0
8. billingDay: 1–28
9. paymentDueDays: 1–30
10. securityDeposit: must be >= 0

Lease number format: LSE-{YYYY}-{NNNNN} (auto from DB sequence)

Escalation schedule generation rules:
  escalationMonth/Day = when escalation first applies each year
  If escalationMonth=2, escalationDay=1: first escalation on Feb 1 of year after lease start
  For 'stepped' type: escalationValue is JSON array [{ afterMonths: 12, amount: 3800 }, ...]
  Schedule generated on activation; regenerated on amendment

Early termination penalty calculation:
  Default formula: min(3 months rent, remaining months rent × 0.5)
  Configurable per company: can be overridden with flat amount or custom formula
  Waived if termination_type = 'normal' (end of term) or breach by landlord

Amendment rules:
  rent_revision: effectiveDate must be >= today + 30 days (notice period)
  term_extension: newEndDate must be > current endDate
  unit_change: newUnit must be available; lease unit status updated atomically

Workflow integration:
  If company has active workflow definition for 'lease' entity:
    submitForApproval triggers workflow
  If no workflow defined: lease moves directly to 'approved' on submit
  Workflow completion (approved) → auto-calls activate()
  Workflow completion (rejected) → lease back to 'draft'

E-signature:
  Lease PDF generated server-side (Puppeteer) with lease data merged into template
  PDF sent to DocuSign/HelloSign as base64
  Webhook: on 'envelope-completed' → update esign_status, store signed PDF in documents
  Webhook signature verified with HMAC-SHA256

Unit status side effects (all transitions atomic):
  Lease activated → unit reserved (if handover_date > today) OR occupied (if <= today)
  Lease cancelled → unit available
  Lease terminated → unit available (immediate or after move-out date)
  Lease renewed → original lease 'renewed', new lease 'active', unit stays occupied
```

---

## UI Screens & Component Breakdown

```
admin/leases/
├── LeaseListPage/
│   ├── LeaseListPage.tsx
│   └── components/
│       ├── LeaseTable.tsx
│       │   └── LeaseTableRow.tsx        # number + unit + tenant + dates + status + actions
│       ├── LeaseStatusBadge.tsx         # color-coded status
│       ├── LeaseFilters.tsx             # property, status, expiring, search
│       ├── ExpiringAlert.tsx            # banner: N leases expiring within 30 days
│       └── CreateLeaseButton.tsx

├── LeaseDetailPage/
│   ├── LeaseDetailPage.tsx             # tabs: Overview | Terms | Amendments | E-Sign | Documents | History
│   └── components/
│       ├── LeaseHeader.tsx             # lease number + status badge + key dates + actions toolbar
│       ├── tabs/
│       │   ├── OverviewTab/
│       │   │   ├── OverviewTab.tsx
│       │   │   ├── LeasePartiesCard.tsx # tenant + unit + property summary
│       │   │   ├── LeaseDatesCard.tsx   # start/end/handover + expiry countdown
│       │   │   └── LeaseFinancialCard.tsx # rent + deposit + escalation preview
│       │   ├── TermsTab/
│       │   │   ├── TermsTab.tsx
│       │   │   ├── EscalationSchedule.tsx # table of future rent escalations
│       │   │   └── ClausesList.tsx
│       │   ├── AmendmentsTab/
│       │   │   ├── AmendmentsTab.tsx
│       │   │   ├── AmendmentCard.tsx
│       │   │   └── CreateAmendmentModal.tsx
│       │   ├── ESignTab/
│       │   │   ├── ESignTab.tsx
│       │   │   ├── RecipientStatusRow.tsx  # name + status + signed timestamp
│       │   │   └── SendForSigningModal.tsx
│       │   ├── DocumentsTab/           # lease PDF + attachments from document module
│       │   └── HistoryTab/
│       │       └── LeaseAuditTimeline.tsx

├── CreateLeasePage/                    # multi-step wizard
│   └── steps/
│       ├── Step1UnitAndTenant.tsx      # search unit (must be available) + search tenant
│       ├── Step2LeaseDates.tsx         # start, end, handover, billing settings
│       ├── Step3FinancialTerms.tsx     # rent, deposit, escalation builder
│       │   └── EscalationBuilder.tsx  # type picker + value input + preview next 5 escalations
│       ├── Step4Clauses.tsx            # clause library multi-select + custom clause editor
│       └── Step5Review.tsx             # full summary before submit

├── TerminationModal/
│   ├── TerminationModal.tsx
│   ├── EarlyTerminationWarning.tsx     # shows calculated penalty
│   └── PenaltyBreakdown.tsx

└── RenewalModal/
    ├── RenewalModal.tsx
    └── RenewalTermsForm.tsx            # new dates + rent + escalation
```

---

## State Management

```typescript
// src/store/api/leasesApi.ts
export const leasesApi = createApi({
  reducerPath: 'leasesApi',
  tagTypes: ['Leases', 'LeaseAmendments', 'EsignStatus'],
  endpoints: (builder) => ({
    getLeases: builder.query<PaginatedResponse<LeaseListItem>, LeaseQueryParams>({
      query: (params) => ({ url: '/leases', params }),
      providesTags: ['Leases'],
    }),
    getLease: builder.query<LeaseDetail, string>({
      query: (id) => `/leases/${id}`,
      providesTags: (_, __, id) => [{ type: 'Leases', id }],
    }),
    createLease: builder.mutation<Lease, CreateLeaseDto>({
      query: (body) => ({ url: '/leases', method: 'POST', body }),
      invalidatesTags: ['Leases'],
    }),
    updateLease: builder.mutation<Lease, { id: string; data: UpdateLeaseDto }>({
      query: ({ id, data }) => ({ url: `/leases/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leases', id }],
    }),
    submitLease: builder.mutation<SubmitLeaseResponse, string>({
      query: (id) => ({ url: `/leases/${id}/submit`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),
    activateLease: builder.mutation<Lease, string>({
      query: (id) => ({ url: `/leases/${id}/activate`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Leases', id }, 'Leases'],
    }),
    terminateLease: builder.mutation<Lease, { id: string; data: TerminateLeaseDto }>({
      query: ({ id, data }) => ({ url: `/leases/${id}/terminate`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Leases', id }, 'Leases'],
    }),
    createRenewal: builder.mutation<Lease, { id: string; data: CreateRenewalDto }>({
      query: ({ id, data }) => ({ url: `/leases/${id}/renewal`, method: 'POST', body: data }),
      invalidatesTags: ['Leases'],
    }),
    createAmendment: builder.mutation<LeaseAmendment, { leaseId: string; data: CreateAmendmentDto }>({
      query: ({ leaseId, data }) => ({ url: `/leases/${leaseId}/amendments`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { leaseId }) => [{ type: 'LeaseAmendments', id: leaseId }, { type: 'Leases', id: leaseId }],
    }),
    sendForSigning: builder.mutation<EsignSendResponse, { id: string; data: EsignSendDto }>({
      query: ({ id, data }) => ({ url: `/leases/${id}/esign/send`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'EsignStatus', id }],
    }),
    getEsignStatus: builder.query<EsignStatusResponse, string>({
      query: (id) => `/leases/${id}/esign/status`,
      providesTags: (_, __, id) => [{ type: 'EsignStatus', id }],
    }),
    getLeaseTemplates: builder.query<LeaseTemplate[], void>({
      query: () => '/lease-templates',
    }),
    getLeaseClauses: builder.query<LeaseClause[], void>({
      query: () => '/lease-clauses',
    }),
  }),
});
```
