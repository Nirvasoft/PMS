# Module 3.2 — Accounts Receivable

**Phase:** 3 — Billing & Financial Management  
**Stack:** NestJS · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Estimated Effort:** 2 weeks (1.5 backend, 0.5 frontend)  
**Depends On:** Module 3.1 (Billing Engine), 1.4 (Workflow), 1.5 (Notifications)

---

## Overview

Manages the full cash collection cycle: receipting payments, tracking outstanding balances, AR aging analysis, refund processing, and tenant account statements. Integrates with online payment gateways (Phase 3.6) and posts journal entries to the General Ledger (Phase 3.4).

---

## DB Schema

```sql
-- Payment receipts
CREATE TABLE receipts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id        UUID REFERENCES properties(id),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  receipt_number     VARCHAR(50) NOT NULL UNIQUE,    -- RCT-2025-00001
  receipt_date       DATE NOT NULL,
  payment_method     VARCHAR(30) NOT NULL,
                     -- 'bank_transfer' | 'cheque' | 'cash' | 'online' | 'giro' | 'credit_card'
  payment_reference  VARCHAR(255),                   -- cheque no / transfer ref / txn ID
  bank_account_id    UUID REFERENCES bank_accounts(id),
  amount             NUMERIC(15,2) NOT NULL,
  currency           VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate      NUMERIC(12,6) DEFAULT 1,        -- for multi-currency
  base_currency_amount NUMERIC(15,2),                -- amount in company base currency
  status             VARCHAR(20) NOT NULL DEFAULT 'confirmed',
                     -- 'pending' | 'confirmed' | 'reversed' | 'refunded'
  notes              TEXT,
  attachment_url     VARCHAR(500),                   -- proof of payment
  gl_posted          BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id      UUID,                           -- Phase 3.4
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipts_tenant ON receipts(tenant_id);
CREATE INDEX idx_receipts_company ON receipts(company_id, receipt_date DESC);

-- Receipt ↔ Invoice allocation (one receipt can pay multiple invoices)
CREATE TABLE receipt_allocations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id   UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES invoices(id),
  amount       NUMERIC(15,2) NOT NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_receipt_invoice UNIQUE (receipt_id, invoice_id)
);

-- Refund requests
CREATE TABLE refund_requests (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  receipt_id         UUID REFERENCES receipts(id),
  refund_type        VARCHAR(20) NOT NULL,           -- 'overpayment' | 'deposit' | 'adjustment'
  amount             NUMERIC(15,2) NOT NULL,
  currency           VARCHAR(3) NOT NULL,
  reason             TEXT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',
                     -- 'pending' | 'approved' | 'rejected' | 'paid'
  bank_name          VARCHAR(100),
  bank_account_no    VARCHAR(50),
  bank_account_name  VARCHAR(150),
  approved_by        UUID REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  payment_reference  VARCHAR(255),
  workflow_instance_id UUID,
  rejection_reason   TEXT,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant credit balances (from overpayments / credit notes)
CREATE TABLE tenant_credits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  amount       NUMERIC(15,2) NOT NULL,
  currency     VARCHAR(3) NOT NULL DEFAULT 'USD',
  source_type  VARCHAR(20) NOT NULL,                 -- 'overpayment' | 'credit_note' | 'adjustment'
  source_id    UUID,                                 -- receipt_id or invoice_id
  description  TEXT,
  used_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance      NUMERIC(15,2) GENERATED ALWAYS AS (amount - used_amount) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_credits_tenant ON tenant_credits(tenant_id) WHERE balance > 0;
```

### Services

```typescript
// src/modules/ar/receipts.service.ts
@Injectable()
export class ReceiptsService {
  async create(dto: CreateReceiptDto, createdBy: string): Promise<Receipt> {
    // 1. Validate total allocations = receipt amount
    const totalAllocated = dto.allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(totalAllocated - dto.amount) > 0.01) {
      const overpayment = dto.amount - totalAllocated;
      if (overpayment > 0) {
        // Create tenant credit for overpayment
        await this.createTenantCredit(dto.tenantId, dto.companyId, overpayment, dto.currency, 'overpayment');
      } else {
        throw new BadRequestException('Total allocations exceed receipt amount');
      }
    }

    const receipt = await this.receiptRepo.save({
      ...dto,
      receiptDate: dto.receiptDate ?? new Date().toISOString().split('T')[0],
      status: 'confirmed',
      createdBy,
    });

    // 2. Apply allocations to invoices
    for (const alloc of dto.allocations) {
      await this.applyAllocation(receipt.id, alloc.invoiceId, alloc.amount);
    }

    // 3. Post to GL (Phase 3.4 hook)
    await this.glService.postReceiptJournal(receipt);

    return receipt;
  }

  private async applyAllocation(receiptId: string, invoiceId: string, amount: number): Promise<void> {
    await this.allocationRepo.save({ receiptId, invoiceId, amount });

    const invoice = await this.invoiceRepo.findOneOrFail({ where: { id: invoiceId } });
    const newPaidAmount = Number(invoice.paidAmount) + amount;
    const newStatus = newPaidAmount >= Number(invoice.totalAmount) ? 'paid'
      : newPaidAmount > 0 ? 'partially_paid'
      : invoice.status;

    await this.invoiceRepo.update(invoiceId, {
      paidAmount: newPaidAmount,
      status: newStatus,
    });
  }

  async getAgingReport(companyId: string, params: AgingReportParams): Promise<AgingReport> {
    /**
     * AR aging buckets: Current, 1-30, 31-60, 61-90, 90+ days overdue
     */
    const today = new Date().toISOString().split('T')[0];
    const rows = await this.invoiceRepo
      .createQueryBuilder('i')
      .select([
        'i.tenant_id AS "tenantId"',
        't.first_name || \' \' || t.last_name AS "tenantName"',
        'SUM(i.outstanding_amount) FILTER (WHERE i.due_date >= :today) AS current',
        'SUM(i.outstanding_amount) FILTER (WHERE i.due_date BETWEEN :d30 AND :today) AS "days1to30"',
        'SUM(i.outstanding_amount) FILTER (WHERE i.due_date BETWEEN :d60 AND :d31) AS "days31to60"',
        'SUM(i.outstanding_amount) FILTER (WHERE i.due_date BETWEEN :d90 AND :d61) AS "days61to90"',
        'SUM(i.outstanding_amount) FILTER (WHERE i.due_date < :d90) AS "over90"',
        'SUM(i.outstanding_amount) AS total',
      ])
      .innerJoin('tenants', 't', 't.id = i.tenant_id')
      .where('i.company_id = :companyId', { companyId })
      .andWhere("i.status IN ('issued', 'sent', 'partially_paid', 'overdue')")
      .andWhere('i.outstanding_amount > 0')
      .setParameters({
        today, d30: addDays(new Date(), -30).toISOString().split('T')[0],
        d31: addDays(new Date(), -31).toISOString().split('T')[0],
        d60: addDays(new Date(), -60).toISOString().split('T')[0],
        d61: addDays(new Date(), -61).toISOString().split('T')[0],
        d90: addDays(new Date(), -90).toISOString().split('T')[0],
      })
      .groupBy('i.tenant_id, t.first_name, t.last_name')
      .orderBy('total', 'DESC')
      .getRawMany();

    if (params.propertyId) {
      // Additional filter
    }

    return { rows, generatedAt: new Date(), params };
  }

  async getStatement(tenantId: string, from: string, to: string): Promise<TenantStatement> {
    const invoices = await this.invoiceRepo.find({
      where: { tenantId, invoiceDate: Between(from, to) },
      order: { invoiceDate: 'ASC' },
    });
    const receipts = await this.receiptRepo.find({
      where: { tenantId, receiptDate: Between(from, to) },
      order: { receiptDate: 'ASC' },
    });
    // Merge and sort by date, compute running balance
    return this.buildStatement(invoices, receipts);
  }
}
```

---

## API Contract

### `GET /receipts`
**Access:** `ar.read`  
**Query:** `?tenantId=&propertyId=&from=&to=&status=confirmed&page=1&limit=20`

### `POST /receipts`
**Access:** `ar.create`

```json
{
  "tenantId": "uuid",
  "propertyId": "uuid",
  "receiptDate": "2025-02-08",
  "paymentMethod": "bank_transfer",
  "paymentReference": "TT-20250208-001",
  "bankAccountId": "uuid",
  "amount": 3815,
  "currency": "SGD",
  "allocations": [
    { "invoiceId": "uuid", "amount": 3815 }
  ],
  "notes": "Payment received via FAST transfer"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "receiptNumber": "RCT-2025-00021",
    "amount": 3815,
    "status": "confirmed",
    "allocations": [
      { "invoiceId": "uuid", "invoiceNumber": "INV-2025-00042", "amount": 3815 }
    ]
  }
}
```

### `GET /receipts/:id`
### `POST /receipts/:id/reverse`
**Access:** `ar.reverse`

```json
{ "reason": "Wrong invoice allocated — reprocessing" }
```

### `GET /ar/aging-report`
**Access:** `ar.read`  
**Query:** `?propertyId=&asOfDate=2025-01-31`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "current": 125000,
      "days1to30": 28500,
      "days31to60": 12000,
      "days61to90": 5500,
      "over90": 3200,
      "total": 174200
    },
    "rows": [
      {
        "tenantId": "uuid",
        "tenantName": "Tech Startup Pte Ltd",
        "current": 8500,
        "days1to30": 0,
        "days31to60": 0,
        "days61to90": 0,
        "over90": 0,
        "total": 8500
      }
    ],
    "generatedAt": "2025-01-31T08:00:00Z"
  }
}
```

### `GET /ar/collection-summary`
**Access:** `ar.read`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalInvoiced": 580000,
    "totalCollected": 524000,
    "totalOutstanding": 56000,
    "collectionRate": 90.3,
    "overdueCount": 12,
    "overdueAmount": 18500
  }
}
```

### `GET /tenants/:tenantId/statement`
**Access:** `ar.read`  
**Query:** `?from=2025-01-01&to=2025-01-31&format=json`

**Response 200 (JSON):**
```json
{
  "success": true,
  "data": {
    "tenant": { "id": "uuid", "displayName": "John Tan Wei Ming" },
    "period": { "from": "2025-01-01", "to": "2025-01-31" },
    "openingBalance": 0,
    "closingBalance": 0,
    "transactions": [
      { "date": "2025-01-01", "type": "invoice", "reference": "INV-2025-00001", "description": "Rent Jan 2025", "debit": 3815, "credit": 0, "balance": 3815 },
      { "date": "2025-01-08", "type": "receipt", "reference": "RCT-2025-00001", "description": "Payment received", "debit": 0, "credit": 3815, "balance": 0 }
    ]
  }
}
```

### `GET /tenants/:tenantId/statement/pdf`
**Access:** `ar.read`  
Returns pre-signed S3 URL for statement PDF.

### Refunds

### `GET /refunds`
### `POST /refunds`

```json
{
  "tenantId": "uuid",
  "refundType": "deposit",
  "amount": 7000,
  "currency": "SGD",
  "reason": "Lease ended, deposit refund per move-out inspection",
  "bankName": "DBS Bank",
  "bankAccountNo": "001-123456-7",
  "bankAccountName": "John Tan Wei Ming"
}
```

### `POST /refunds/:id/approve`
### `POST /refunds/:id/reject`
### `POST /refunds/:id/mark-paid`

```json
{ "paymentReference": "GIRO-2025020801", "paidAt": "2025-02-08T14:00:00Z" }
```

### `GET /tenants/:tenantId/credits`
**Access:** `ar.read`

---

## UI Screens

```
admin/ar/
├── ReceiptsPage/
│   └── components/
│       ├── ReceiptTable.tsx
│       ├── CreateReceiptModal/
│       │   ├── TenantPicker.tsx
│       │   ├── InvoiceAllocator.tsx     # lists tenant's outstanding invoices + amount inputs
│       │   └── PaymentDetailsForm.tsx
│       └── ReceiptDetailDrawer.tsx

├── AgingReportPage/
│   └── components/
│       ├── AgingBucketCards.tsx         # current | 1-30 | 31-60 | 61-90 | 90+
│       ├── AgingTable.tsx               # sortable by bucket amounts
│       └── ExportAgingButton.tsx

├── CollectionDashboard/
│   └── components/
│       ├── CollectionRateGauge.tsx
│       ├── OutstandingByProperty.tsx
│       └── OverdueTrendChart.tsx

├── RefundsPage/
│   └── components/
│       ├── RefundTable.tsx
│       ├── RefundStatusBadge.tsx
│       └── ApproveRefundModal.tsx

└── StatementPage/
    └── components/
        ├── StatementFilters.tsx
        ├── StatementTable.tsx           # running balance ledger
        └── StatementPdfButton.tsx
```

---

---

# Module 3.3 — Accounts Payable

**Phase:** 3 — Billing & Financial Management  
**Stack:** NestJS · PostgreSQL · React 18 · Redux Toolkit  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 3.4 (GL), 1.4 (Workflow), 10.1 (Vendor Management — stubbed)

---

## Overview

Manages all outgoing payments to vendors: invoice receipt, 3-way matching, approval workflow, payment voucher generation, and expense tracking by department/cost center.

---

## DB Schema

```sql
-- AP Invoices (from vendors)
CREATE TABLE ap_invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID REFERENCES properties(id),
  vendor_id         UUID,                              -- Phase 10.1; nullable for now
  vendor_name       VARCHAR(255) NOT NULL,             -- denormalized for pre-vendor-module use
  vendor_invoice_no VARCHAR(100),
  ap_invoice_number VARCHAR(50) NOT NULL UNIQUE,       -- API-2025-00001
  invoice_date      DATE NOT NULL,
  due_date          DATE NOT NULL,
  description       TEXT,
  subtotal          NUMERIC(15,2) NOT NULL,
  tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15,2) NOT NULL,
  paid_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(3) NOT NULL DEFAULT 'USD',
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- 'pending' | 'approved' | 'scheduled' | 'paid' | 'rejected' | 'void'
  cost_center       VARCHAR(100),
  department_id     UUID REFERENCES departments(id),
  po_reference      VARCHAR(100),                     -- purchase order reference (Phase 10.2)
  workflow_instance_id UUID,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  gl_posted         BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id     UUID,
  attachment_url    VARCHAR(500),
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ap_invoices_company ON ap_invoices(company_id);
CREATE INDEX idx_ap_invoices_status ON ap_invoices(status) WHERE status IN ('pending', 'approved');
CREATE INDEX idx_ap_invoices_due ON ap_invoices(due_date) WHERE paid_amount < total_amount;

-- AP invoice line items
CREATE TABLE ap_invoice_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ap_invoice_id    UUID NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  charge_type_id   UUID REFERENCES charge_types(id),
  description      VARCHAR(500) NOT NULL,
  quantity         NUMERIC(10,4) DEFAULT 1,
  unit_price       NUMERIC(15,4) NOT NULL,
  amount           NUMERIC(15,2) NOT NULL,
  tax_rate         NUMERIC(5,4) DEFAULT 0,
  tax_amount       NUMERIC(15,2) DEFAULT 0,
  line_total       NUMERIC(15,2) NOT NULL,
  gl_account_code  VARCHAR(20),
  sort_order       SMALLINT DEFAULT 0
);

-- Payment vouchers
CREATE TABLE payment_vouchers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  voucher_number   VARCHAR(50) NOT NULL UNIQUE,        -- PV-2025-00001
  voucher_date     DATE NOT NULL,
  payment_method   VARCHAR(30) NOT NULL,               -- 'bank_transfer' | 'cheque' | 'giro'
  bank_account_id  UUID REFERENCES bank_accounts(id),
  vendor_name      VARCHAR(255) NOT NULL,
  vendor_bank_name VARCHAR(100),
  vendor_bank_acc  VARCHAR(50),
  total_amount     NUMERIC(15,2) NOT NULL,
  currency         VARCHAR(3) NOT NULL,
  payment_reference VARCHAR(255),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
                   -- 'pending' | 'approved' | 'paid' | 'cancelled'
  paid_at          TIMESTAMPTZ,
  workflow_instance_id UUID,
  approved_by      UUID REFERENCES users(id),
  gl_posted        BOOLEAN NOT NULL DEFAULT FALSE,
  gl_journal_id    UUID,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment voucher ↔ AP invoice allocations
CREATE TABLE pv_allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id      UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
  ap_invoice_id   UUID NOT NULL REFERENCES ap_invoices(id),
  amount          NUMERIC(15,2) NOT NULL,
  PRIMARY KEY (voucher_id, ap_invoice_id)
);

-- Expenses (non-AP-invoice expenses — petty cash, staff claims)
CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID REFERENCES properties(id),
  department_id   UUID REFERENCES departments(id),
  expense_date    DATE NOT NULL,
  category        VARCHAR(100) NOT NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  currency        VARCHAR(3) NOT NULL,
  receipt_url     VARCHAR(500),
  submitted_by    UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  gl_account_code VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## API Contract

### `GET /ap/invoices`
**Access:** `ap.read`  
**Query:** `?vendorName=&status=pending&propertyId=&from=&to=&page=1&limit=20`

### `POST /ap/invoices`
**Access:** `ap.create`

```json
{
  "vendorName": "ABC Facilities Management Pte Ltd",
  "vendorInvoiceNo": "ABC-INV-2025-0142",
  "propertyId": "uuid",
  "invoiceDate": "2025-01-20",
  "dueDate": "2025-02-20",
  "description": "Building maintenance services — January 2025",
  "currency": "SGD",
  "lines": [
    { "description": "General cleaning services", "quantity": 1, "unitPrice": 3200, "taxRate": 0.09 },
    { "description": "Pest control", "quantity": 1, "unitPrice": 450, "taxRate": 0.09 }
  ],
  "departmentId": "uuid",
  "costCenter": "OP-TOWER-A"
}
```

### `POST /ap/invoices/:id/submit`
**Access:** `ap.submit`  
Submits for approval workflow.

### `POST /ap/invoices/:id/approve`
**Access:** `ap.approve`

### `POST /ap/invoices/:id/reject`

```json
{ "reason": "Invoice amount does not match PO. Please resubmit with correct amount." }
```

### `POST /ap/payment-vouchers`
**Access:** `ap.create`

```json
{
  "voucherDate": "2025-01-25",
  "paymentMethod": "bank_transfer",
  "bankAccountId": "uuid",
  "vendorName": "ABC Facilities Management Pte Ltd",
  "vendorBankName": "OCBC Bank",
  "vendorBankAcc": "500-123456-001",
  "currency": "SGD",
  "allocations": [
    { "apInvoiceId": "uuid", "amount": 3974.50 }
  ],
  "notes": "January maintenance payment"
}
```

### `POST /ap/payment-vouchers/:id/submit`
### `POST /ap/payment-vouchers/:id/mark-paid`

```json
{ "paymentReference": "TT-20250125-002", "paidAt": "2025-01-25T11:00:00Z" }
```

### `GET /ap/due-payments`
**Access:** `ap.read`  
**Query:** `?dueBefore=2025-02-28&propertyId=`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalDue": 45230,
    "invoices": [
      {
        "id": "uuid",
        "apInvoiceNumber": "API-2025-00001",
        "vendorName": "ABC Facilities",
        "dueDate": "2025-02-20",
        "outstanding": 3974.50,
        "daysUntilDue": 26
      }
    ]
  }
}
```

### `GET /expenses`
### `POST /expenses`
### `POST /expenses/:id/approve`
### `GET /ap/expense-report`  
**Query:** `?departmentId=&from=&to=&groupBy=category`

---

## Business Logic & Validation Rules

```
AP invoice 3-way match (when PO module is available — Phase 10):
  1. Match AP invoice vendor + amount against Purchase Order
  2. Match AP invoice against Goods Received Note (GRN)
  3. Allow ±5% variance (configurable)
  4. Flag discrepancies for manual review

Approval thresholds:
  Configurable per company (stored in workflow_definitions for 'ap_invoice' entity):
  < SGD 1,000: auto-approve (if from whitelisted vendor)
  SGD 1,000 – 10,000: Dept Manager approval
  SGD 10,000 – 50,000: Finance Manager approval
  > SGD 50,000: CFO approval

Payment voucher:
  Cannot create voucher for unapproved AP invoice
  Total voucher allocations must equal voucher total_amount
  On mark-paid: update ap_invoice.paid_amount, set status='paid' if fully paid
  GL posting triggered on status='paid'

Expense approval:
  Auto-approve below company petty cash limit (e.g. < 50 USD)
  Above limit: department manager approval required
```

---

## UI Screens

```
admin/ap/
├── ApInvoiceListPage/
│   └── components/
│       ├── ApInvoiceTable.tsx
│       ├── ApStatusBadge.tsx
│       ├── CreateApInvoiceModal.tsx
│       │   └── ApInvoiceLineEditor.tsx
│       └── DuePaymentsSummary.tsx

├── ApInvoiceDetailPage/
│   └── components/
│       ├── ApInvoiceHeader.tsx
│       ├── ApInvoiceLinesTable.tsx
│       ├── ApApprovalPanel.tsx         # approve/reject with comments
│       └── LinkedVouchersTable.tsx

├── PaymentVouchersPage/
│   └── components/
│       ├── VoucherTable.tsx
│       ├── CreateVoucherModal.tsx
│       │   └── ApInvoiceAllocator.tsx
│       └── VoucherStatusBadge.tsx

└── ExpensesPage/
    └── components/
        ├── ExpenseTable.tsx
        ├── SubmitExpenseModal.tsx
        └── ExpenseReportChart.tsx      # by category / department
```

---

## State Management

```typescript
export const apApi = createApi({
  reducerPath: 'apApi',
  tagTypes: ['ApInvoices', 'PaymentVouchers', 'Expenses'],
  endpoints: (builder) => ({
    getApInvoices: builder.query<PaginatedResponse<ApInvoice>, ApInvoiceQueryParams>({
      query: (params) => ({ url: '/ap/invoices', params }),
      providesTags: ['ApInvoices'],
    }),
    createApInvoice: builder.mutation<ApInvoice, CreateApInvoiceDto>({
      query: (body) => ({ url: '/ap/invoices', method: 'POST', body }),
      invalidatesTags: ['ApInvoices'],
    }),
    submitApInvoice: builder.mutation<void, string>({
      query: (id) => ({ url: `/ap/invoices/${id}/submit`, method: 'POST' }),
      invalidatesTags: ['ApInvoices'],
    }),
    approveApInvoice: builder.mutation<void, { id: string; comments?: string }>({
      query: ({ id, ...body }) => ({ url: `/ap/invoices/${id}/approve`, method: 'POST', body }),
      invalidatesTags: ['ApInvoices'],
    }),
    createPaymentVoucher: builder.mutation<PaymentVoucher, CreatePaymentVoucherDto>({
      query: (body) => ({ url: '/ap/payment-vouchers', method: 'POST', body }),
      invalidatesTags: ['PaymentVouchers', 'ApInvoices'],
    }),
    markVoucherPaid: builder.mutation<void, { id: string; paymentReference: string; paidAt: string }>({
      query: ({ id, ...body }) => ({ url: `/ap/payment-vouchers/${id}/mark-paid`, method: 'POST', body }),
      invalidatesTags: ['PaymentVouchers', 'ApInvoices'],
    }),
    submitExpense: builder.mutation<Expense, CreateExpenseDto>({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
    }),
    approveExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/expenses/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Expenses'],
    }),
  }),
});

export const arApi = createApi({
  reducerPath: 'arApi',
  tagTypes: ['Receipts', 'AgingReport', 'Refunds', 'TenantCredits'],
  endpoints: (builder) => ({
    getReceipts: builder.query<PaginatedResponse<Receipt>, ReceiptQueryParams>({
      query: (params) => ({ url: '/receipts', params }),
      providesTags: ['Receipts'],
    }),
    createReceipt: builder.mutation<Receipt, CreateReceiptDto>({
      query: (body) => ({ url: '/receipts', method: 'POST', body }),
      invalidatesTags: ['Receipts'],
    }),
    getAgingReport: builder.query<AgingReport, AgingReportParams>({
      query: (params) => ({ url: '/ar/aging-report', params }),
      providesTags: ['AgingReport'],
    }),
    getCollectionSummary: builder.query<CollectionSummary, { propertyId?: string }>({
      query: (params) => ({ url: '/ar/collection-summary', params }),
    }),
    getTenantStatement: builder.query<TenantStatement, { tenantId: string; from: string; to: string }>({
      query: ({ tenantId, ...params }) => ({ url: `/tenants/${tenantId}/statement`, params }),
    }),
    createRefund: builder.mutation<RefundRequest, CreateRefundDto>({
      query: (body) => ({ url: '/refunds', method: 'POST', body }),
      invalidatesTags: ['Refunds'],
    }),
    approveRefund: builder.mutation<void, string>({
      query: (id) => ({ url: `/refunds/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Refunds'],
    }),
    markRefundPaid: builder.mutation<void, { id: string; paymentReference: string }>({
      query: ({ id, ...body }) => ({ url: `/refunds/${id}/mark-paid`, method: 'POST', body }),
      invalidatesTags: ['Refunds'],
    }),
  }),
});
```
