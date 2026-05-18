# Module 6.1 — Shopping Mall Specific Modules

**Phase:** 6 — Vertical Specializations, BI & Integrations  
**Stack:** NestJS · PostgreSQL · Redis · Bull · React 18 · Redux Toolkit  
**Estimated Effort:** 4 weeks (3 backend, 1 frontend)  
**Depends On:** Module 2.4 (Lease), 3.1 (Billing), 3.4 (GL), 4.3 (Facility/CAM), 2.1 (Property)  
**Feature Flag:** `mall_module_enabled = true` in `companies.settings`

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

Complete shopping mall operations layer built on top of the core leasing and billing engine. Key differentiators vs standard commercial leasing: **percentage rent** (rent tied to tenant's gross turnover), **CAM billing** with year-end reconciliation, **retail sales reporting**, **footfall analytics**, and **mall event/promotion management**.

**Key capabilities:**
- Shop profiles with brand, category, and tenant-mix management
- Commercial lease extensions: fit-out period, anchor tenant flags, lease clauses library
- Percentage rent: monthly GTO submission by tenant → automatic base vs percentage rent calculation
- POS integration for automated sales data ingestion
- CAM cost pool management + monthly billing + annual reconciliation
- Promotion and event calendar with booth/kiosk rental
- Footfall analytics with sensor integration (AXIS, Xovis, RetailNext)
- Mall performance BI: occupancy by zone, sales density, category mix

---

## DB Schema

```sql
-- Mall-specific property extension
CREATE TABLE mall_properties (
  property_id          UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  total_gla_sqft       NUMERIC(12,2),              -- Gross Leasable Area
  total_nla_sqft       NUMERIC(12,2),              -- Net Leasable Area
  total_shops          SMALLINT DEFAULT 0,
  total_floors         SMALLINT,
  anchor_tenant_slots  SMALLINT DEFAULT 0,
  mall_type            VARCHAR(30),                -- 'regional'|'community'|'strip'|'outlet'|'specialty'
  management_fee_pct   NUMERIC(5,4) DEFAULT 0.05, -- 5% of base rent
  cam_pool_type        VARCHAR(20) DEFAULT 'shared',
                       -- 'shared'|'zone_based'|'proportionate'
  cam_admin_fee_pct    NUMERIC(5,4) DEFAULT 0.10, -- 10% admin load on CAM
  fiscal_year_start    SMALLINT DEFAULT 1,         -- month: 1=Jan
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shop profiles (each shop is a unit with extra attributes)
CREATE TABLE shop_profiles (
  unit_id          UUID PRIMARY KEY REFERENCES units(id) ON DELETE CASCADE,
  shop_number      VARCHAR(30),
  brand_name       VARCHAR(150),
  trade_category   VARCHAR(100),                   -- 'F&B'|'Fashion'|'Electronics'|'Beauty'|'Services'|'Anchor'|'Entertainment'
  trade_subcategory VARCHAR(100),
  franchise_group  VARCHAR(150),
  logo_url         VARCHAR(500),
  shopfront_url    VARCHAR(500),
  is_anchor        BOOLEAN NOT NULL DEFAULT FALSE,
  anchor_type      VARCHAR(30),                    -- 'anchor'|'mini_anchor'|'satellite'
  shop_zone        VARCHAR(50),                    -- 'north_wing'|'east_wing'|'atrium'|'basement'
  shopfront_width_m NUMERIC(6,2),
  fit_out_allowed  BOOLEAN NOT NULL DEFAULT TRUE,
  pos_system       VARCHAR(50),                    -- 'square'|'lightspeed'|'revel'|'custom'
  pos_store_id     VARCHAR(100),                   -- ID in the POS system
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commercial lease extensions (one-to-one with leases where property has mall_module_enabled)
CREATE TABLE commercial_leases (
  lease_id                UUID PRIMARY KEY REFERENCES leases(id) ON DELETE CASCADE,
  -- Fit-out period
  fit_out_start_date      DATE,
  fit_out_end_date        DATE,
  fit_out_rent_free       BOOLEAN NOT NULL DEFAULT TRUE,
  fit_out_allowance       NUMERIC(15,2) DEFAULT 0,
  fit_out_allowance_paid  BOOLEAN DEFAULT FALSE,
  -- Percentage rent
  has_percentage_rent     BOOLEAN NOT NULL DEFAULT FALSE,
  base_rent_pct_threshold NUMERIC(15,2),           -- natural breakpoint = base_rent / pct_rate
  percentage_rent_rate    NUMERIC(5,4),            -- e.g. 0.08 = 8% of GTO above threshold
  percentage_rent_type    VARCHAR(20) DEFAULT 'natural',
                          -- 'natural'|'artificial'
  artificial_breakpoint   NUMERIC(15,2),           -- if type='artificial', fixed breakpoint amount
  gto_reporting_day       SMALLINT DEFAULT 15,     -- day of month tenant submits GTO
  -- CAM
  cam_included            BOOLEAN NOT NULL DEFAULT TRUE,
  cam_rate_per_sqft       NUMERIC(10,4),           -- if fixed-rate CAM
  cam_cap_pct             NUMERIC(5,4),            -- annual increase cap on CAM
  cam_base_year           SMALLINT,
  -- Other charges
  marketing_levy_pct      NUMERIC(5,4) DEFAULT 0.01,  -- 1% of base rent
  marketing_levy_amount   NUMERIC(12,2),
  turnover_reporting_required BOOLEAN NOT NULL DEFAULT TRUE,
  -- Anchor specific
  exclusivity_category    VARCHAR(100),            -- anchor exclusivity trade category
  exclusivity_radius_km   NUMERIC(5,2),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly GTO (Gross Turnover) submissions by tenants
CREATE TABLE gto_submissions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  property_id       UUID NOT NULL REFERENCES properties(id),
  unit_id           UUID NOT NULL REFERENCES units(id),
  lease_id          UUID NOT NULL REFERENCES leases(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  submission_month  SMALLINT NOT NULL,             -- 1–12
  submission_year   SMALLINT NOT NULL,
  gross_turnover    NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- Breakdown by payment type (optional)
  cash_sales        NUMERIC(15,2),
  card_sales        NUMERIC(15,2),
  online_sales      NUMERIC(15,2),
  other_sales       NUMERIC(15,2),
  -- Submission metadata
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by      UUID NOT NULL REFERENCES users(id),
  submission_method VARCHAR(20) DEFAULT 'manual',  -- 'manual'|'pos_sync'|'portal'
  -- Verification
  verified          BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by       UUID REFERENCES users(id),
  verified_at       TIMESTAMPTZ,
  variance_pct      NUMERIC(7,4),                  -- vs. POS data if available
  -- Percentage rent calculation
  base_rent         NUMERIC(15,2),
  natural_breakpoint NUMERIC(15,2),
  gto_above_breakpoint NUMERIC(15,2),
  percentage_rent   NUMERIC(15,2) DEFAULT 0,
  total_rent_due    NUMERIC(15,2),
  invoice_id        UUID REFERENCES invoices(id),
  pos_validated     BOOLEAN DEFAULT FALSE,
  notes             TEXT,
  CONSTRAINT uq_gto_submission UNIQUE (lease_id, submission_month, submission_year)
);

CREATE INDEX idx_gto_property ON gto_submissions(property_id, submission_year, submission_month);
CREATE INDEX idx_gto_lease ON gto_submissions(lease_id);

-- CAM cost pools (groups of costs allocated to tenants)
CREATE TABLE cam_cost_pools (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  pool_type       VARCHAR(30) NOT NULL,            -- 'controllable'|'uncontrollable'|'capital'
  allocation_basis VARCHAR(30) DEFAULT 'gla',      -- 'gla'|'equal'|'zone'|'custom'
  cost_categories  TEXT[] NOT NULL DEFAULT '{}',  -- which cam_cost_entry categories feed this pool
  year             SMALLINT NOT NULL,
  budgeted_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cam_pool UNIQUE (property_id, name, year)
);

-- CAM billing (monthly invoices from cam cost pools → tenants)
CREATE TABLE cam_billings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  pool_id         UUID NOT NULL REFERENCES cam_cost_pools(id),
  unit_id         UUID NOT NULL REFERENCES units(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  lease_id        UUID REFERENCES leases(id),
  billing_month   SMALLINT NOT NULL,
  billing_year    SMALLINT NOT NULL,
  unit_gla_sqft   NUMERIC(10,2) NOT NULL,
  total_gla_sqft  NUMERIC(12,2) NOT NULL,
  allocation_pct  NUMERIC(8,6) NOT NULL,           -- unit_gla / total_gla
  pool_amount     NUMERIC(15,2) NOT NULL,
  admin_fee       NUMERIC(15,2) NOT NULL DEFAULT 0,
  allocated_amount NUMERIC(15,2) NOT NULL,
  invoice_id      UUID REFERENCES invoices(id),
  status          VARCHAR(20) DEFAULT 'pending',   -- 'pending'|'invoiced'|'paid'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cam_billing UNIQUE (pool_id, unit_id, billing_month, billing_year)
);

-- CAM reconciliation (annual true-up: estimated vs actual)
CREATE TABLE cam_reconciliations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  property_id         UUID NOT NULL REFERENCES properties(id),
  pool_id             UUID NOT NULL REFERENCES cam_cost_pools(id),
  unit_id             UUID NOT NULL REFERENCES units(id),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  recon_year          SMALLINT NOT NULL,
  total_estimated     NUMERIC(15,2) NOT NULL,      -- sum of monthly billings
  total_actual        NUMERIC(15,2) NOT NULL,      -- actual allocated cost
  variance            NUMERIC(15,2) NOT NULL,      -- actual - estimated
  -- If positive: tenant owes more → debit note
  -- If negative: tenant overpaid → credit note
  invoice_id          UUID REFERENCES invoices(id),
  status              VARCHAR(20) DEFAULT 'draft', -- 'draft'|'finalized'|'invoiced'
  finalized_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cam_recon UNIQUE (pool_id, unit_id, recon_year)
);

-- Mall promotions and events
CREATE TABLE mall_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  property_id       UUID NOT NULL REFERENCES properties(id),
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  event_type        VARCHAR(30) NOT NULL,           -- 'campaign'|'event'|'roadshow'|'sale'|'exhibition'
  category          VARCHAR(50),                   -- 'fashion'|'food'|'lifestyle'|'entertainment'|'kids'
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  start_time        TIME,
  end_time          TIME,
  venue             VARCHAR(255),
  organizer         VARCHAR(150),
  estimated_footfall INTEGER,
  actual_footfall   INTEGER,
  budget            NUMERIC(15,2),
  actual_cost       NUMERIC(15,2),
  status            VARCHAR(20) DEFAULT 'planned',  -- 'planned'|'active'|'completed'|'cancelled'
  banner_url        VARCHAR(500),
  is_public         BOOLEAN DEFAULT TRUE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booth / kiosk rental within events
CREATE TABLE booth_rentals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES mall_events(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  booth_number    VARCHAR(20) NOT NULL,
  booth_location  VARCHAR(150),
  size_sqft       NUMERIC(8,2),
  tenant_id       UUID REFERENCES tenants(id),
  brand_name      VARCHAR(150),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  daily_rate      NUMERIC(10,2),
  total_amount    NUMERIC(12,2),
  deposit         NUMERIC(12,2) DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'reserved',  -- 'reserved'|'confirmed'|'active'|'completed'|'cancelled'
  invoice_id      UUID REFERENCES invoices(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Footfall sensors
CREATE TABLE footfall_sensors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id   UUID NOT NULL REFERENCES properties(id),
  company_id    UUID NOT NULL REFERENCES companies(id),
  sensor_id     VARCHAR(100) NOT NULL,              -- device ID from vendor
  name          VARCHAR(150) NOT NULL,
  location      VARCHAR(255),
  zone          VARCHAR(50),
  floor         VARCHAR(20),
  sensor_type   VARCHAR(30) DEFAULT 'stereo',       -- 'stereo'|'thermal'|'lidar'|'wifi'
  vendor        VARCHAR(50),                        -- 'axis'|'xovis'|'retailnext'|'hikvision'
  api_endpoint  VARCHAR(500),
  api_key_enc   VARCHAR(500),                       -- encrypted API key
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Footfall counts (hourly aggregation from sensors)
CREATE TABLE footfall_counts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id     UUID NOT NULL REFERENCES footfall_sensors(id) ON DELETE CASCADE,
  property_id   UUID NOT NULL REFERENCES properties(id),
  counted_at    TIMESTAMPTZ NOT NULL,
  period_type   VARCHAR(10) NOT NULL DEFAULT 'hourly',  -- 'hourly'|'daily'
  entries       INTEGER NOT NULL DEFAULT 0,
  exits         INTEGER NOT NULL DEFAULT 0,
  net_visitors  INTEGER GENERATED ALWAYS AS (entries - exits) STORED,
  zone          VARCHAR(50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_footfall_sensor_period UNIQUE (sensor_id, counted_at, period_type)
);

CREATE INDEX idx_footfall_property ON footfall_counts(property_id, counted_at DESC);
CREATE INDEX idx_footfall_sensor ON footfall_counts(sensor_id, counted_at DESC);
```

---

## Server-Side Architecture

```
src/modules/mall/
├── mall.module.ts
├── shops.controller.ts
├── shops.service.ts
├── commercial-lease.controller.ts
├── commercial-lease.service.ts
├── gto.controller.ts
├── gto.service.ts                      # GTO submission + percentage rent calc
├── cam.controller.ts
├── cam.service.ts                      # CAM pool management + billing + reconciliation
├── events.controller.ts
├── events.service.ts
├── footfall.controller.ts
├── footfall.service.ts
├── footfall-sync.service.ts            # pulls data from sensor APIs via Bull job
├── queues/
│   ├── gto-reminder.processor.ts       # monthly reminder to submit GTO
│   ├── footfall-sync.processor.ts      # hourly sensor data pull
│   └── cam-billing.processor.ts        # monthly CAM invoice generation
├── dto/
│   ├── create-shop-profile.dto.ts
│   ├── update-commercial-lease.dto.ts
│   ├── submit-gto.dto.ts
│   ├── create-cam-pool.dto.ts
│   ├── generate-cam-billing.dto.ts
│   ├── run-cam-reconciliation.dto.ts
│   ├── create-event.dto.ts
│   └── create-booth-rental.dto.ts
└── entities/ (as above)
```

### GTO Service

```typescript
// src/modules/mall/gto.service.ts
@Injectable()
export class GtoService {
  constructor(
    @InjectRepository(GtoSubmission) private gtoRepo: Repository<GtoSubmission>,
    @InjectRepository(CommercialLease) private commLeaseRepo: Repository<CommercialLease>,
    private billingEngineService: BillingEngineService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Process a GTO submission and calculate percentage rent.
   *
   * Percentage rent formula:
   *   Natural breakpoint = base_rent / percentage_rent_rate
   *   If GTO > natural_breakpoint:
   *     percentage_rent = (GTO - breakpoint) × rate
   *   Total rent due = MAX(base_rent, percentage_rent + base_rent)
   *   In practice: total = base_rent + max(0, (GTO - breakpoint) × rate)
   */
  async submitGto(dto: SubmitGtoDto, submittedBy: string): Promise<GtoSubmission> {
    const lease = await this.leaseRepo.findOneOrFail({ where: { id: dto.leaseId } });
    const commLease = await this.commLeaseRepo.findOneOrFail({ where: { leaseId: dto.leaseId } });

    if (!commLease.hasPercentageRent) {
      // Just record the GTO, no extra billing
      return this.gtoRepo.save({ ...dto, submittedBy, baseRent: lease.rentAmount, totalRentDue: lease.rentAmount });
    }

    const breakpoint = commLease.percentageRentType === 'artificial'
      ? Number(commLease.artificialBreakpoint)
      : Number(lease.rentAmount) / Number(commLease.percentageRentRate);

    const gtoAboveBreakpoint = Math.max(0, Number(dto.grossTurnover) - breakpoint);
    const percentageRent = gtoAboveBreakpoint * Number(commLease.percentageRentRate);
    const totalRentDue = Number(lease.rentAmount) + percentageRent;

    const submission = await this.gtoRepo.save({
      ...dto,
      submittedBy,
      submittedAt: new Date(),
      baseRent: lease.rentAmount,
      naturalBreakpoint: breakpoint,
      gtoAboveBreakpoint,
      percentageRent,
      totalRentDue,
    });

    // Generate supplementary invoice for percentage rent if > 0
    if (percentageRent > 0.01) {
      const invoice = await this.billingEngineService.createManualInvoice({
        companyId: dto.companyId,
        propertyId: dto.propertyId,
        unitId: dto.unitId,
        tenantId: dto.tenantId,
        leaseId: dto.leaseId,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: addDays(new Date(), 14).toISOString().split('T')[0],
        currency: dto.currency,
        lines: [{
          chargeTypeCode: 'PERCENTAGE_RENT',
          description: `Percentage Rent — ${this.monthName(dto.submissionMonth)} ${dto.submissionYear} (GTO: ${dto.currency} ${dto.grossTurnover.toFixed(2)})`,
          quantity: 1,
          unitPrice: percentageRent,
          taxRate: 0,
        }],
        notes: `GTO submission ref: ${submission.id}`,
      });
      await this.gtoRepo.update(submission.id, { invoiceId: invoice.id });
    }

    return this.gtoRepo.findOneOrFail({ where: { id: submission.id } });
  }

  /**
   * Monthly cron: Send GTO reminder to all shops that haven't submitted.
   */
  @Cron('0 9 15 * *')  // 9 AM on 15th of every month
  async sendGtoReminders(): Promise<void> {
    const today = new Date();
    const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth();
    const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

    // Find all active mall leases with GTO requirement and no submission for last month
    const missing = await this.dataSource.query(`
      SELECT l.id AS lease_id, l.tenant_id, l.unit_id, u.unit_number, p.name AS property_name
      FROM leases l
      JOIN commercial_leases cl ON cl.lease_id = l.id
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = l.property_id
      WHERE l.status = 'active'
        AND cl.turnover_reporting_required = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM gto_submissions g
          WHERE g.lease_id = l.id
            AND g.submission_month = $1
            AND g.submission_year = $2
        )
    `, [prevMonth, prevYear]);

    for (const row of missing) {
      await this.notificationsService.send({
        templateCode: 'gto_submission_reminder',
        companyId: 'SYSTEM',
        recipientIds: [row.tenant_id],
        channels: ['email', 'in_app'],
        variables: {
          unitNumber: row.unit_number,
          propertyName: row.property_name,
          month: this.monthName(prevMonth),
          year: prevYear,
          deadline: `${today.getDate() + 5} ${this.monthName(today.getMonth() + 1)} ${today.getFullYear()}`,
        },
      });
    }
  }
}

// src/modules/mall/cam.service.ts
@Injectable()
export class CamService {
  /**
   * Generates monthly CAM billings for all active mall tenants.
   * Called by monthly Bull job on 1st of each month.
   */
  async generateMonthlyCamBillings(propertyId: string, month: number, year: number): Promise<void> {
    const mallProperty = await this.mallPropertyRepo.findOne({ where: { propertyId } });
    if (!mallProperty) return;

    const pools = await this.poolRepo.find({ where: { propertyId, year, isActive: true } });

    for (const pool of pools) {
      await this.generatePoolBillings(pool, propertyId, month, year, mallProperty);
    }
  }

  private async generatePoolBillings(
    pool: CamCostPool, propertyId: string, month: number, year: number, mall: MallProperty,
  ): Promise<void> {
    // Get actual CAM costs for this pool this month from cam_cost_entries
    const actualCosts = await this.camEntryRepo
      .createQueryBuilder('c')
      .select('SUM(c.amount)', 'total')
      .where('c.property_id = :propertyId AND c.period_month = :month AND c.period_year = :year', { propertyId, month, year })
      .andWhere('c.cost_category = ANY(:categories)', { categories: pool.costCategories })
      .getRawOne();

    const poolActualAmount = Number(actualCosts?.total ?? 0);
    const adminFeeAmount = poolActualAmount * Number(mall.camAdminFeePct);
    const totalPoolCost = poolActualAmount + adminFeeAmount;

    // Update pool actual amount
    await this.poolRepo.update(pool.id, { actualAmount: () => `actual_amount + ${poolActualAmount}` });

    // Get all active units with mall leases for this property
    const units = await this.dataSource.query(`
      SELECT u.id AS unit_id, u.area_sqft, l.tenant_id, l.id AS lease_id, cl.cam_included
      FROM units u
      JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
      JOIN commercial_leases cl ON cl.lease_id = l.id
      WHERE u.property_id = $1 AND cl.cam_included = TRUE AND u.deleted_at IS NULL
    `, [propertyId]);

    if (!units.length) return;

    const totalGla = units.reduce((s: number, u: any) => s + Number(u.area_sqft), 0);

    for (const unit of units) {
      const allocationPct = Number(unit.area_sqft) / totalGla;
      const allocatedAmount = totalPoolCost * allocationPct;
      const adminFee = adminFeeAmount * allocationPct;

      // Check CAP constraint
      const cappedAmount = await this.applyCamCap(unit.lease_id, allocatedAmount, year, month);

      // Create billing record
      const billing = await this.camBillingRepo.save({
        companyId: pool.companyId,
        propertyId,
        poolId: pool.id,
        unitId: unit.unit_id,
        tenantId: unit.tenant_id,
        leaseId: unit.lease_id,
        billingMonth: month,
        billingYear: year,
        unitGlaSqft: unit.area_sqft,
        totalGlaSqft: totalGla,
        allocationPct,
        poolAmount: totalPoolCost,
        adminFee,
        allocatedAmount: cappedAmount,
      });

      // Generate invoice
      const invoice = await this.billingEngineService.createManualInvoice({
        companyId: pool.companyId,
        propertyId,
        unitId: unit.unit_id,
        tenantId: unit.tenant_id,
        leaseId: unit.lease_id,
        lines: [{
          chargeTypeCode: 'CAM_CHARGE',
          description: `CAM Charge — ${pool.name} (${this.monthName(month)} ${year})`,
          quantity: 1,
          unitPrice: cappedAmount,
        }],
      });

      await this.camBillingRepo.update(billing.id, { invoiceId: invoice.id, status: 'invoiced' });
    }
  }

  /**
   * Annual CAM reconciliation: compare estimated (monthly billings sum) vs actual costs.
   * Creates debit/credit notes for each tenant.
   */
  async runAnnualReconciliation(propertyId: string, year: number): Promise<CamReconciliation[]> {
    const pools = await this.poolRepo.find({ where: { propertyId, year } });
    const results: CamReconciliation[] = [];

    for (const pool of pools) {
      const billings = await this.camBillingRepo.find({ where: { poolId: pool.id, billingYear: year } });

      // Group by unit
      const byUnit = new Map<string, CamBilling[]>();
      for (const b of billings) {
        const key = b.unitId;
        if (!byUnit.has(key)) byUnit.set(key, []);
        byUnit.get(key)!.push(b);
      }

      for (const [unitId, unitBillings] of byUnit) {
        const totalEstimated = unitBillings.reduce((s, b) => s + Number(b.allocatedAmount), 0);
        const allocationPct = Number(unitBillings[0].allocationPct);
        const totalActual = Number(pool.actualAmount) * (1 + Number(pool.camAdminFeePct ?? 0.10)) * allocationPct;
        const variance = totalActual - totalEstimated;

        const recon = await this.reconRepo.save({
          companyId: pool.companyId,
          propertyId,
          poolId: pool.id,
          unitId,
          tenantId: unitBillings[0].tenantId,
          reconYear: year,
          totalEstimated,
          totalActual,
          variance,
        });

        // Create invoice or credit note
        if (Math.abs(variance) > 1) {
          const invoice = await this.billingEngineService.createManualInvoice({
            companyId: pool.companyId,
            propertyId,
            unitId,
            tenantId: unitBillings[0].tenantId,
            leaseId: unitBillings[0].leaseId,
            invoiceType: variance > 0 ? 'invoice' : 'credit_note',
            lines: [{
              chargeTypeCode: variance > 0 ? 'CAM_RECONCILIATION_DEBIT' : 'CAM_RECONCILIATION_CREDIT',
              description: `CAM Reconciliation ${year} — ${variance > 0 ? 'Shortfall' : 'Overpayment'} (${pool.name})`,
              quantity: 1,
              unitPrice: Math.abs(variance),
            }],
          });
          await this.reconRepo.update(recon.id, { invoiceId: invoice.id, status: 'invoiced' });
        }

        results.push(recon);
      }
    }
    return results;
  }
}

// src/modules/mall/footfall-sync.service.ts
@Injectable()
export class FootfallSyncService {
  @Cron('0 * * * *')  // Every hour
  async syncAllSensors(): Promise<void> {
    const activeSensors = await this.sensorRepo.find({ where: { isActive: true } });
    for (const sensor of activeSensors) {
      await this.footfallQueue.add('sync-sensor', { sensorId: sensor.id });
    }
  }

  async syncSensor(sensorId: string): Promise<void> {
    const sensor = await this.sensorRepo.findOneOrFail({ where: { id: sensorId } });
    const apiKey = await this.decrypt(sensor.apiKeyEnc);

    let data: FootfallDataPoint[];
    switch (sensor.vendor) {
      case 'axis':
        data = await this.pullAxisData(sensor.apiEndpoint!, apiKey, sensor);
        break;
      case 'xovis':
        data = await this.pullXovisData(sensor.apiEndpoint!, apiKey, sensor);
        break;
      default:
        throw new Error(`Unsupported vendor: ${sensor.vendor}`);
    }

    for (const point of data) {
      await this.countRepo.upsert({
        sensorId: sensor.id,
        propertyId: sensor.propertyId,
        countedAt: point.timestamp,
        periodType: 'hourly',
        entries: point.entries,
        exits: point.exits,
        zone: sensor.zone,
      }, ['sensorId', 'countedAt', 'periodType']);
    }
  }

  private async pullAxisData(endpoint: string, apiKey: string, sensor: FootfallSensor): Promise<FootfallDataPoint[]> {
    const response = await axios.get(`${endpoint}/analytics/count`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { from: subHours(new Date(), 2).toISOString(), to: new Date().toISOString() },
    });
    return response.data.data.map((d: any) => ({
      timestamp: new Date(d.timestamp),
      entries: d.in_count,
      exits: d.out_count,
    }));
  }
}
```

---

## API Contract

### Shops

### `GET /mall/shops`
**Access:** `mall.read`  
**Query:** `?propertyId=&tradeCategory=F%26B&zone=north_wing&isAnchor=false&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "unitId": "uuid",
      "shopNumber": "B1-01",
      "brandName": "KFC",
      "tradeCategory": "F&B",
      "tradeSubcategory": "Fast Food",
      "franchiseGroup": "Yum! Brands",
      "isAnchor": false,
      "shopZone": "basement",
      "areaSqft": 1200,
      "floor": "B1",
      "unit": { "status": "occupied", "unitNumber": "B1-01" },
      "currentLease": {
        "leaseId": "uuid",
        "leaseNumber": "LSE-2025-00010",
        "tenantName": "KFC Operators Pte Ltd",
        "endDate": "2027-06-30",
        "baseRent": 8500,
        "hasPercentageRent": true,
        "percentageRentRate": 0.08
      }
    }
  ]
}
```

### `POST /mall/shops/:unitId/profile`
**Access:** `mall.manage`

```json
{
  "shopNumber": "B1-01",
  "brandName": "KFC",
  "tradeCategory": "F&B",
  "tradeSubcategory": "Fast Food",
  "franchiseGroup": "Yum! Brands",
  "isAnchor": false,
  "shopZone": "basement",
  "shopfrontWidthM": 8.5,
  "posSystem": "revel",
  "posStoreId": "KFC-SG-001"
}
```

### `GET /mall/tenant-mix`
**Access:** `mall.read`  
**Query:** `?propertyId=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalShops": 120,
    "totalGlaSqft": 185000,
    "occupancyRate": 92.5,
    "byCategory": [
      { "category": "F&B", "shopCount": 35, "glaSqft": 52000, "pct": 28.1 },
      { "category": "Fashion", "shopCount": 28, "glaSqft": 42000, "pct": 22.7 },
      { "category": "Electronics", "shopCount": 12, "glaSqft": 38000, "pct": 20.5 }
    ],
    "anchorTenants": [
      { "brandName": "NTUC FairPrice", "glaSqft": 18000, "zone": "basement" }
    ]
  }
}
```

---

### Commercial Lease

### `GET /mall/commercial-leases/:leaseId`
**Access:** `mall.read`

### `PUT /mall/commercial-leases/:leaseId`
**Access:** `mall.manage`

```json
{
  "fitOutStartDate": "2025-01-15",
  "fitOutEndDate": "2025-02-14",
  "fitOutRentFree": true,
  "fitOutAllowance": 25000,
  "hasPercentageRent": true,
  "percentageRentRate": 0.08,
  "percentageRentType": "natural",
  "gtoReportingDay": 15,
  "camIncluded": true,
  "camCapPct": 0.05,
  "marketingLevyPct": 0.01,
  "turnoverReportingRequired": true,
  "exclusivityCategory": "Fast Food",
  "exclusivityRadiusKm": 0.5
}
```

---

### GTO

### `POST /mall/gto`
**Access:** `mall.gto_submit` or tenant portal

```json
{
  "leaseId": "uuid",
  "submissionMonth": 1,
  "submissionYear": 2025,
  "grossTurnover": 185000,
  "cashSales": 45000,
  "cardSales": 125000,
  "onlineSales": 15000,
  "currency": "SGD",
  "notes": "January sales including Chinese New Year peak week"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "grossTurnover": 185000,
    "baseRent": 8500,
    "naturalBreakpoint": 106250,
    "gtoAboveBreakpoint": 78750,
    "percentageRent": 6300,
    "totalRentDue": 14800,
    "percentageRentInvoiceId": "uuid",
    "submittedAt": "2025-02-15T09:00:00Z"
  }
}
```

### `GET /mall/gto`
**Access:** `mall.read`  
**Query:** `?propertyId=&leaseId=&month=1&year=2025&verified=false`

### `POST /mall/gto/:id/verify`
**Access:** `mall.gto_verify`

```json
{ "verified": true, "variancePct": -2.3, "notes": "Verified against POS extract" }
```

### `GET /mall/gto/summary`
**Access:** `mall.read`  
**Query:** `?propertyId=&year=2025&month=1`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "month": 1, "year": 2025,
    "totalShopsRequired": 42,
    "submitted": 38,
    "pending": 4,
    "totalGto": 8250000,
    "totalBaseRent": 485000,
    "totalPercentageRent": 148200,
    "totalRent": 633200,
    "avgSalesDensity": 44.6
  }
}
```

---

### CAM

### `GET /mall/cam/pools`
**Query:** `?propertyId=&year=2025`

### `POST /mall/cam/pools`

```json
{
  "propertyId": "uuid",
  "name": "Controllable CAM",
  "poolType": "controllable",
  "allocationBasis": "gla",
  "costCategories": ["cleaning", "security", "landscaping", "utilities"],
  "year": 2025,
  "budgetedAmount": 2400000
}
```

### `POST /mall/cam/billing/generate`
**Access:** `mall.manage`

```json
{ "propertyId": "uuid", "month": 1, "year": 2025 }
```

### `GET /mall/cam/billing`
**Query:** `?propertyId=&month=&year=&unitId=`

### `POST /mall/cam/reconciliation/run`
**Access:** `mall.manage`

```json
{ "propertyId": "uuid", "year": 2024 }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "poolName": "Controllable CAM",
    "totalBudgeted": 2400000,
    "totalActual": 2285000,
    "totalEstimatedBilled": 2350000,
    "tenantReconciliations": [
      {
        "unitId": "uuid",
        "shopNumber": "B1-01",
        "tenantName": "KFC Operators",
        "totalEstimated": 28200,
        "totalActual": 27420,
        "variance": -780,
        "action": "credit_note",
        "invoiceId": "uuid"
      }
    ]
  }
}
```

---

### Events & Booths

### `GET /mall/events`
**Query:** `?propertyId=&from=&to=&status=active`

### `POST /mall/events`

```json
{
  "propertyId": "uuid",
  "title": "Mid-Year Fashion Sale 2025",
  "eventType": "sale",
  "category": "fashion",
  "startDate": "2025-06-01",
  "endDate": "2025-06-30",
  "venue": "Atrium Level 1",
  "estimatedFootfall": 50000,
  "budget": 85000
}
```

### `GET /mall/events/:id/booths`
### `POST /mall/events/:id/booths`

```json
{
  "boothNumber": "ATR-01",
  "boothLocation": "Atrium Centre, North",
  "sizeSqft": 150,
  "tenantId": "uuid",
  "brandName": "New Brand X",
  "startDate": "2025-06-01",
  "endDate": "2025-06-15",
  "dailyRate": 250,
  "deposit": 1000
}
```

---

### Footfall

### `GET /mall/footfall/sensors`
### `POST /mall/footfall/sensors`

```json
{
  "propertyId": "uuid",
  "sensorId": "AXIS-CAM-001",
  "name": "Main Entrance Counter",
  "location": "Ground Floor Main Entrance",
  "zone": "main_entrance",
  "floor": "G",
  "vendor": "axis",
  "apiEndpoint": "https://192.168.1.100",
  "apiKey": "raw-api-key"
}
```

### `GET /mall/footfall/daily`
**Query:** `?propertyId=&date=2025-01-15&zone=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "date": "2025-01-15",
    "totalEntries": 28450,
    "totalExits": 27820,
    "peakHour": "14:00",
    "peakHourCount": 3240,
    "byHour": [
      { "hour": "10:00", "entries": 850, "exits": 320, "cumulative": 850 },
      { "hour": "11:00", "entries": 1420, "exits": 780, "cumulative": 2270 },
      { "hour": "12:00", "entries": 2850, "exits": 1920, "cumulative": 5120 }
    ],
    "byZone": [
      { "zone": "main_entrance", "entries": 12500 },
      { "zone": "basement", "entries": 8200 },
      { "zone": "north_wing", "entries": 4800 }
    ]
  }
}
```

### `GET /mall/footfall/trend`
**Query:** `?propertyId=&from=2025-01-01&to=2025-01-31&groupBy=day`

### `GET /mall/footfall/heatmap`
**Query:** `?propertyId=&date=2025-01-15&hour=14`

Returns zone-level occupancy data for heatmap visualization.

### `POST /mall/footfall/sync`
**Access:** `mall.admin`  
Manually trigger sensor sync for a property.

---

## Business Logic & Validation Rules

```
Percentage rent — natural breakpoint:
  breakpoint = base_rent / percentage_rent_rate
  Example: base_rent=8500, rate=8%
    breakpoint = 8500 / 0.08 = 106,250
    If GTO = 185,000:
      gto_above = 185,000 - 106,250 = 78,750
      pct_rent = 78,750 × 0.08 = 6,300
      total_rent = 8,500 + 6,300 = 14,800

Percentage rent — artificial breakpoint:
  Breakpoint set by negotiation, not formula
  Useful for anchor tenants with different structures

GTO verification:
  If pos_store_id exists: auto-fetch POS sales for same period
  Calculate variance = (submitted_GTO - POS_GTO) / POS_GTO × 100
  If |variance| > 5%: flag for manual review, notify leasing manager
  POS integration: Lightspeed, Square, Revel via REST APIs

Fit-out period billing:
  During fit_out_start_date → fit_out_end_date:
    If fit_out_rent_free = TRUE: billing schedule paused
    If fit_out_allowance > 0: credit note or direct payment to tenant
  After fit_out_end_date: normal billing resumes

CAM cap:
  If commercial_leases.cam_cap_pct is set:
    max_increase = prior_year_cam × cam_cap_pct
    capped_amount = MIN(calculated_amount, prior_year_cam + max_increase)
  Applies per tenant per pool per year

CAM reconciliation timing:
  Runs after fiscal year close (fiscal_year_start month)
  Requires all actual CAM costs entered for the full year
  Creates debit notes (tenant under-billed) or credit notes (over-billed)
  Credit notes applied to next month's rent automatically

Marketing levy:
  marketing_levy_amount = base_rent × marketing_levy_pct (or fixed amount)
  Added as line item to monthly rent invoice via billing schedule

Exclusivity enforcement:
  Anchor exclusivity_category stored but enforcement is manual/legal
  System flags new lease applications in same category within radius (warning only)
```

---

## UI Screens & Component Breakdown

```
admin/mall/
├── MallDashboard/
│   └── components/
│       ├── TenantMixDonut.tsx          # by trade category
│       ├── GtoSummaryCard.tsx          # total GTO + pct rent this month
│       ├── FootfallTodayCard.tsx       # live count + vs last week
│       ├── CamStatusCard.tsx           # current month CAM status
│       └── UpcomingEventsWidget.tsx

├── ShopDirectoryPage/
│   └── components/
│       ├── ShopGrid.tsx                # visual floor plan grid by zone
│       ├── ShopCard.tsx                # logo + brand + category + rent
│       ├── ShopDetailDrawer.tsx        # profile + lease + GTO history
│       └── TenantMixCharts.tsx

├── GtoManagementPage/
│   └── components/
│       ├── GtoSubmissionTable.tsx      # month | shop | GTO | base rent | pct rent | status
│       ├── GtoSummaryRow.tsx
│       ├── VerifyGtoModal.tsx
│       ├── GtoPosVarianceBadge.tsx     # green/red variance indicator
│       └── PendingSubmissionsAlert.tsx

├── CamManagementPage/
│   └── tabs/
│       ├── CamPoolsTab/
│       │   ├── CamPoolCard.tsx         # name + budget + actual + variance %
│       │   └── CreatePoolModal.tsx
│       ├── CamBillingTab/
│       │   ├── CamBillingTable.tsx     # unit | allocated | invoice status
│       │   └── GenerateBillingButton.tsx
│       └── ReconciliationTab/
│           ├── ReconciliationTable.tsx
│           └── RunReconciliationModal.tsx

├── EventsCalendarPage/
│   └── components/
│       ├── EventCalendar.tsx           # FullCalendar with event bars
│       ├── EventCard.tsx
│       ├── CreateEventModal.tsx
│       └── BoothRentalManager.tsx      # booth grid for an event

└── FootfallAnalyticsPage/
    └── components/
        ├── FootfallTrendChart.tsx      # daily/weekly line chart
        ├── HourlyBarChart.tsx          # hour-by-hour bar chart
        ├── ZoneHeatmap.tsx             # SVG property map with color intensity
        ├── PeakHoursTable.tsx
        └── FootfallVsSalesChart.tsx    # GTO vs footfall correlation
```

---

## State Management

```typescript
export const mallApi = createApi({
  reducerPath: 'mallApi',
  tagTypes: ['Shops', 'GtoSubmissions', 'CamPools', 'CamBillings', 'Events', 'Footfall'],
  endpoints: (builder) => ({
    getShops: builder.query<PaginatedResponse<ShopProfile>, ShopQueryParams>({
      query: (p) => ({ url: '/mall/shops', params: p }),
      providesTags: ['Shops'],
    }),
    getTenantMix: builder.query<TenantMix, { propertyId: string }>({
      query: ({ propertyId }) => ({ url: '/mall/tenant-mix', params: { propertyId } }),
    }),
    submitGto: builder.mutation<GtoSubmission, SubmitGtoDto>({
      query: (body) => ({ url: '/mall/gto', method: 'POST', body }),
      invalidatesTags: ['GtoSubmissions'],
    }),
    getGtoSubmissions: builder.query<PaginatedResponse<GtoSubmission>, GtoQueryParams>({
      query: (p) => ({ url: '/mall/gto', params: p }),
      providesTags: ['GtoSubmissions'],
    }),
    verifyGto: builder.mutation<void, { id: string; verified: boolean; variancePct?: number; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/mall/gto/${id}/verify`, method: 'POST', body }),
      invalidatesTags: ['GtoSubmissions'],
    }),
    getCamPools: builder.query<CamCostPool[], { propertyId: string; year: number }>({
      query: (p) => ({ url: '/mall/cam/pools', params: p }),
      providesTags: ['CamPools'],
    }),
    generateCamBilling: builder.mutation<void, { propertyId: string; month: number; year: number }>({
      query: (body) => ({ url: '/mall/cam/billing/generate', method: 'POST', body }),
      invalidatesTags: ['CamBillings'],
    }),
    runCamReconciliation: builder.mutation<CamReconciliationResult, { propertyId: string; year: number }>({
      query: (body) => ({ url: '/mall/cam/reconciliation/run', method: 'POST', body }),
      invalidatesTags: ['CamBillings'],
    }),
    getMallEvents: builder.query<PaginatedResponse<MallEvent>, EventQueryParams>({
      query: (p) => ({ url: '/mall/events', params: p }),
      providesTags: ['Events'],
    }),
    createMallEvent: builder.mutation<MallEvent, CreateMallEventDto>({
      query: (body) => ({ url: '/mall/events', method: 'POST', body }),
      invalidatesTags: ['Events'],
    }),
    getFootfallDaily: builder.query<FootfallDailyData, { propertyId: string; date: string }>({
      query: (p) => ({ url: '/mall/footfall/daily', params: p }),
      providesTags: ['Footfall'],
    }),
    getFootfallTrend: builder.query<FootfallTrendData, FootfallTrendParams>({
      query: (p) => ({ url: '/mall/footfall/trend', params: p }),
      providesTags: ['Footfall'],
    }),
    getFootfallHeatmap: builder.query<FootfallHeatmapData, { propertyId: string; date: string; hour: number }>({
      query: (p) => ({ url: '/mall/footfall/heatmap', params: p }),
    }),
  }),
});
```
