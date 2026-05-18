# Module 3.1 — Billing Engine

**Phase:** 3 — Billing & Financial Management  
**Stack:** NestJS · PostgreSQL · Redis · Bull Queue · React 18 · Redux Toolkit  
**Estimated Effort:** 3 weeks (2.5 backend, 0.5 frontend)  
**Depends On:** Module 2.4 (Lease Management), 2.6 (Parking), 1.4 (Workflow), 1.5 (Notifications)

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

The central billing engine generates all recurring and one-off charges: rent, utilities, service charges, parking fees, penalties, and ad-hoc adjustments. It creates invoices, manages billing schedules, calculates late payment penalties, and feeds the Accounts Receivable module.

**Key capabilities:**
- Automatic invoice generation from lease charge schedules (Bull queue, daily job)
- Multiple charge types per invoice (rent, service charge, utility, parking, misc)
- Prorated billing for partial periods (move-in mid-month)
- Late payment penalty calculation (fixed/percentage-per-day, grace period)
- Credit notes and manual adjustments with approval workflow
- Recurring billing schedule management (start/pause/cancel)
- Utility billing from meter readings
- Tax calculation (GST/VAT configurable per company)

---

## DB Schema

```sql
-- Charge types catalog (seeded)
CREATE TABLE charge_types (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID REFERENCES companies(id),    -- NULL = system charge type
  code         VARCHAR(50) NOT NULL,
  name         VARCHAR(150) NOT NULL,
  category     VARCHAR(30) NOT NULL,             -- 'rent' | 'utility' | 'service' | 'parking' | 'penalty' | 'deposit' | 'misc'
  gl_account_code VARCHAR(20),                   -- linked GL account (Phase 3.4)
  is_taxable   BOOLEAN NOT NULL DEFAULT FALSE,
  tax_rate     NUMERIC(5,4) DEFAULT 0,           -- e.g. 0.09 = 9% GST
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_charge_type_code UNIQUE (code, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
-- Seeds: RENT, SERVICE_CHARGE, ELECTRICITY, WATER, GAS, CHILLED_WATER,
--        PARKING_MONTHLY, PARKING_HOURLY, LATE_PAYMENT_PENALTY, SECURITY_DEPOSIT,
--        ADMIN_FEE, LEGAL_FEE, REPAIR_CHARGE, MISC

-- Billing schedules (one per recurring charge, e.g. one per lease)
CREATE TABLE billing_schedules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id),
  unit_id           UUID REFERENCES units(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  lease_id          UUID REFERENCES leases(id),
  charge_type_id    UUID NOT NULL REFERENCES charge_types(id),
  description       VARCHAR(500),
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle     VARCHAR(20) NOT NULL DEFAULT 'monthly',
                    -- 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time'
  billing_day       SMALLINT NOT NULL DEFAULT 1,   -- day of month invoice generated
  payment_due_days  SMALLINT NOT NULL DEFAULT 7,
  start_date        DATE NOT NULL,
  end_date          DATE,                          -- null = open-ended
  next_billing_date DATE,                          -- computed; updated after each invoice run
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
                    -- 'active' | 'paused' | 'cancelled' | 'completed'
  last_invoiced_at  TIMESTAMPTZ,
  invoice_count     INTEGER DEFAULT 0,
  is_prorated       BOOLEAN NOT NULL DEFAULT FALSE, -- whether first invoice was prorated
  prorate_start     DATE,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_schedules_next_date ON billing_schedules(next_billing_date)
  WHERE status = 'active';
CREATE INDEX idx_billing_schedules_tenant ON billing_schedules(tenant_id);
CREATE INDEX idx_billing_schedules_lease ON billing_schedules(lease_id);

-- Invoices
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id),
  unit_id           UUID REFERENCES units(id),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  lease_id          UUID REFERENCES leases(id),
  invoice_number    VARCHAR(50) NOT NULL UNIQUE,  -- INV-2025-00001
  invoice_type      VARCHAR(20) NOT NULL DEFAULT 'invoice',
                    -- 'invoice' | 'credit_note' | 'debit_note' | 'proforma'
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- 'draft' | 'issued' | 'sent' | 'partially_paid' | 'paid'
                    -- | 'overdue' | 'void' | 'disputed'
  invoice_date      DATE NOT NULL,
  due_date          DATE NOT NULL,
  period_from       DATE,
  period_to         DATE,
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_amount NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  -- Penalty tracking
  penalty_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_applied_at TIMESTAMPTZ,
  grace_period_days SMALLINT DEFAULT 0,
  -- Credit note reference
  original_invoice_id UUID REFERENCES invoices(id),
  credit_reason     TEXT,
  -- Metadata
  notes             TEXT,
  pdf_url           VARCHAR(500),
  sent_at           TIMESTAMPTZ,
  voided_at         TIMESTAMPTZ,
  voided_by         UUID REFERENCES users(id),
  void_reason       TEXT,
  workflow_instance_id UUID,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_lease ON invoices(lease_id);
CREATE INDEX idx_invoices_status ON invoices(status, due_date);
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE status IN ('issued', 'sent', 'partially_paid');
CREATE INDEX idx_invoices_company ON invoices(company_id);

-- Invoice line items
CREATE TABLE invoice_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  charge_type_id  UUID NOT NULL REFERENCES charge_types(id),
  description     VARCHAR(500) NOT NULL,
  quantity        NUMERIC(10,4) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(15,4) NOT NULL,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  amount          NUMERIC(15,2) NOT NULL,          -- quantity * unit_price * (1 - discount_pct/100)
  tax_rate        NUMERIC(5,4) DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(15,2) NOT NULL,          -- amount + tax_amount
  period_from     DATE,
  period_to       DATE,
  meter_reading_id UUID,                           -- linked if utility line
  sort_order      SMALLINT DEFAULT 0
);

-- Penalty configuration per company/property
CREATE TABLE penalty_configurations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id      UUID REFERENCES properties(id),  -- null = company-wide default
  charge_type_id   UUID REFERENCES charge_types(id), -- null = applies to all
  grace_period_days SMALLINT NOT NULL DEFAULT 7,
  penalty_type     VARCHAR(20) NOT NULL DEFAULT 'percentage',
                   -- 'percentage' | 'fixed_amount' | 'percentage_per_day' | 'tiered'
  penalty_value    NUMERIC(10,4) NOT NULL,          -- % or amount
  max_penalty_pct  NUMERIC(5,2),                    -- cap: % of original invoice
  compound         BOOLEAN NOT NULL DEFAULT FALSE,  -- compound vs simple interest
  tiered_config    JSONB,                           -- [{ dayFrom: 1, dayTo: 30, rate: 0.01 }, ...]
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tax configurations
CREATE TABLE tax_configurations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tax_name     VARCHAR(50) NOT NULL,              -- 'GST' | 'VAT' | 'SST'
  tax_rate     NUMERIC(5,4) NOT NULL,             -- 0.09 = 9%
  applies_to   TEXT[] DEFAULT '{}',               -- charge_type codes; empty = all taxable
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate invoice number trigger
CREATE SEQUENCE invoice_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(nextval('invoice_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
EXECUTE FUNCTION generate_invoice_number();
```

---

## Server-Side Architecture

```
src/modules/billing/
├── billing.module.ts
├── billing-engine.service.ts          # core: schedule → invoice generation
├── invoices.controller.ts
├── invoices.service.ts
├── invoice-lines.service.ts
├── billing-schedules.controller.ts
├── billing-schedules.service.ts
├── penalty.service.ts
├── tax.service.ts
├── pdf.service.ts                     # Puppeteer invoice PDF generation
├── queues/
│   ├── daily-billing.processor.ts     # runs daily, generates due invoices
│   ├── penalty-check.processor.ts     # checks overdue invoices, applies penalties
│   └── invoice-pdf.processor.ts       # async PDF generation
├── dto/
│   ├── create-billing-schedule.dto.ts
│   ├── create-invoice.dto.ts
│   ├── create-invoice-line.dto.ts
│   ├── create-credit-note.dto.ts
│   ├── void-invoice.dto.ts
│   ├── penalty-config.dto.ts
│   └── tax-config.dto.ts
└── entities/ (as above)
```

### Billing Engine Service

```typescript
// src/modules/billing/billing-engine.service.ts
@Injectable()
export class BillingEngineService {
  constructor(
    @InjectRepository(BillingSchedule) private scheduleRepo: Repository<BillingSchedule>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLine) private lineRepo: Repository<InvoiceLine>,
    private taxService: TaxService,
    private pdfService: PdfService,
    private notificationsService: NotificationsService,
    @InjectQueue('billing') private billingQueue: Queue,
  ) {}

  /**
   * Called by LeaseService.activate() — sets up all recurring charge schedules.
   */
  async createLeaseChargeSchedules(lease: Lease): Promise<BillingSchedule[]> {
    const schedules: Partial<BillingSchedule>[] = [];
    const today = new Date();
    const startDate = new Date(lease.startDate);

    // 1. Rent schedule
    const isProrated = startDate.getDate() !== lease.billingDay;
    schedules.push({
      companyId: lease.companyId,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      leaseId: lease.id,
      chargeTypeId: await this.getChargeTypeId('RENT', lease.companyId),
      description: `Rent — Unit ${lease.unit.unitNumber}`,
      amount: lease.rentAmount,
      currency: lease.currency,
      billingCycle: lease.billingCycle,
      billingDay: lease.billingDay,
      paymentDueDays: lease.paymentDueDays,
      startDate: lease.startDate,
      endDate: lease.endDate,
      nextBillingDate: this.computeNextBillingDate(startDate, lease.billingDay, lease.billingCycle),
      isProrated,
      prorateStart: isProrated ? startDate : null,
      status: 'active',
    });

    // 2. Service charge schedule (if property has default service charge)
    const serviceChargeAmount = lease.unit.property.settings?.defaultServiceCharge as number | undefined;
    if (serviceChargeAmount) {
      schedules.push({
        ...schedules[0],
        chargeTypeId: await this.getChargeTypeId('SERVICE_CHARGE', lease.companyId),
        description: `Service Charge — Unit ${lease.unit.unitNumber}`,
        amount: serviceChargeAmount,
        isProrated: false,
      });
    }

    const saved = await this.scheduleRepo.save(schedules);
    return saved;
  }

  /**
   * Daily Bull job entry point — generates invoices for all schedules due today.
   */
  @Cron('0 2 * * *')  // 2 AM daily
  async runDailyBillingJob(): Promise<void> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const dueSchedules = await this.scheduleRepo.find({
      where: {
        nextBillingDate: LessThanOrEqual(todayStr),
        status: 'active',
      },
      relations: ['tenant', 'unit', 'unit.property', 'chargeType'],
      take: 1000,  // process in batches
    });

    for (const schedule of dueSchedules) {
      await this.billingQueue.add('generate-invoice', { scheduleId: schedule.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
      });
    }
  }

  /**
   * Generates one invoice for a given schedule.
   * Handles proration for first invoice of a lease.
   */
  async generateInvoiceForSchedule(scheduleId: string): Promise<Invoice> {
    const schedule = await this.scheduleRepo.findOneOrFail({
      where: { id: scheduleId },
      relations: ['tenant', 'chargeType', 'lease'],
    });

    const periodFrom = schedule.nextBillingDate;
    const periodTo = this.computePeriodEnd(periodFrom, schedule.billingCycle);
    let amount = schedule.amount;

    // Prorate first invoice if start_date is mid-period
    if (schedule.isProrated && !schedule.lastInvoicedAt && schedule.prorateStart) {
      amount = this.calculateProratedAmount(
        schedule.amount, schedule.prorateStart, periodTo, schedule.billingCycle,
      );
    }

    const invoiceDate = new Date();
    const dueDate = addDays(invoiceDate, schedule.paymentDueDays);

    // Calculate tax
    const taxRate = await this.taxService.getApplicableRate(
      schedule.companyId, schedule.chargeType.code, invoiceDate,
    );
    const taxAmount = amount * taxRate;

    const invoice = await this.invoiceRepo.save({
      companyId: schedule.companyId,
      propertyId: schedule.propertyId,
      unitId: schedule.unitId,
      tenantId: schedule.tenantId,
      leaseId: schedule.leaseId,
      invoiceType: 'invoice',
      status: 'issued',
      invoiceDate: invoiceDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      periodFrom,
      periodTo,
      subtotal: amount,
      taxAmount,
      totalAmount: amount + taxAmount,
      paidAmount: 0,
      currency: schedule.currency,
      gracePeriodDays: await this.getGracePeriod(schedule.companyId, schedule.propertyId),
    });

    await this.lineRepo.save({
      invoiceId: invoice.id,
      chargeTypeId: schedule.chargeTypeId,
      description: schedule.description ?? schedule.chargeType.name,
      quantity: 1,
      unitPrice: amount,
      amount,
      taxRate,
      taxAmount,
      lineTotal: amount + taxAmount,
      periodFrom,
      periodTo,
      sortOrder: 0,
    });

    // Advance next billing date
    const nextDate = this.computeNextBillingDate(
      new Date(periodTo), schedule.billingDay, schedule.billingCycle,
    );
    await this.scheduleRepo.update(scheduleId, {
      nextBillingDate: nextDate,
      lastInvoicedAt: new Date(),
      invoiceCount: () => 'invoice_count + 1',
      isProrated: false,  // clear proration flag after first invoice
    });

    // Queue PDF generation
    await this.billingQueue.add('generate-pdf', { invoiceId: invoice.id });

    // Send notification
    await this.notificationsService.send({
      templateCode: 'invoice_issued',
      companyId: schedule.companyId,
      recipientIds: [schedule.tenantId],
      channels: ['email', 'in_app'],
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        periodFrom,
        periodTo,
      },
      entityType: 'invoice',
      entityId: invoice.id,
    });

    return invoice;
  }

  private calculateProratedAmount(
    monthlyAmount: number,
    prorateFrom: Date,
    periodEnd: Date,
    billingCycle: string,
  ): number {
    if (billingCycle !== 'monthly') return monthlyAmount;
    const daysInMonth = new Date(prorateFrom.getFullYear(), prorateFrom.getMonth() + 1, 0).getDate();
    const daysInPeriod = Math.ceil((periodEnd.getTime() - prorateFrom.getTime()) / 86400000) + 1;
    return Math.round((monthlyAmount / daysInMonth) * daysInPeriod * 100) / 100;
  }

  private computeNextBillingDate(from: Date, billingDay: number, cycle: string): string {
    let next = new Date(from);
    switch (cycle) {
      case 'monthly':    next = addMonths(next, 1); break;
      case 'quarterly':  next = addMonths(next, 3); break;
      case 'semi_annual': next = addMonths(next, 6); break;
      case 'annual':     next = addMonths(next, 12); break;
    }
    next.setDate(Math.min(billingDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return next.toISOString().split('T')[0];
  }
}

// src/modules/billing/penalty.service.ts
@Injectable()
export class PenaltyService {
  @Cron('0 3 * * *')  // 3 AM daily
  async checkAndApplyPenalties(): Promise<void> {
    const today = new Date();
    const overdueInvoices = await this.invoiceRepo
      .createQueryBuilder('i')
      .where("i.status IN ('issued', 'sent', 'partially_paid')")
      .andWhere('i.due_date + i.grace_period_days < :today', { today: today.toISOString().split('T')[0] })
      .andWhere('i.penalty_applied_at IS NULL')
      .andWhere('i.invoice_type = :type', { type: 'invoice' })
      .getMany();

    for (const invoice of overdueInvoices) {
      await this.applyPenalty(invoice);
    }
  }

  async applyPenalty(invoice: Invoice): Promise<void> {
    const config = await this.getPenaltyConfig(invoice.companyId, invoice.propertyId);
    if (!config) return;

    const daysOverdue = Math.ceil(
      (new Date().getTime() - new Date(invoice.dueDate).getTime()) / 86400000,
    ) - invoice.gracePeriodDays;

    let penaltyAmount = 0;
    const base = invoice.subtotal;  // penalty on pre-tax amount

    switch (config.penaltyType) {
      case 'fixed_amount':
        penaltyAmount = Number(config.penaltyValue);
        break;
      case 'percentage':
        penaltyAmount = base * (Number(config.penaltyValue) / 100);
        break;
      case 'percentage_per_day':
        penaltyAmount = config.compound
          ? base * (Math.pow(1 + Number(config.penaltyValue) / 100, daysOverdue) - 1)
          : base * (Number(config.penaltyValue) / 100) * daysOverdue;
        break;
      case 'tiered':
        penaltyAmount = this.calculateTieredPenalty(base, daysOverdue, config.tieredConfig);
        break;
    }

    // Apply max penalty cap
    if (config.maxPenaltyPct) {
      const maxPenalty = base * (Number(config.maxPenaltyPct) / 100);
      penaltyAmount = Math.min(penaltyAmount, maxPenalty);
    }

    penaltyAmount = Math.round(penaltyAmount * 100) / 100;

    if (penaltyAmount > 0) {
      // Add penalty line to invoice
      await this.lineRepo.save({
        invoiceId: invoice.id,
        chargeTypeId: await this.getChargeTypeId('LATE_PAYMENT_PENALTY'),
        description: `Late payment penalty (${daysOverdue} days overdue)`,
        quantity: 1,
        unitPrice: penaltyAmount,
        amount: penaltyAmount,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: penaltyAmount,
      });

      await this.invoiceRepo.update(invoice.id, {
        penaltyAmount,
        penaltyAppliedAt: new Date(),
        totalAmount: () => `total_amount + ${penaltyAmount}`,
        status: 'overdue',
      });

      await this.notificationsService.send({
        templateCode: 'invoice_overdue_penalty',
        companyId: invoice.companyId,
        recipientIds: [invoice.tenantId],
        channels: ['email', 'in_app'],
        variables: { invoiceNumber: invoice.invoiceNumber, penaltyAmount, daysOverdue },
      });
    }
  }
}

// src/modules/billing/pdf.service.ts
@Injectable()
export class InvoicePdfService {
  async generateInvoicePdf(invoiceId: string): Promise<string> {
    const invoice = await this.invoiceRepo.findOneOrFail({
      where: { id: invoiceId },
      relations: ['lines', 'lines.chargeType', 'tenant', 'unit', 'unit.property', 'company'],
    });

    const html = await this.renderInvoiceHtml(invoice);
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    await browser.close();

    const storageKey = `${invoice.companyId}/invoices/${invoice.id}.pdf`;
    await this.storageService.putObject(storageKey, Buffer.from(pdf), 'application/pdf');
    const pdfUrl = await this.storageService.getPreviewPresignedUrl(storageKey, 'application/pdf');

    await this.invoiceRepo.update(invoiceId, { pdfUrl: storageKey });
    return pdfUrl;
  }
}
```

---

## API Contract

### `GET /billing/schedules`
**Access:** `billing.read`  
**Query:** `?leaseId=&tenantId=&status=active&propertyId=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "chargeType": { "code": "RENT", "name": "Rent", "category": "rent" },
      "description": "Rent — Unit 1201",
      "amount": 3500,
      "currency": "SGD",
      "billingCycle": "monthly",
      "billingDay": 1,
      "nextBillingDate": "2025-02-01",
      "startDate": "2025-02-01",
      "endDate": "2027-01-31",
      "status": "active",
      "invoiceCount": 0,
      "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming" },
      "unit": { "id": "uuid", "unitNumber": "1201" }
    }
  ],
  "meta": { "total": 2, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### `POST /billing/schedules`
**Access:** `billing.create`

```json
{
  "propertyId": "uuid",
  "unitId": "uuid",
  "tenantId": "uuid",
  "leaseId": "uuid",
  "chargeTypeId": "uuid",
  "description": "Monthly Service Charge",
  "amount": 200,
  "currency": "SGD",
  "billingCycle": "monthly",
  "billingDay": 1,
  "paymentDueDays": 7,
  "startDate": "2025-02-01",
  "endDate": "2027-01-31"
}
```

### `PUT /billing/schedules/:id`
**Access:** `billing.update`

### `POST /billing/schedules/:id/pause`
### `POST /billing/schedules/:id/resume`
### `POST /billing/schedules/:id/cancel`

---

### `GET /invoices`
**Access:** `billing.read`  
**Query:** `?tenantId=&leaseId=&propertyId=&status=issued&from=&to=&page=1&limit=20&sort=dueDate&order=asc`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-2025-00042",
      "invoiceType": "invoice",
      "status": "issued",
      "invoiceDate": "2025-02-01",
      "dueDate": "2025-02-08",
      "periodFrom": "2025-02-01",
      "periodTo": "2025-02-28",
      "subtotal": 3500,
      "taxAmount": 315,
      "totalAmount": 3815,
      "paidAmount": 0,
      "outstandingAmount": 3815,
      "currency": "SGD",
      "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming" },
      "unit": { "id": "uuid", "unitNumber": "1201" },
      "property": { "id": "uuid", "name": "Acme Tower A" }
    }
  ],
  "meta": { "total": 168, "page": 1, "limit": 20, "totalPages": 9 }
}
```

---

### `POST /invoices`
**Access:** `billing.create`  
Manual invoice creation (for ad-hoc charges).

```json
{
  "propertyId": "uuid",
  "unitId": "uuid",
  "tenantId": "uuid",
  "leaseId": "uuid",
  "invoiceDate": "2025-01-20",
  "dueDate": "2025-01-27",
  "periodFrom": "2025-01-01",
  "periodTo": "2025-01-31",
  "currency": "SGD",
  "lines": [
    {
      "chargeTypeId": "uuid",
      "description": "Air conditioning repair — Unit 1201",
      "quantity": 1,
      "unitPrice": 450,
      "taxRate": 0.09
    }
  ],
  "notes": "Approved by property manager on 2025-01-18"
}
```

---

### `GET /invoices/:id`
**Access:** `billing.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV-2025-00042",
    "invoiceType": "invoice",
    "status": "issued",
    "invoiceDate": "2025-02-01",
    "dueDate": "2025-02-08",
    "periodFrom": "2025-02-01",
    "periodTo": "2025-02-28",
    "subtotal": 3500,
    "taxAmount": 315,
    "totalAmount": 3815,
    "paidAmount": 0,
    "outstandingAmount": 3815,
    "penaltyAmount": 0,
    "currency": "SGD",
    "lines": [
      {
        "chargeType": { "code": "RENT", "name": "Rent" },
        "description": "Rent — Unit 1201 (Feb 2025)",
        "quantity": 1,
        "unitPrice": 3500,
        "taxRate": 0.09,
        "taxAmount": 315,
        "lineTotal": 3815,
        "periodFrom": "2025-02-01",
        "periodTo": "2025-02-28"
      }
    ],
    "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming", "email": "john@email.com" },
    "unit": { "id": "uuid", "unitNumber": "1201" },
    "property": { "id": "uuid", "name": "Acme Tower A" },
    "createdAt": "2025-02-01T02:00:00Z"
  }
}
```

---

### `GET /invoices/:id/pdf`
**Access:** `billing.read`

**Response 200:**
```json
{ "success": true, "data": { "url": "https://s3.amazonaws.com/...", "expiresIn": 3600 } }
```

---

### `POST /invoices/:id/send`
**Access:** `billing.send`  
Emails invoice PDF to tenant.

---

### `POST /invoices/:id/void`
**Access:** `billing.void`

```json
{ "reason": "Duplicate invoice generated by error." }
```

---

### `POST /invoices/:id/credit-note`
**Access:** `billing.credit_note`

```json
{
  "creditReason": "Rent adjustment per lease amendment dated 2025-01-20",
  "lines": [
    {
      "chargeTypeId": "uuid",
      "description": "Rent credit — overpayment Jan 2025",
      "quantity": 1,
      "unitPrice": 200,
      "taxRate": 0.09
    }
  ]
}
```

**Response 201:** New credit note invoice with `invoiceType: 'credit_note'`

---

### `POST /billing/run`
**Access:** `billing.admin`  
Manually trigger the daily billing job (for testing/backfill).

```json
{ "asOfDate": "2025-02-01", "propertyId": "uuid" }
```

---

### `GET /billing/charge-types`
**Access:** Authenticated

### `GET /billing/penalty-configs`
### `POST /billing/penalty-configs`

```json
{
  "propertyId": "uuid",
  "gracePeriodDays": 7,
  "penaltyType": "percentage_per_day",
  "penaltyValue": 0.1,
  "maxPenaltyPct": 10,
  "compound": false
}
```

### `GET /billing/tax-configs`
### `POST /billing/tax-configs`

```json
{
  "taxName": "GST",
  "taxRate": 0.09,
  "appliesTo": ["RENT", "SERVICE_CHARGE", "PARKING_MONTHLY"],
  "effectiveFrom": "2024-01-01"
}
```

---

## Business Logic & Validation Rules

```
Invoice generation timing:
  Daily job runs at 2 AM. Queries schedules where:
    next_billing_date <= TODAY AND status = 'active'
  Each invoice generated in its own Bull job with retries.
  Idempotency: before generating, check if invoice already exists for
    (schedule.leaseId, period_from) to prevent duplicates.

Proration calculation:
  Only applies to first invoice if start_date is mid-billing-period.
  Formula: (monthlyRent / daysInMonth) × daysRemainingInPeriod
  daysRemainingInPeriod = (lastDayOfMonth - startDate.day + 1)
  Example: rent=3500, start=Jan 15, billingDay=1
    daysInJan=31, daysRemaining=17
    prorated = (3500/31) × 17 = SGD 1,919.35

Credit note rules:
  Credit note totalAmount must NOT exceed original invoice totalAmount.
  Credit note is linked via original_invoice_id.
  On create: apply credit against original invoice's paid_amount.
  Credit note requires approval workflow if amount > company threshold.

Void rules:
  Can only void invoices with status: 'draft', 'issued', 'sent'.
  Cannot void 'paid', 'partially_paid' invoices (must create credit note instead).
  Void reverses any GL postings (Phase 3.4 hook).

Invoice status transitions:
  draft → issued (on generate)
  issued → sent (on email)
  issued/sent → partially_paid (on partial receipt)
  issued/sent/partially_paid → paid (when paid_amount >= total_amount)
  issued/sent/partially_paid → overdue (after due_date + grace_period)
  overdue → paid (on full payment)
  issued/sent → void (admin action)
  issued/sent/overdue → disputed (tenant dispute)

Tax calculation:
  Look up active tax_configurations for company + charge_type code + invoice_date.
  If multiple configs match: use most specific (property-level > company-level)
  If effective_to < invoice_date: tax rate = 0 (expired config)

Penalty schedule:
  Grace period: clock starts AFTER due_date + grace_period_days
  First run: penalty_applied_at set; subsequent runs check if penalty already applied
  For percentage_per_day: recalculate daily (update penalty line amount)
  Notification: send at day 1, day 7, day 14, day 30 of overdue

Billing schedule end:
  When next_billing_date > end_date: set status = 'completed'
  Cancellation mid-cycle: current period invoice already issued stands;
    no future invoices generated
```

---

## UI Screens & Component Breakdown

```
admin/billing/
├── BillingDashboard/
│   └── components/
│       ├── BillingSummaryCards.tsx     # Issued Today | Overdue | Due This Week | MTD Revenue
│       ├── ScheduledJobStatus.tsx      # last run time + next run + status
│       └── RecentInvoicesTable.tsx

├── InvoiceListPage/
│   ├── InvoiceListPage.tsx
│   └── components/
│       ├── InvoiceTable.tsx
│       │   └── InvoiceTableRow.tsx    # number + tenant + amount + due date + status + actions
│       ├── InvoiceStatusBadge.tsx     # color-coded status chip
│       ├── InvoiceFilters.tsx         # status, property, date range, tenant search
│       ├── BulkActionsBar.tsx         # send selected / export selected
│       └── CreateInvoiceButton.tsx

├── InvoiceDetailPage/
│   ├── InvoiceDetailPage.tsx
│   └── components/
│       ├── InvoiceHeader.tsx          # number + status + amount + actions
│       ├── InvoiceMetaPanel.tsx       # tenant, unit, property, dates, period
│       ├── InvoiceLinesTable.tsx      # charge lines with amounts
│       ├── InvoiceTotalsPanel.tsx     # subtotal + tax + total + paid + outstanding
│       ├── PaymentHistory.tsx         # receipts applied to this invoice
│       ├── PenaltyInfo.tsx            # penalty amount + applied date + days overdue
│       ├── InvoicePdfViewer.tsx       # embedded PDF preview
│       └── InvoiceActions/
│           ├── SendInvoiceButton.tsx
│           ├── VoidInvoiceModal.tsx
│           └── CreditNoteModal.tsx

├── CreateInvoicePage/
│   └── components/
│       ├── InvoiceBasicForm.tsx
│       ├── InvoiceLineEditor.tsx      # dynamic line items table with add/remove
│       └── InvoiceTotalPreview.tsx    # live total calculation

├── BillingSchedulesPage/
│   └── components/
│       ├── ScheduleTable.tsx
│       ├── ScheduleStatusBadge.tsx
│       └── ScheduleActions.tsx        # pause / resume / cancel buttons

└── PenaltyConfigPage/
    └── components/
        ├── PenaltyConfigForm.tsx
        └── PenaltyPreview.tsx          # shows penalty amount for sample overdue amounts
```

---

## State Management

```typescript
export const billingApi = createApi({
  reducerPath: 'billingApi',
  tagTypes: ['Invoices', 'BillingSchedules', 'ChargeTypes', 'PenaltyConfigs', 'TaxConfigs'],
  endpoints: (builder) => ({
    getInvoices: builder.query<PaginatedResponse<InvoiceListItem>, InvoiceQueryParams>({
      query: (params) => ({ url: '/invoices', params }),
      providesTags: ['Invoices'],
    }),
    getInvoice: builder.query<InvoiceDetail, string>({
      query: (id) => `/invoices/${id}`,
      providesTags: (_, __, id) => [{ type: 'Invoices', id }],
    }),
    createInvoice: builder.mutation<Invoice, CreateInvoiceDto>({
      query: (body) => ({ url: '/invoices', method: 'POST', body }),
      invalidatesTags: ['Invoices'],
    }),
    sendInvoice: builder.mutation<void, string>({
      query: (id) => ({ url: `/invoices/${id}/send`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Invoices', id }],
    }),
    voidInvoice: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/invoices/${id}/void`, method: 'POST', body: { reason } }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Invoices', id }, 'Invoices'],
    }),
    createCreditNote: builder.mutation<Invoice, { id: string; data: CreateCreditNoteDto }>({
      query: ({ id, data }) => ({ url: `/invoices/${id}/credit-note`, method: 'POST', body: data }),
      invalidatesTags: ['Invoices'],
    }),
    getInvoicePdf: builder.query<{ url: string }, string>({
      query: (id) => `/invoices/${id}/pdf`,
    }),
    getBillingSchedules: builder.query<PaginatedResponse<BillingSchedule>, BillingScheduleQueryParams>({
      query: (params) => ({ url: '/billing/schedules', params }),
      providesTags: ['BillingSchedules'],
    }),
    pauseSchedule: builder.mutation<void, string>({
      query: (id) => ({ url: `/billing/schedules/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['BillingSchedules'],
    }),
    resumeSchedule: builder.mutation<void, string>({
      query: (id) => ({ url: `/billing/schedules/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['BillingSchedules'],
    }),
    getChargeTypes: builder.query<ChargeType[], void>({
      query: () => '/billing/charge-types',
      providesTags: ['ChargeTypes'],
    }),
    getPenaltyConfigs: builder.query<PenaltyConfig[], void>({
      query: () => '/billing/penalty-configs',
      providesTags: ['PenaltyConfigs'],
    }),
    createPenaltyConfig: builder.mutation<PenaltyConfig, CreatePenaltyConfigDto>({
      query: (body) => ({ url: '/billing/penalty-configs', method: 'POST', body }),
      invalidatesTags: ['PenaltyConfigs'],
    }),
    getTaxConfigs: builder.query<TaxConfig[], void>({
      query: () => '/billing/tax-configs',
      providesTags: ['TaxConfigs'],
    }),
    createTaxConfig: builder.mutation<TaxConfig, CreateTaxConfigDto>({
      query: (body) => ({ url: '/billing/tax-configs', method: 'POST', body }),
      invalidatesTags: ['TaxConfigs'],
    }),
  }),
});
```
