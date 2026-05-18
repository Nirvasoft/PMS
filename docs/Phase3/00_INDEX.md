# PMS — Phase 3: Billing & Financial Management
## Developer Specification Index

**Tech Stack:** Node.js 20+ · Express · Prisma · TypeScript · PostgreSQL 15+ · Redis 7+ · React 18 · Redux Toolkit  
**Timeline:** Months 7–9  
**Depends On:** Phase 1 + Phase 2 (all modules)  
**Total Effort:** ~12 developer-weeks

---

## Module Index

| File | Modules Covered | Backend Effort | Frontend Effort |
|------|----------------|---------------|-----------------|
| `01_billing_engine.md` | 3.1 Billing Engine | 2.5 weeks | 0.5 weeks |
| `02_accounts_receivable_and_03_accounts_payable.md` | 3.2 AR + 3.3 AP | 2.5 weeks | 1 week |
| `03_gl_budgeting_assets_banking.md` | 3.4 GL + 3.5 Budgeting + 3.6 Fixed Assets + 3.6 Banking | 3.5 weeks | 1.5 weeks |

---

## Dependency Graph (Phase 3)

```
Phase 2 (all modules)
    └─► 3.1 Billing Engine ──────────────────────────┐
            └─► 3.2 Accounts Receivable               │
                    └─► 3.4 General Ledger ◄──────────┘
                    └─► 3.6 Banking & Reconciliation
            └─► 3.3 Accounts Payable
                    └─► 3.4 General Ledger
    └─► 3.5 Budgeting ──► 3.4 General Ledger
    └─► 3.6 Fixed Assets → 3.4 General Ledger
```

Build order: 3.4 GL (COA + fiscal periods) → 3.1 Billing → 3.2 AR → 3.3 AP → 3.5 Budgeting → 3.6 Assets → 3.6 Banking

---

## Cross-Cutting Concerns (Phase 3)

### 1. Double-Entry Integrity

Every financial transaction MUST produce a balanced journal entry (debits = credits). All service methods that touch monetary values must include a GL posting hook:

```typescript
// Pattern used in every financial operation:
await this.dataSource.transaction(async (em) => {
  // 1. Business operation (invoice, receipt, payment)
  const result = await em.save(SomeEntity, data);
  // 2. GL posting (within same transaction — all-or-nothing)
  await this.glService.postJournal(em, result);
  return result;
});
```

### 2. Currency Handling

All monetary amounts stored as `NUMERIC(15,2)` in source currency. For multi-currency companies, `exchange_rate` and `base_currency_amount` stored alongside. Never use `FLOAT` for monetary values.

```typescript
// Money arithmetic — always use Decimal.js for precision
import Decimal from 'decimal.js';
const total = new Decimal(unitPrice).times(quantity).minus(discount).plus(tax);
const stored = total.toDecimalPlaces(2).toNumber();
```

### 3. Billing Idempotency

Invoice generation must be idempotent. Before generating, always check:

```typescript
const existing = await this.invoiceRepo.findOne({
  where: {
    leaseId: schedule.leaseId,
    periodFrom: periodFrom,
    invoiceType: 'invoice',
    status: Not(In(['void'])),
  },
});
if (existing) {
  this.logger.warn(`Invoice already exists for period ${periodFrom}, skipping`);
  return existing;
}
```

### 4. GL Account Mapping

Standard COA codes used for auto-posting:

```typescript
export const GL_ACCOUNT_CODES = {
  AR_CONTROL: '1100',           // Accounts Receivable (control)
  AP_CONTROL: '2100',           // Accounts Payable (control)
  TAX_PAYABLE: '2200',          // GST/VAT Payable
  ACCRUED_EXPENSES: '2300',     // Accrued Expenses
  RENTAL_INCOME: '4100',        // Rental Income
  SERVICE_CHARGE_INCOME: '4200',// Service Charge Income
  MAINTENANCE_EXPENSE: '5100',  // Maintenance Expense
  ADMIN_EXPENSE: '5200',        // Administration Expense
  DEPRECIATION_EXPENSE: '5500', // Depreciation Expense
  ACCUM_DEPRECIATION: '1600',   // Accumulated Depreciation (contra-asset)
};
```

### 5. Cron Jobs (Phase 3)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `daily-billing-run` | `0 2 * * *` | Generate invoices for due billing schedules |
| `penalty-check` | `0 3 * * *` | Apply late payment penalties to overdue invoices |
| `monthly-depreciation` | `0 2 1 * *` | Run fixed asset depreciation |
| `invoice-overdue-transition` | `0 4 * * *` | Transition past-due invoices to 'overdue' status |
| `escalation-apply` | `0 1 * * *` | Apply rent escalations (from Phase 2) |

### 6. New Notification Templates (Phase 3)

```typescript
export const PHASE3_NOTIFICATION_TEMPLATES = [
  { code: 'invoice_issued',          name: 'Invoice Issued',              channels: ['email', 'in_app'] },
  { code: 'invoice_reminder',        name: 'Invoice Payment Reminder',    channels: ['email', 'sms', 'in_app'] },
  { code: 'invoice_overdue',         name: 'Invoice Overdue',             channels: ['email', 'sms', 'in_app'] },
  { code: 'invoice_overdue_penalty', name: 'Overdue Penalty Applied',     channels: ['email', 'in_app'] },
  { code: 'payment_received',        name: 'Payment Received',            channels: ['email', 'in_app'] },
  { code: 'refund_approved',         name: 'Refund Approved',             channels: ['email', 'in_app'] },
  { code: 'refund_paid',             name: 'Refund Paid',                 channels: ['email', 'in_app'] },
  { code: 'ap_invoice_approved',     name: 'AP Invoice Approved',         channels: ['in_app'] },
  { code: 'ap_payment_due',          name: 'AP Payment Due Soon',         channels: ['email', 'in_app'] },
  { code: 'budget_over_threshold',   name: 'Budget Over Threshold',       channels: ['email', 'in_app'] },
];
```

### 7. Phase 3 Migration Files

```
migrations/
├── 1700020001-create-charge-types.ts
├── 1700020002-create-billing-schedules.ts
├── 1700020003-create-invoices.ts
├── 1700020004-create-receipts.ts
├── 1700020005-create-refunds.ts
├── 1700020006-create-tenant-credits.ts
├── 1700020007-create-ap-invoices.ts
├── 1700020008-create-payment-vouchers.ts
├── 1700020009-create-expenses.ts
├── 1700020010-create-gl-accounts.ts
├── 1700020011-create-fiscal-periods.ts
├── 1700020012-create-journal-entries.ts
├── 1700020013-create-budgets.ts
├── 1700020014-create-fixed-assets.ts
├── 1700020015-create-bank-accounts.ts
├── 1700020016-create-bank-reconciliation.ts
├── 1700020017-create-payment-gateway-txns.ts
├── 1700020018-seed-charge-types.ts
├── 1700020019-seed-default-coa.ts
└── 1700020020-seed-phase3-notification-templates.ts
```

### 8. Phase 3 Acceptance Criteria

- [ ] Daily billing job generates invoices for all due schedules within 5 minutes for 10,000 active leases
- [ ] Prorated first invoice: manual test for lease starting mid-month — amount matches formula
- [ ] Penalty applied correctly after grace period — verified against `penalty_configurations`
- [ ] AR receipt creation: invoice status updates to `paid`, GL journal posted (Dr Bank / Cr AR)
- [ ] AP invoice full cycle: submit → approve → payment voucher → mark paid → GL posted
- [ ] Trial balance: sum of all debit balances = sum of all credit balances after posting 50+ journals
- [ ] P&L and Balance Sheet generated correctly and match trial balance totals
- [ ] Fiscal period close: blocked if open draft journals exist; succeeds otherwise
- [ ] Fixed asset depreciation: monthly amount matches straight-line formula for 5 test assets
- [ ] Bank reconciliation: CSV import parses correctly, auto-match rate > 70% for test data
- [ ] Stripe payment: checkout session created, webhook processed, receipt auto-created
- [ ] AR aging report: buckets match manual calculation for 10 test tenants
- [ ] Credit note: creates negative invoice, reduces original invoice outstanding balance
- [ ] Budget variance: correct calculation against actual GL postings
- [ ] All Phase 3 dashboard widgets returning real GL data
- [ ] Multi-tenant: Company A financial data never accessible by Company B user
- [ ] UAT sign-off from Finance stakeholder
