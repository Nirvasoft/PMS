# Module 3.4 — General Ledger

**Phase:** 3 — Billing & Financial Management  
**Stack:** NestJS · PostgreSQL · React 18 · Redux Toolkit  
**Estimated Effort:** 2.5 weeks (2 backend, 0.5 frontend)  
**Depends On:** Module 3.1, 3.2, 3.3, 1.3 (Organization)

---

## Overview

Double-entry General Ledger with Chart of Accounts, manual and auto-posted journal entries, fiscal period management, trial balance, and financial statement generation (P&L, Balance Sheet, Cash Flow).

---

## DB Schema

```sql
-- Chart of Accounts
CREATE TABLE gl_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  account_type    VARCHAR(20) NOT NULL,               -- 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  account_subtype VARCHAR(50),                        -- 'current_asset' | 'fixed_asset' | 'revenue' | 'cogs' | etc.
  normal_balance  VARCHAR(6) NOT NULL,                -- 'debit' | 'credit'
  is_control      BOOLEAN NOT NULL DEFAULT FALSE,     -- control accounts cannot be manually posted
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  description     TEXT,
  sort_order      SMALLINT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_account_code_company UNIQUE (code, company_id)
);

CREATE INDEX idx_gl_accounts_company ON gl_accounts(company_id);
CREATE INDEX idx_gl_accounts_type ON gl_accounts(account_type);

-- Fiscal periods
CREATE TABLE fiscal_periods (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year  SMALLINT NOT NULL,
  period_number SMALLINT NOT NULL,                    -- 1–12 for monthly
  name         VARCHAR(50) NOT NULL,                  -- 'Jan 2025', 'Q1 2025'
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'open',   -- 'open' | 'closed' | 'locked'
  closed_at    TIMESTAMPTZ,
  closed_by    UUID REFERENCES users(id),
  CONSTRAINT uq_fiscal_period UNIQUE (company_id, fiscal_year, period_number)
);

-- Journal entries (header)
CREATE TABLE journal_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  journal_number   VARCHAR(50) NOT NULL UNIQUE,       -- JE-2025-00001
  entry_date       DATE NOT NULL,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  entry_type       VARCHAR(20) NOT NULL DEFAULT 'manual',
                   -- 'manual' | 'ar_receipt' | 'ar_invoice' | 'ap_payment' | 'ap_invoice'
                   -- | 'depreciation' | 'bank_recon' | 'adjustment'
  description      VARCHAR(500) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'draft',
                   -- 'draft' | 'posted' | 'reversed'
  reference_type   VARCHAR(50),                       -- 'invoice' | 'receipt' | 'payment_voucher' | etc.
  reference_id     UUID,
  is_reversal      BOOLEAN NOT NULL DEFAULT FALSE,
  reversal_of_id   UUID REFERENCES journal_entries(id),
  reversed_by_id   UUID REFERENCES journal_entries(id),
  total_debit      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit     NUMERIC(15,2) NOT NULL DEFAULT 0,
  posted_by        UUID REFERENCES users(id),
  posted_at        TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_je_company ON journal_entries(company_id, entry_date DESC);
CREATE INDEX idx_je_period ON journal_entries(fiscal_period_id);
CREATE INDEX idx_je_reference ON journal_entries(reference_type, reference_id);

-- Journal entry lines (debit/credit legs)
CREATE TABLE journal_entry_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES gl_accounts(id),
  description      VARCHAR(500),
  debit            NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  property_id      UUID REFERENCES properties(id),
  department_id    UUID REFERENCES departments(id),
  sort_order       SMALLINT DEFAULT 0,
  CONSTRAINT chk_line_debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX idx_jel_journal ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);
```

### Services

```typescript
// src/modules/gl/gl.service.ts
@Injectable()
export class GlService {
  /**
   * Posts a double-entry journal from AR invoice generation.
   * Dr: Accounts Receivable (tenant)
   * Cr: Revenue (by charge type)
   * Cr: Tax Payable (if tax)
   */
  async postInvoiceJournal(invoice: Invoice): Promise<JournalEntry> {
    const lines: Partial<JournalEntryLine>[] = [];
    const arAccount = await this.getAccount('1100', invoice.companyId);  // AR control
    const taxPayableAccount = await this.getAccount('2200', invoice.companyId);

    // Debit AR
    lines.push({ accountId: arAccount.id, debit: invoice.totalAmount, credit: 0, description: `AR — ${invoice.invoiceNumber}`, propertyId: invoice.propertyId });

    // Credit Revenue lines
    for (const line of invoice.lines) {
      const revenueAccount = await this.getAccountForChargeType(line.chargeType.code, invoice.companyId);
      lines.push({ accountId: revenueAccount.id, debit: 0, credit: line.amount, description: line.description, propertyId: invoice.propertyId });
      if (line.taxAmount > 0) {
        lines.push({ accountId: taxPayableAccount.id, debit: 0, credit: line.taxAmount, description: 'GST Payable', propertyId: invoice.propertyId });
      }
    }

    return this.createAndPostJournal({
      companyId: invoice.companyId,
      entryDate: invoice.invoiceDate,
      entryType: 'ar_invoice',
      description: `AR Invoice ${invoice.invoiceNumber}`,
      referenceType: 'invoice',
      referenceId: invoice.id,
      lines,
    });
  }

  async postReceiptJournal(receipt: Receipt): Promise<JournalEntry> {
    const lines: Partial<JournalEntryLine>[] = [];
    const arAccount = await this.getAccount('1100', receipt.companyId);
    const bankAccount = await this.getBankGlAccount(receipt.bankAccountId);

    // Debit Bank
    lines.push({ accountId: bankAccount.id, debit: receipt.amount, credit: 0, description: `Receipt ${receipt.receiptNumber}` });
    // Credit AR
    lines.push({ accountId: arAccount.id, debit: 0, credit: receipt.amount, description: `Receipt ${receipt.receiptNumber}` });

    return this.createAndPostJournal({
      companyId: receipt.companyId,
      entryDate: receipt.receiptDate,
      entryType: 'ar_receipt',
      description: `AR Receipt ${receipt.receiptNumber}`,
      referenceType: 'receipt',
      referenceId: receipt.id,
      lines,
    });
  }

  async getTrialBalance(companyId: string, params: TrialBalanceParams): Promise<TrialBalanceRow[]> {
    return this.dataSource.query(`
      WITH period_filter AS (
        SELECT id FROM fiscal_periods
        WHERE company_id = $1
          AND start_date >= $2
          AND end_date <= $3
      ),
      account_balances AS (
        SELECT
          a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance,
          COALESCE(SUM(jel.debit), 0) AS total_debit,
          COALESCE(SUM(jel.credit), 0) AS total_credit,
          CASE a.normal_balance
            WHEN 'debit'  THEN COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
            WHEN 'credit' THEN COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)
          END AS net_balance
        FROM gl_accounts a
        LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
          AND je.status = 'posted'
          AND je.fiscal_period_id IN (SELECT id FROM period_filter)
        WHERE a.company_id = $1 AND a.is_active = TRUE
        GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.normal_balance
      )
      SELECT * FROM account_balances
      ORDER BY code
    `, [companyId, params.fromDate, params.toDate]);
  }

  async getProfitAndLoss(companyId: string, params: FinancialStatementParams): Promise<ProfitAndLoss> {
    const trialBalance = await this.getTrialBalance(companyId, params);
    const income = trialBalance.filter(r => r.account_type === 'income').map(r => ({ ...r, amount: r.net_balance }));
    const expense = trialBalance.filter(r => r.account_type === 'expense').map(r => ({ ...r, amount: r.net_balance }));
    const totalIncome = income.reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = expense.reduce((s, r) => s + Number(r.amount), 0);
    return { income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense, period: params };
  }
}
```

---

## API Contract

### `GET /gl/accounts`
**Access:** `gl.read`  
**Query:** `?accountType=income&tree=true`

### `POST /gl/accounts`

```json
{
  "parentId": "uuid",
  "code": "4100",
  "name": "Rental Income",
  "accountType": "income",
  "accountSubtype": "revenue",
  "normalBalance": "credit",
  "isControl": false
}
```

### `GET /gl/fiscal-periods`
### `POST /gl/fiscal-periods`

```json
{ "fiscalYear": 2025, "periodNumber": 1, "name": "Jan 2025", "startDate": "2025-01-01", "endDate": "2025-01-31" }
```

### `POST /gl/fiscal-periods/:id/close`
**Access:** `gl.close`

### `POST /gl/fiscal-periods/:id/reopen`
**Access:** `gl.admin`

---

### `GET /gl/journal-entries`
**Access:** `gl.read`  
**Query:** `?entryType=manual&fiscalPeriodId=&from=&to=&page=1&limit=20`

### `POST /gl/journal-entries`
**Access:** `gl.create`

```json
{
  "entryDate": "2025-01-31",
  "description": "Accrual — January maintenance costs",
  "lines": [
    { "accountCode": "5100", "debit": 5000, "credit": 0, "description": "Maintenance expense accrual" },
    { "accountCode": "2300", "debit": 0, "credit": 5000, "description": "Accrued expenses payable" }
  ]
}
```

### `POST /gl/journal-entries/:id/post`
**Access:** `gl.post`

Validates balanced (total debit = total credit) before posting.

### `POST /gl/journal-entries/:id/reverse`
**Access:** `gl.post`

Creates auto-reversal entry dated first day of next period.

---

### `GET /gl/trial-balance`
**Access:** `gl.read`  
**Query:** `?fromDate=2025-01-01&toDate=2025-01-31&propertyId=`

### `GET /gl/reports/pnl`
**Access:** `gl.read`  
**Query:** `?fromDate=2025-01-01&toDate=2025-01-31&propertyId=&compareToDate=`

### `GET /gl/reports/balance-sheet`
**Access:** `gl.read`  
**Query:** `?asOfDate=2025-01-31&propertyId=`

### `GET /gl/reports/cash-flow`
**Access:** `gl.read`

---

## Business Logic

```
Journal posting validation:
  total_debit = total_credit (within 0.01 tolerance)
  entryDate must be within an OPEN fiscal period
  All account_ids must belong to same company
  Control accounts (is_control=TRUE) cannot be used in manual journal entries

Fiscal period close process:
  1. Verify all invoices in period are in final status (paid/void)
  2. Check no draft journal entries remain open in period
  3. Run auto-closing entries (income/expense → retained earnings)
  4. Set period status = 'closed'
  5. Audit log with closing balance snapshot

COA seeding (on company create):
  Auto-seed standard COA based on company type:
  Assets: 1000-1999, Liabilities: 2000-2999, Equity: 3000-3999
  Income: 4000-4999, Expenses: 5000-5999

Auto-posting triggers:
  Module 3.1 invoice issued → Dr AR / Cr Revenue / Cr Tax Payable
  Module 3.2 receipt confirmed → Dr Bank / Cr AR
  Module 3.3 AP invoice approved → Dr Expense / Cr AP Control
  Module 3.3 voucher paid → Dr AP Control / Cr Bank
  Module 3.5 depreciation run → Dr Depreciation Expense / Cr Accumulated Depreciation
```

---

## UI Screens

```
admin/gl/
├── ChartOfAccountsPage/
│   └── components/
│       ├── AccountTree.tsx             # nested tree matching COA hierarchy
│       ├── AccountNode.tsx             # code + name + type + balance
│       └── AccountFormModal.tsx

├── JournalEntriesPage/
│   └── components/
│       ├── JournalTable.tsx
│       ├── JournalStatusBadge.tsx      # Draft | Posted | Reversed
│       └── CreateJournalModal.tsx
│           └── JournalLineEditor.tsx   # account picker + debit/credit inputs
│                                       # live validation: must balance

├── TrialBalancePage/
│   └── components/
│       ├── PeriodSelector.tsx
│       ├── TrialBalanceTable.tsx       # account | debit | credit | net
│       └── ExportTrialBalanceButton.tsx

├── ProfitAndLossPage/
│   └── components/
│       ├── PnlPeriodControls.tsx
│       ├── IncomeSection.tsx
│       ├── ExpenseSection.tsx
│       ├── NetProfitSummary.tsx
│       └── PnlComparisonChart.tsx      # current vs previous period

├── BalanceSheetPage/
│   └── components/
│       ├── AssetSection.tsx
│       ├── LiabilityEquitySection.tsx
│       └── BalanceCheckBadge.tsx       # Assets = Liabilities + Equity

└── FiscalPeriodsPage/
    └── components/
        ├── PeriodTable.tsx
        ├── ClosePeriodModal.tsx
        └── PeriodStatusBadge.tsx
```

---
---

# Module 3.5 — Budgeting & Fixed Assets

**Phase:** 3  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)

---

## DB Schema

```sql
-- Annual budgets
CREATE TABLE budgets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id    UUID REFERENCES properties(id),
  department_id  UUID REFERENCES departments(id),
  fiscal_year    SMALLINT NOT NULL,
  gl_account_id  UUID NOT NULL REFERENCES gl_accounts(id),
  name           VARCHAR(255),
  annual_amount  NUMERIC(15,2) NOT NULL,
  monthly_amounts JSONB,                             -- { "1": 8000, "2": 8000, ... } per month
  status         VARCHAR(20) DEFAULT 'draft',        -- 'draft' | 'approved' | 'locked'
  approved_by    UUID REFERENCES users(id),
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_budget UNIQUE (company_id, property_id, department_id, fiscal_year, gl_account_id)
);

-- Fixed assets
CREATE TABLE fixed_assets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id           UUID REFERENCES properties(id),
  asset_number          VARCHAR(50) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  category              VARCHAR(100) NOT NULL,        -- 'building' | 'machinery' | 'furniture' | 'vehicle' | 'it_equipment'
  description           TEXT,
  acquisition_date      DATE NOT NULL,
  acquisition_cost      NUMERIC(15,2) NOT NULL,
  useful_life_years     SMALLINT NOT NULL,
  residual_value        NUMERIC(15,2) DEFAULT 0,
  depreciation_method   VARCHAR(20) DEFAULT 'straight_line',
                        -- 'straight_line' | 'declining_balance'
  declining_rate        NUMERIC(5,4),                -- for declining balance method
  accumulated_depreciation NUMERIC(15,2) DEFAULT 0,
  net_book_value        NUMERIC(15,2) GENERATED ALWAYS AS (acquisition_cost - accumulated_depreciation) STORED,
  current_location      VARCHAR(255),
  responsible_person_id UUID REFERENCES users(id),
  status                VARCHAR(20) DEFAULT 'active', -- 'active' | 'disposed' | 'transferred'
  disposal_date         DATE,
  disposal_amount       NUMERIC(15,2),
  gl_asset_account_id   UUID REFERENCES gl_accounts(id),
  gl_depreciation_account_id UUID REFERENCES gl_accounts(id),
  gl_accum_dep_account_id UUID REFERENCES gl_accounts(id),
  serial_number         VARCHAR(100),
  warranty_expiry       DATE,
  photo_url             VARCHAR(500),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asset_number_company UNIQUE (asset_number, company_id)
);

-- Depreciation schedule
CREATE TABLE depreciation_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  depreciation_date DATE NOT NULL,
  amount           NUMERIC(15,2) NOT NULL,
  net_book_value_after NUMERIC(15,2) NOT NULL,
  gl_journal_id    UUID REFERENCES journal_entries(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asset_period UNIQUE (asset_id, fiscal_period_id)
);

-- Asset transfers
CREATE TABLE asset_transfers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id           UUID NOT NULL REFERENCES fixed_assets(id),
  from_property_id   UUID REFERENCES properties(id),
  to_property_id     UUID REFERENCES properties(id),
  transfer_date      DATE NOT NULL,
  reason             TEXT,
  transferred_by     UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Key Service Methods

```typescript
// src/modules/assets/depreciation.service.ts
@Injectable()
export class DepreciationService {
  @Cron('0 2 1 * *')  // 2 AM on 1st of every month
  async runMonthlyDepreciation(): Promise<void> {
    const currentPeriod = await this.getCurrentFiscalPeriod();
    const assets = await this.assetRepo.find({
      where: { status: 'active', netBookValue: MoreThan(0) },
    });

    for (const asset of assets) {
      const amount = this.calculateMonthlyDepreciation(asset);
      if (amount <= 0 || asset.netBookValue <= asset.residualValue) continue;

      const capped = Math.min(amount, Number(asset.netBookValue) - Number(asset.residualValue));

      await this.assetRepo.update(asset.id, {
        accumulatedDepreciation: () => `accumulated_depreciation + ${capped}`,
      });

      const depEntry = await this.depRepo.save({
        assetId: asset.id,
        fiscalPeriodId: currentPeriod.id,
        depreciationDate: new Date(),
        amount: capped,
        netBookValueAfter: Number(asset.netBookValue) - capped,
      });

      // Post GL journal
      const journal = await this.glService.postDepreciationJournal(asset, capped, currentPeriod);
      await this.depRepo.update(depEntry.id, { glJournalId: journal.id });
    }
  }

  private calculateMonthlyDepreciation(asset: FixedAsset): number {
    if (asset.depreciationMethod === 'straight_line') {
      const depreciableAmount = Number(asset.acquisitionCost) - Number(asset.residualValue);
      return depreciableAmount / (Number(asset.usefulLifeYears) * 12);
    } else {
      // Declining balance
      return Number(asset.netBookValue) * (Number(asset.decliningRate) / 12);
    }
  }
}
```

---

## API Contract

### Budgets

### `GET /budgets/:year`
**Access:** `budgets.read`  
**Query:** `?propertyId=&departmentId=`

### `POST /budgets`

```json
{
  "fiscalYear": 2025,
  "propertyId": "uuid",
  "glAccountId": "uuid",
  "annualAmount": 120000,
  "monthlyAmounts": { "1": 10000, "2": 10000, "3": 10000, "4": 10000, "5": 10000, "6": 10000,
                      "7": 10000, "8": 10000, "9": 10000, "10": 10000, "11": 10000, "12": 10000 }
}
```

### `GET /budgets/variance`
**Access:** `budgets.read`  
**Query:** `?fiscalYear=2025&propertyId=&month=1`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "glAccountCode": "5100",
      "accountName": "Maintenance Expense",
      "budgetAmount": 10000,
      "actualAmount": 12500,
      "variance": -2500,
      "variancePct": -25,
      "status": "over_budget"
    }
  ]
}
```

---

### Fixed Assets

### `GET /assets`
**Access:** `assets.read`  
**Query:** `?propertyId=&category=&status=active&page=1&limit=20`

### `POST /assets`

```json
{
  "assetNumber": "FA-2025-001",
  "name": "Central Chiller Unit",
  "category": "machinery",
  "propertyId": "uuid",
  "acquisitionDate": "2025-01-15",
  "acquisitionCost": 85000,
  "usefulLifeYears": 15,
  "residualValue": 5000,
  "depreciationMethod": "straight_line",
  "currentLocation": "Basement Plant Room",
  "glAssetAccountId": "uuid",
  "glDepreciationAccountId": "uuid",
  "glAccumDepAccountId": "uuid"
}
```

### `GET /assets/:id`
### `PUT /assets/:id`
### `POST /assets/:id/transfer`

```json
{ "toPropertyId": "uuid", "transferDate": "2025-02-01", "reason": "Redeployment to Tower B" }
```

### `POST /assets/:id/dispose`

```json
{ "disposalDate": "2025-06-30", "disposalAmount": 10000, "reason": "End of useful life — sold" }
```

### `GET /assets/:id/depreciation-schedule`
### `POST /assets/depreciation/run`
**Access:** `assets.admin`  
Manual trigger for monthly depreciation.

---

## UI Screens

```
admin/finance/
├── BudgetPage/
│   └── components/
│       ├── BudgetTable.tsx             # account | annual | monthly breakdown
│       ├── MonthlyBudgetInput.tsx      # spreadsheet-like 12-month input
│       └── BudgetVarianceChart.tsx     # budget vs actual bar chart

└── AssetsPage/
    ├── AssetTable.tsx
    ├── AssetDetailPage/
    │   ├── AssetSummaryCard.tsx        # NBV + depreciation + status
    │   ├── DepreciationScheduleTable.tsx
    │   └── AssetTransferHistory.tsx
    └── DepreciationRunModal.tsx
```

---
---

# Module 3.6 — Banking & Reconciliation

**Phase:** 3  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 3.2, 3.4

---

## DB Schema

```sql
-- Bank accounts
CREATE TABLE bank_accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id      UUID REFERENCES properties(id),
  bank_name        VARCHAR(100) NOT NULL,
  account_name     VARCHAR(200) NOT NULL,
  account_number   VARCHAR(50) NOT NULL,
  account_type     VARCHAR(20) DEFAULT 'current',    -- 'current' | 'savings' | 'fixed_deposit'
  currency         VARCHAR(3) NOT NULL DEFAULT 'USD',
  opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance  NUMERIC(15,2) NOT NULL DEFAULT 0, -- denormalized, updated on each transaction
  swift_code       VARCHAR(20),
  iban             VARCHAR(50),
  branch_name      VARCHAR(100),
  branch_code      VARCHAR(20),
  gl_account_id    UUID REFERENCES gl_accounts(id),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank statement imports
CREATE TABLE bank_statement_imports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  import_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename        VARCHAR(255),
  format          VARCHAR(10) NOT NULL,              -- 'csv' | 'ofx' | 'mt940'
  from_date       DATE NOT NULL,
  to_date         DATE NOT NULL,
  total_credits   NUMERIC(15,2),
  total_debits    NUMERIC(15,2),
  transaction_count SMALLINT,
  status          VARCHAR(20) DEFAULT 'pending',     -- 'pending' | 'matched' | 'reconciled'
  imported_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank statement transaction lines
CREATE TABLE bank_statement_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id         UUID NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  bank_account_id   UUID NOT NULL REFERENCES bank_accounts(id),
  transaction_date  DATE NOT NULL,
  value_date        DATE,
  description       VARCHAR(500),
  reference         VARCHAR(255),
  credit_amount     NUMERIC(15,2) DEFAULT 0,
  debit_amount      NUMERIC(15,2) DEFAULT 0,
  balance           NUMERIC(15,2),
  match_status      VARCHAR(20) DEFAULT 'unmatched',
                    -- 'unmatched' | 'auto_matched' | 'manually_matched' | 'excluded'
  matched_entity_type VARCHAR(30),                   -- 'receipt' | 'payment_voucher'
  matched_entity_id   UUID,
  match_confidence  NUMERIC(5,2),                    -- 0–100% for auto-match
  matched_by        UUID REFERENCES users(id),
  matched_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bsl_import ON bank_statement_lines(import_id);
CREATE INDEX idx_bsl_match ON bank_statement_lines(match_status) WHERE match_status = 'unmatched';

-- Online payment gateway transactions
CREATE TABLE payment_gateway_transactions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  property_id        UUID REFERENCES properties(id),
  gateway            VARCHAR(30) NOT NULL,            -- 'stripe' | 'paytabs' | 'paypal'
  gateway_txn_id     VARCHAR(255) NOT NULL UNIQUE,
  gateway_status     VARCHAR(30) NOT NULL,
  amount             NUMERIC(15,2) NOT NULL,
  currency           VARCHAR(3) NOT NULL,
  fee_amount         NUMERIC(15,2) DEFAULT 0,
  net_amount         NUMERIC(15,2),
  payment_method     VARCHAR(30),                     -- 'card' | 'bank' | 'wallet'
  payer_email        VARCHAR(255),
  payer_name         VARCHAR(200),
  tenant_id          UUID REFERENCES tenants(id),
  invoice_id         UUID REFERENCES invoices(id),
  receipt_id         UUID REFERENCES receipts(id),   -- created on webhook success
  metadata           JSONB DEFAULT '{}',
  initiated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  failed_at          TIMESTAMPTZ,
  failure_reason     TEXT
);
```

### Services

```typescript
// src/modules/banking/reconciliation.service.ts
@Injectable()
export class ReconciliationService {
  async importStatement(dto: ImportStatementDto, file: Buffer): Promise<BankStatementImport> {
    const lines = await this.parseStatement(file, dto.format);

    const importRecord = await this.importRepo.save({
      bankAccountId: dto.bankAccountId,
      companyId: dto.companyId,
      format: dto.format,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      filename: dto.filename,
      totalCredits: lines.filter(l => l.creditAmount > 0).reduce((s, l) => s + l.creditAmount, 0),
      totalDebits: lines.filter(l => l.debitAmount > 0).reduce((s, l) => s + l.debitAmount, 0),
      transactionCount: lines.length,
      importedBy: dto.importedBy,
    });

    // Save lines and attempt auto-match
    for (const line of lines) {
      const saved = await this.lineRepo.save({ ...line, importId: importRecord.id, bankAccountId: dto.bankAccountId });
      await this.autoMatch(saved);
    }

    return importRecord;
  }

  private async autoMatch(line: BankStatementLine): Promise<void> {
    /**
     * Auto-matching algorithm:
     * For CREDIT lines (money in): match against AR receipts
     *   - Exact amount match + reference contains receipt number
     *   - Confidence: 95% if both match, 70% if amount only
     * For DEBIT lines (money out): match against AP payment vouchers
     *   - Same logic
     */
    const isCredit = line.creditAmount > 0;
    const amount = isCredit ? line.creditAmount : line.debitAmount;

    if (isCredit) {
      // Try exact match: amount + date within 3 days
      const receipts = await this.receiptRepo.find({
        where: {
          amount: amount,
          receiptDate: Between(
            addDays(line.transactionDate, -3).toISOString().split('T')[0],
            addDays(line.transactionDate, 3).toISOString().split('T')[0],
          ),
          bankAccountId: line.bankAccountId,
        },
      });

      if (receipts.length === 1) {
        const confidence = line.description?.includes(receipts[0].paymentReference ?? '') ? 95 : 70;
        await this.lineRepo.update(line.id, {
          matchStatus: 'auto_matched',
          matchedEntityType: 'receipt',
          matchedEntityId: receipts[0].id,
          matchConfidence: confidence,
          matchedAt: new Date(),
        });
      }
    }
  }
}

// src/modules/banking/payment-gateway.service.ts
@Injectable()
export class PaymentGatewayService {
  async initiateStripePayment(invoiceId: string, tenantId: string, returnUrl: string): Promise<StripeSession> {
    const invoice = await this.invoiceRepo.findOneOrFail({ where: { id: invoiceId } });

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: invoice.currency.toLowerCase(),
          product_data: { name: `Invoice ${invoice.invoiceNumber}` },
          unit_amount: Math.round(invoice.outstandingAmount * 100), // cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl,
      metadata: { invoiceId, tenantId, companyId: invoice.companyId },
    });

    await this.gatewayTxnRepo.save({
      companyId: invoice.companyId,
      gateway: 'stripe',
      gatewayTxnId: session.id,
      gatewayStatus: 'initiated',
      amount: invoice.outstandingAmount,
      currency: invoice.currency,
      tenantId,
      invoiceId,
    });

    return session;
  }

  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    const event = this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const txn = await this.gatewayTxnRepo.findOneOrFail({ where: { gatewayTxnId: session.id } });

      // Auto-create receipt
      const receipt = await this.receiptsService.create({
        tenantId: txn.tenantId!,
        companyId: txn.companyId,
        receiptDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'online',
        paymentReference: session.payment_intent as string,
        amount: txn.amount,
        currency: txn.currency,
        allocations: [{ invoiceId: txn.invoiceId!, amount: txn.amount }],
        notes: `Stripe payment — ${session.id}`,
      }, 'system');

      await this.gatewayTxnRepo.update(txn.id, {
        gatewayStatus: 'completed',
        receiptId: receipt.id,
        completedAt: new Date(),
      });
    }
  }
}
```

---

## API Contract

### `GET /bank-accounts`
### `POST /bank-accounts`

```json
{
  "bankName": "DBS Bank",
  "accountName": "Acme Tower A — Operating",
  "accountNumber": "001-123456-7",
  "accountType": "current",
  "currency": "SGD",
  "openingBalance": 0,
  "glAccountId": "uuid",
  "propertyId": "uuid"
}
```

### `GET /bank-accounts/:id/balance`
### `POST /bank-accounts/:id/reconcile`
**Content-Type:** `multipart/form-data`  
**Body:** `statement` (CSV/OFX/MT940), `format`, `fromDate`, `toDate`

### `GET /bank-accounts/:id/statement-lines`
**Query:** `?importId=&matchStatus=unmatched`

### `POST /bank-statement-lines/:id/match`

```json
{ "entityType": "receipt", "entityId": "uuid" }
```

### `POST /bank-statement-lines/:id/exclude`

---

### `POST /payments/gateway/initiate`
**Access:** `ar.create` or tenant portal

```json
{
  "invoiceId": "uuid",
  "tenantId": "uuid",
  "returnUrl": "https://app.pms.com/portal/payments"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
    "sessionId": "cs_test_..."
  }
}
```

### `POST /payments/gateway/webhook`
**Access:** Public (Stripe webhook)  
Validates `Stripe-Signature` header before processing.

### `GET /cash-flow`
**Access:** `gl.read`  
**Query:** `?fromDate=2025-01-01&toDate=2025-01-31&propertyId=`

---

## UI Screens

```
admin/banking/
├── BankAccountsPage/
│   └── components/
│       ├── BankAccountCard.tsx         # bank logo + balance + last reconciled date
│       └── CreateBankAccountModal.tsx

├── ReconciliationPage/
│   ├── ReconciliationPage.tsx
│   └── components/
│       ├── ImportStatementButton.tsx   # drag-drop CSV/OFX upload
│       ├── StatementLinesTable.tsx     # transaction date | description | amount | match status
│       ├── MatchStatusBadge.tsx        # Unmatched | Auto-matched | Manually matched
│       ├── UnmatchedLinesPanel.tsx     # left: bank lines | right: system receipts/vouchers
│       ├── MatchConfirmModal.tsx
│       └── ReconciliationSummary.tsx   # matched N / unmatched M / excluded K

└── GatewayTransactionsPage/
    └── GatewayTxnTable.tsx             # gateway | amount | status | invoice
```

---

## State Management (Phase 3 Combined)

```typescript
export const glApi = createApi({
  reducerPath: 'glApi',
  tagTypes: ['GlAccounts', 'JournalEntries', 'FiscalPeriods', 'TrialBalance', 'PnL', 'BalanceSheet'],
  endpoints: (builder) => ({
    getGlAccounts: builder.query<GlAccount[], { accountType?: string }>({
      query: (params) => ({ url: '/gl/accounts', params }),
      providesTags: ['GlAccounts'],
    }),
    createJournalEntry: builder.mutation<JournalEntry, CreateJournalEntryDto>({
      query: (body) => ({ url: '/gl/journal-entries', method: 'POST', body }),
      invalidatesTags: ['JournalEntries'],
    }),
    postJournalEntry: builder.mutation<void, string>({
      query: (id) => ({ url: `/gl/journal-entries/${id}/post`, method: 'POST' }),
      invalidatesTags: ['JournalEntries', 'TrialBalance'],
    }),
    getTrialBalance: builder.query<TrialBalanceRow[], TrialBalanceParams>({
      query: (params) => ({ url: '/gl/trial-balance', params }),
      providesTags: ['TrialBalance'],
    }),
    getPnL: builder.query<ProfitAndLoss, FinancialStatementParams>({
      query: (params) => ({ url: '/gl/reports/pnl', params }),
      providesTags: ['PnL'],
    }),
    getBalanceSheet: builder.query<BalanceSheet, { asOfDate: string; propertyId?: string }>({
      query: (params) => ({ url: '/gl/reports/balance-sheet', params }),
      providesTags: ['BalanceSheet'],
    }),
    getFiscalPeriods: builder.query<FiscalPeriod[], void>({
      query: () => '/gl/fiscal-periods',
      providesTags: ['FiscalPeriods'],
    }),
    closeFiscalPeriod: builder.mutation<void, string>({
      query: (id) => ({ url: `/gl/fiscal-periods/${id}/close`, method: 'POST' }),
      invalidatesTags: ['FiscalPeriods'],
    }),
  }),
});

export const bankingApi = createApi({
  reducerPath: 'bankingApi',
  tagTypes: ['BankAccounts', 'StatementLines', 'GatewayTxns'],
  endpoints: (builder) => ({
    getBankAccounts: builder.query<BankAccount[], void>({
      query: () => '/bank-accounts',
      providesTags: ['BankAccounts'],
    }),
    importStatement: builder.mutation<BankStatementImport, { bankAccountId: string; formData: FormData }>({
      query: ({ bankAccountId, formData }) => ({ url: `/bank-accounts/${bankAccountId}/reconcile`, method: 'POST', body: formData }),
      invalidatesTags: ['StatementLines'],
    }),
    matchStatementLine: builder.mutation<void, { lineId: string; entityType: string; entityId: string }>({
      query: ({ lineId, ...body }) => ({ url: `/bank-statement-lines/${lineId}/match`, method: 'POST', body }),
      invalidatesTags: ['StatementLines'],
    }),
    initiatePayment: builder.mutation<{ checkoutUrl: string }, InitiatePaymentDto>({
      query: (body) => ({ url: '/payments/gateway/initiate', method: 'POST', body }),
    }),
  }),
});

export const assetsApi = createApi({
  reducerPath: 'assetsApi',
  tagTypes: ['Assets', 'DepreciationSchedule', 'Budgets', 'BudgetVariance'],
  endpoints: (builder) => ({
    getAssets: builder.query<PaginatedResponse<FixedAsset>, AssetQueryParams>({
      query: (params) => ({ url: '/assets', params }),
      providesTags: ['Assets'],
    }),
    createAsset: builder.mutation<FixedAsset, CreateAssetDto>({
      query: (body) => ({ url: '/assets', method: 'POST', body }),
      invalidatesTags: ['Assets'],
    }),
    disposeAsset: builder.mutation<void, { id: string; data: DisposeAssetDto }>({
      query: ({ id, data }) => ({ url: `/assets/${id}/dispose`, method: 'POST', body: data }),
      invalidatesTags: ['Assets'],
    }),
    getBudgetVariance: builder.query<BudgetVarianceRow[], BudgetVarianceParams>({
      query: (params) => ({ url: '/budgets/variance', params }),
      providesTags: ['BudgetVariance'],
    }),
    createBudget: builder.mutation<Budget, CreateBudgetDto>({
      query: (body) => ({ url: '/budgets', method: 'POST', body }),
      invalidatesTags: ['Budgets'],
    }),
  }),
});
```
