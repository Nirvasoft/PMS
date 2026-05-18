# PMS — Phase 2: Property Structure & Leasing
## Developer Specification Index

**Tech Stack:** Node.js 20+ · Express · Prisma · TypeScript · PostgreSQL 15+ (PostGIS) · Redis 7+ · React 18 · Redux Toolkit  
**Timeline:** Months 4–6  
**Depends On:** Phase 1 (all 7 modules)  
**Total Effort:** ~14 developer-weeks

---

## Module Index

| File | Module | Backend Effort | Frontend Effort |
|------|--------|---------------|-----------------|
| `01_property_management.md` | 2.1 Property Management | 1.5 weeks | 0.5 weeks |
| `02_tower_unit_management.md` | 2.2 Tower, Block & Unit Management | 1.5 weeks | 0.5 weeks |
| `03_tenant_management.md` | 2.3 Tenant Management | 1.5 weeks | 0.5 weeks |
| `04_lease_management.md` | 2.4 Lease Management | 3 weeks | 1 week |
| `05_crm_leasing_and_06_parking_management.md` | 2.5 CRM & Leasing + 2.6 Parking | 2 weeks | 1 week |

---

## Dependency Graph (Phase 2)

```
Phase 1 (all modules)
    └─► 2.1 Property Management
            └─► 2.2 Tower & Unit Management
                    └─► 2.3 Tenant Management
                            └─► 2.4 Lease Management  ◄─── 2.5 CRM & Leasing
                                    └─► 2.6 Parking Management
```

Build order: 2.1 → 2.2 → 2.3 → 2.4 → (2.5 + 2.6 in parallel)

---

## Cross-Cutting Concerns (Phase 2)

### 1. Entity-Level Permission Scoping

All Phase 2 endpoints are scoped by property. Users with role assignments scoped to a specific `propertyId` (set via `user_roles.property_id`) can only access data for their assigned properties.

```typescript
// Decorator applied to property-scoped controllers
@UseGuards(PropertyAccessGuard)
@Controller('properties/:propertyId/...')

// src/common/guards/property-access.guard.ts
@Injectable()
export class PropertyAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload;
    const propertyId = req.params.propertyId;

    if (!propertyId) return true;

    // Admin bypasses property check
    if (user.roles.includes('admin')) return true;

    // Check user has explicit property access or company-wide access
    const hasAccess = user.propertyIds.includes(propertyId) || user.propertyIds.length === 0;
    if (!hasAccess) throw new ForbiddenException('No access to this property');
    return true;
  }
}
```

### 2. PostGIS Setup

Phase 2 requires PostGIS extension for geo-queries on properties.

```sql
-- Run in first Phase 2 migration
CREATE EXTENSION IF NOT EXISTS postgis;

-- Populate geo_point from lat/lng on existing rows
UPDATE properties
SET geo_point = ST_SetSRID(ST_MakePoint(geo_lng, geo_lat), 4326)
WHERE geo_lat IS NOT NULL AND geo_lng IS NOT NULL;

-- Trigger to keep geo_point in sync with geo_lat/geo_lng
CREATE OR REPLACE FUNCTION sync_geo_point() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geo_lat IS NOT NULL AND NEW.geo_lng IS NOT NULL THEN
    NEW.geo_point := ST_SetSRID(ST_MakePoint(NEW.geo_lng, NEW.geo_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_geo_point
BEFORE INSERT OR UPDATE OF geo_lat, geo_lng ON properties
FOR EACH ROW EXECUTE FUNCTION sync_geo_point();
```

### 3. Unit Status Cache Invalidation

Unit status changes cascade to the property stats cache. All unit status update operations must call:

```typescript
// After any unit.status change:
await this.redis.del(`pms:property:stats:${unit.propertyId}`);
await this.redis.del(`pms:widget:${companyId}:occupancy_rate:*`);
// Wildcard delete for occupancy widgets
const keys = await this.redis.keys(`pms:widget:${companyId}:occupancy_rate:*`);
if (keys.length) await this.redis.del(...keys);
```

### 4. Lease Number Sequence

The lease number sequence (`lease_number_seq`) is company-wide. For multi-company deployments using the same DB, use a per-company sequence approach:

```sql
-- Company-scoped lease numbering (alternative approach)
CREATE TABLE company_sequences (
  company_id   UUID NOT NULL REFERENCES companies(id),
  sequence_key VARCHAR(50) NOT NULL,
  current_val  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, sequence_key)
);

CREATE OR REPLACE FUNCTION next_company_seq(p_company_id UUID, p_key VARCHAR)
RETURNS BIGINT AS $$
DECLARE next_val BIGINT;
BEGIN
  INSERT INTO company_sequences (company_id, sequence_key, current_val)
  VALUES (p_company_id, p_key, 1)
  ON CONFLICT (company_id, sequence_key)
  DO UPDATE SET current_val = company_sequences.current_val + 1
  RETURNING current_val INTO next_val;
  RETURN next_val;
END;
$$ LANGUAGE plpgsql;

-- Usage: 'LSE-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_company_seq(company_id, 'lease')::TEXT, 5, '0')
```

### 5. Recurring Billing Setup Hook

Module 2.4 (Lease Management) calls a `BillingSetupService` when a lease is activated. This service is **stubbed in Phase 2** and fully implemented in Phase 3 (Billing Engine).

```typescript
// src/modules/leases/stubs/billing-setup.stub.ts
// Replaced with real implementation in Phase 3
@Injectable()
export class BillingSetupStub {
  async createLeaseChargeSchedule(lease: Lease): Promise<void> {
    // TODO: Phase 3 — create recurring billing schedule
    console.log(`[STUB] Would create billing schedule for lease ${lease.leaseNumber}`);
  }

  async cancelLeaseCharges(leaseId: string, terminationDate: string): Promise<void> {
    // TODO: Phase 3 — cancel future invoices after terminationDate
    console.log(`[STUB] Would cancel charges for lease ${leaseId} after ${terminationDate}`);
  }
}
```

### 6. Cron Jobs Introduced in Phase 2

| Job | Schedule | Purpose |
|-----|----------|---------|
| `lease-renewal-alerts` | `0 8 * * *` | Send renewal reminders at 90/60/30/14/7 days |
| `escalation-apply` | `0 1 * * *` | Apply due rent escalations |
| `lease-expiry-transition` | `0 0 * * *` | Move expired leases to 'expired' status |
| `kyc-expiry-check` | `0 7 * * *` | Alert on expiring KYC documents |
| `parking-pass-expiry` | `*/15 * * * *` | Mark expired visitor passes |

### 7. New Notification Templates (Phase 2)

Register these templates in the Notification Center (Module 1.5):

```typescript
export const PHASE2_NOTIFICATION_TEMPLATES = [
  { code: 'lease_activated',       name: 'Lease Activated',           channels: ['email', 'in_app'] },
  { code: 'lease_terminated',      name: 'Lease Terminated',          channels: ['email', 'in_app'] },
  { code: 'lease_expiring_soon',   name: 'Lease Expiring Soon',       channels: ['email', 'in_app'] },
  { code: 'lease_renewal_offer',   name: 'Lease Renewal Offer',       channels: ['email', 'in_app'] },
  { code: 'lease_approved',        name: 'Lease Approved',            channels: ['email', 'in_app'] },
  { code: 'lease_rejected',        name: 'Lease Rejected',            channels: ['email', 'in_app'] },
  { code: 'kyc_document_approved', name: 'KYC Document Approved',     channels: ['in_app'] },
  { code: 'kyc_document_rejected', name: 'KYC Document Rejected',     channels: ['email', 'in_app'] },
  { code: 'kyc_expiring',          name: 'KYC Expiring Soon',         channels: ['email', 'in_app'] },
  { code: 'tenant_blacklisted',    name: 'Tenant Blacklisted',        channels: ['in_app'] },
  { code: 'viewing_reminder',      name: 'Viewing Appointment Reminder', channels: ['email', 'sms'] },
  { code: 'parking_pass_issued',   name: 'Visitor Parking Pass Issued', channels: ['email', 'sms'] },
];
```

### 8. New Dashboard Widget Providers (Phase 2)

Replace stub providers with real implementations:

```typescript
// Now fully implemented in Phase 2:
// - occupancy_rate (OccupancyProvider)
// - vacancy_trend (VacancyProvider)
// - lease_expiring_soon (LeaseExpiryProvider)
// - unit_status_breakdown (UnitStatusProvider)

// New Phase 2 widgets to register:
export const PHASE2_WIDGETS = [
  { code: 'active_leases',         category: 'property', widgetType: 'kpi_card',   requiredPermissions: ['leases.read'] },
  { code: 'leases_by_status',      category: 'property', widgetType: 'pie_chart',  requiredPermissions: ['leases.read'] },
  { code: 'new_leads_this_month',  category: 'property', widgetType: 'kpi_card',   requiredPermissions: ['leads.read'] },
  { code: 'lead_conversion_rate',  category: 'property', widgetType: 'kpi_card',   requiredPermissions: ['leads.read'] },
  { code: 'lead_pipeline',         category: 'property', widgetType: 'bar_chart',  requiredPermissions: ['leads.read'] },
  { code: 'parking_occupancy',     category: 'property', widgetType: 'gauge',      requiredPermissions: ['parking.read'] },
];
```

### 9. Phase 2 Migration Files

```
migrations/
├── 1700010001-extend-properties-table.ts       # PostGIS + new property columns
├── 1700010002-create-property-photos.ts
├── 1700010003-create-facilities.ts
├── 1700010004-create-towers-units.ts
├── 1700010005-create-unit-meters.ts
├── 1700010006-create-tenants.ts
├── 1700010007-create-kyc-tables.ts
├── 1700010008-create-leases.ts
├── 1700010009-create-lease-amendments.ts
├── 1700010010-create-lease-escalation.ts
├── 1700010011-create-lease-clauses.ts
├── 1700010012-create-crm-leads.ts
├── 1700010013-create-parking.ts
├── 1700010014-seed-property-types.ts
├── 1700010015-seed-unit-types.ts
├── 1700010016-seed-facility-types.ts
└── 1700010017-seed-phase2-notification-templates.ts
```

---

## Phase 2 Acceptance Criteria

- [ ] Property CRUD + photo gallery + Google Maps integration functional
- [ ] Floor plan view renders correctly for properties with 200+ units
- [ ] Bulk unit creation: 20 floors × 10 units = 200 units created in < 3 seconds
- [ ] Tenant KYC workflow: submit → review → verify/reject cycle complete
- [ ] Blacklist check blocks lease creation for blacklisted tenant (hard block)
- [ ] Lease full lifecycle: Draft → Submit → Approve → Activate → Escalation scheduled → Terminate
- [ ] Renewal alerts sent at 90/60/30 days (verified via test lease with modified end date)
- [ ] E-signature DocuSign integration: envelope sent + webhook completion received + PDF stored
- [ ] Unit status auto-updated on lease activation and termination
- [ ] CRM pipeline: lead created → viewed → converted → linked to lease
- [ ] Parking: slot allocation → visitor pass QR → scan entry → scan exit
- [ ] All Phase 2 dashboard widgets returning real data (no stubs)
- [ ] PostGIS nearby property search functional
- [ ] All endpoints respond p95 < 400ms under 200 concurrent users
- [ ] Multi-tenant isolation: Company A cannot see Company B leases/tenants/units
- [ ] UAT sign-off from product owner on all 6 modules
