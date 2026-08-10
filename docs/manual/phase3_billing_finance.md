# Phase 3 — Billing & Financial Management
## User Manual & Test Cases

---

## Module 3.1 — Billing Engine

### 3.1.1 Billing Dashboard

**Navigation:** 🔐 Finance → Billing (`/admin/billing`)

- **Summary Cards:** Total billed this month, Collected, Outstanding, Overdue
- **Charge schedule calendar** showing upcoming bill generation dates
- **Auto-billing status:** Enabled leases vs manual billing

### 3.1.2 Charge Schedules

Charge schedules define recurring billing items linked to leases:

- **Base Rent** — Monthly/quarterly/annual as per lease
- **Service Charge** — Common area maintenance fees
- **Utility Charges** — Metered electricity, water, gas
- **Parking Fees** — Monthly parking slot charges
- **Custom Charges** — Any additional recurring fees

**Creating a Charge Schedule:**
1. Open a lease detail → Billing tab
2. Click **+ Add Charge**
3. Select charge type, amount, frequency, start/end date
4. Enable **Auto-Generate Invoice** toggle
5. Save

### 3.1.3 Invoice Generation

**Auto-Generation:**
- System generates invoices on scheduled dates (1st of month by default)
- Invoice includes all active charge schedules for the billing period
- PDF invoice auto-attached and emailed to tenant 📧

**Manual Generation:**
1. Go to Billing → Generate Invoices
2. Select property, billing period, tenants
3. Preview invoices before confirming
4. Click **Generate** → Invoices created in "Draft" status
5. Click **Post** to finalize and send to tenants

### 3.1.4 Invoice Lifecycle

```
Draft → Posted → Partially Paid → Paid → Void
                    ↓
                 Overdue (past due date)
```

### 3.1.5 Late Fee Calculation

- Configurable per lease: percentage or fixed amount
- Grace period (e.g., 5 days after due date)
- Auto-applied or manual application
- Compounding options (simple or compound interest)

---

## Module 3.2 — Accounts Receivable (AR)

### 3.2.1 AR Dashboard

**Navigation:** 🔐 Finance → AR (`/admin/ar`)

- **Aging Summary:** Current, 30 days, 60 days, 90 days, 120+ days
- **Collection rate** trend chart
- **Top debtors** list with outstanding amounts

### 3.2.2 Receipt Recording

1. Click **+ Record Receipt**
2. Select tenant
3. Enter: Amount, Payment Method (cash/cheque/bank transfer/card), Reference No.
4. **Auto-allocate** to oldest invoices or **manually select** invoices
5. Upload payment proof (cheque image, bank slip)
6. Click **Save** → Receipt generated, Invoices updated

### 3.2.3 Credit Notes & Adjustments

- Issue **credit notes** for overcharges, goodwill, or errors
- Link credit note to original invoice
- Apply credit to future invoices or refund
- Requires approval for amounts above configurable threshold 🔄

### 3.2.4 AR Aging Report

- Breakdowns by property, tenant, unit
- Drill-down from aging bucket to individual invoices
- Export to Excel/PDF
- Schedule weekly aging email to finance team

---

## Module 3.3 — Accounts Payable (AP)

### 3.3.1 AP Dashboard

**Navigation:** 🔐 Finance → AP (`/admin/ap`)

- **Pending bills** count and total
- **Payment due** this week/month
- **Vendor performance** summary

### 3.3.2 Vendor Management

1. Click **+ Add Vendor**
2. Enter: Company Name, Contact Person, Email, Phone
3. Bank Details: Account Name, Number, Bank, SWIFT/routing code
4. Tax Info: Tax ID, Tax classification
5. Payment Terms: Net 30, Net 60, etc.
6. Save

### 3.3.3 Bill Entry & Payment

**Create Bill:**
1. Select vendor
2. Enter: Bill Number, Bill Date, Due Date
3. Add line items (description, quantity, unit price, tax, GL account)
4. Upload bill document
5. Submit for Approval 🔄

**Process Payment:**
1. Open approved bill
2. Click **Pay**
3. Select bank account, payment method
4. Enter check number or transfer reference
5. Confirm payment → Bill status: Paid, GL entries posted

### 3.3.4 Purchase Requisitions

- Create PRs for maintenance materials or services
- Multi-step approval workflow 🔄
- Convert approved PR to Purchase Order (PO)
- 3-way matching: PO ↔ Goods Receipt ↔ Vendor Bill

---

## Module 3.4 — General Ledger (GL)

### 3.4.1 Chart of Accounts (COA)

**Navigation:** 🔐 Finance → GL (`/admin/gl`)

- Hierarchical account structure (Assets, Liabilities, Equity, Revenue, Expenses)
- Standard COA templates available on first setup
- Add custom accounts under any category
- Account attributes: code, name, type, currency, is-header, is-active

### 3.4.2 Journal Entries

**Manual Journal Entry:**
1. Click **+ New Journal Entry**
2. Enter: Date, Reference, Description
3. Add lines: Account, Debit, Credit, Description
4. System validates **debits = credits** (balanced)
5. Submit → Posted to GL

**Auto-Posted Journals:**
All financial transactions auto-post balanced journal entries:
- Invoices → DR Receivable, CR Revenue
- Receipts → DR Bank, CR Receivable
- Bills → DR Expense, CR Payable
- Payments → DR Payable, CR Bank

### 3.4.3 Financial Reports

- **Trial Balance** — All accounts with debit/credit balances
- **Income Statement** (P&L) — Revenue minus expenses for a period
- **Balance Sheet** — Assets, Liabilities, Equity at a point in time
- **Cash Flow Statement** — Operating, investing, financing activities
- All reports: filterable by date range, property, department

### 3.4.4 Fiscal Year Management

- Define fiscal year start/end dates
- Period open/close controls (prevent backdated entries)
- Year-end closing process with retained earnings posting

---

## Module 3.5 — Budgeting

### 3.5.1 Budget Creation

1. Navigate to Finance → Budgeting
2. Select fiscal year and budget category
3. Enter monthly budget amounts per GL account
4. Set budget type: Operating, Capital, or Project
5. Submit for approval 🔄

### 3.5.2 Budget vs Actual

- Real-time comparison of budgeted vs actual spending
- Variance analysis: amount and percentage
- Alerts when spending exceeds budget threshold (e.g., 80%)
- Drill-down from budget line to actual transactions

---

## Module 3.6 — Fixed Assets & Banking

### 3.6.1 Asset Register

**Navigation:** 🔐 Finance → Assets (`/admin/assets`)

- Record fixed assets: furniture, equipment, vehicles, buildings
- Track: Acquisition cost, depreciation method, useful life, salvage value
- Auto-calculate monthly depreciation
- Asset disposal with GL impact

### 3.6.2 Banking & Reconciliation

**Navigation:** 🔐 Finance → Banking (`/admin/banking`)

- Link bank accounts
- Import bank statements (CSV/OFX)
- Auto-matching of bank transactions to AR receipts / AP payments
- Manual matching for unmatched items
- Reconciliation report showing matched/unmatched items

---

## Phase 3 — Test Cases (20 Test Cases)

### Billing (TC-3.01 to TC-3.05)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-3.01 | Auto-Generate Monthly Invoices | 1. Ensure 3 active leases with auto-billing ON 2. Run invoice generation for current month | 3 invoices created in "Draft". Each contains base rent + service charge line items. Totals correct. | Critical |
| TC-3.02 | Post & Email Invoice | 1. Open draft invoice 2. Click "Post" 3. Confirm | Invoice status → "Posted". PDF generated. Email sent to tenant with PDF attachment. GL entries posted. | Critical |
| TC-3.03 | Late Fee Auto-Apply | 1. Create invoice due 2026-07-01 2. Advance date past grace period (5 days) 3. Run late fee job | Late fee line item added. Amount = 2% of overdue amount. Invoice total updated. | High |
| TC-3.04 | Credit Note | 1. Create credit note for $500 on invoice INV-001 2. Approve | Credit note created. Invoice balance reduced by $500. GL reversal posted. | High |
| TC-3.05 | Void Invoice | 1. Select posted invoice 2. Click "Void" 3. Enter reason | Invoice voided. All GL entries reversed. Cannot be un-voided. | High |

### AR & AP (TC-3.06 to TC-3.11)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-3.06 | Record Cash Receipt | 1. Click + Record Receipt 2. Tenant: "Acme Corp" 3. Amount: $5,000 4. Method: Bank Transfer 5. Auto-allocate | Receipt recorded. Oldest invoice partially/fully settled. AR balance updated. Bank GL credited. | Critical |
| TC-3.07 | Partial Payment | 1. Invoice total: $10,000 2. Record receipt: $6,000 | Invoice status: "Partially Paid". Balance shows $4,000 remaining. | High |
| TC-3.08 | AR Aging Report | 1. Go to AR → Aging Report 2. Select all properties 3. Run | Report shows correct buckets. 30+ day amounts match overdue invoices. Export works. | High |
| TC-3.09 | Create Vendor Bill | 1. Add vendor "Fix-It Plumbing" 2. Create bill: $2,500, due Net 30 3. Add 2 line items 4. Submit | Bill created in "Pending" status. Approval task created. GL lines preview shown. | Critical |
| TC-3.10 | AP Payment | 1. Open approved bill 2. Click Pay 3. Select bank account 4. Enter check #1234 | Bill status → Paid. Bank GL debited. AP GL credited. Check number recorded. | Critical |
| TC-3.11 | Purchase Requisition Flow | 1. Create PR for $800 maintenance supplies 2. Manager approves 3. Convert to PO 4. Receive goods 5. Match to vendor bill | Full 3-way match completed. PO/GR/Bill linked. Inventory updated. | High |

### GL & Finance (TC-3.12 to TC-3.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-3.12 | Manual Journal Entry | 1. Click + New JE 2. DR Office Expense $1,000 / CR Cash $1,000 3. Post | JE posted. Trial balance reflects changes. Cannot delete posted JE. | High |
| TC-3.13 | Unbalanced JE Rejection | 1. Create JE: DR $1,000 / CR $999 2. Try to post | System rejects: "Debits ($1,000) ≠ Credits ($999). Entry must be balanced." | Critical |
| TC-3.14 | Trial Balance | 1. Go to GL → Trial Balance 2. Select date range 3. Run | All accounts listed. Total debits = Total credits. Drill-down to individual transactions works. | High |
| TC-3.15 | Income Statement | 1. Go to GL → P&L 2. Select fiscal year 3. Run | Revenue and expense accounts shown. Net income calculated correctly. Comparative period available. | High |
| TC-3.16 | Budget Creation | 1. Create operating budget for FY2026 2. Set monthly amounts for 10 GL accounts 3. Submit | Budget saved. Approval requested. After approval, appears in budget list. | Medium |
| TC-3.17 | Budget vs Actual Alert | 1. Budget: $5,000 for Office Supplies 2. Post $4,500 expense 3. Check alert | Warning triggered: "Office Supplies at 90% of budget ($4,500/$5,000)." | Medium |
| TC-3.18 | Asset Depreciation | 1. Add asset: Office Furniture, $12,000, straight-line, 5 years 2. Run monthly depreciation | Monthly depreciation = $200 posted. Accumulated depreciation updated. Net book value correct. | Medium |
| TC-3.19 | Bank Reconciliation | 1. Import bank statement (CSV) 2. System auto-matches 8 of 10 transactions 3. Manually match remaining 2 | Reconciliation complete. Matched items linked to AR/AP records. Discrepancies flagged. | High |
| TC-3.20 | Fiscal Year Close | 1. Go to GL → Fiscal Year 2. Click "Close FY2025" 3. System posts closing entries | Revenue/expense accounts zeroed to Retained Earnings. FY2025 periods locked. FY2026 opens. | High |
