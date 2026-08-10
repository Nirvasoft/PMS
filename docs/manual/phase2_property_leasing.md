# Phase 2 — Property Structure & Leasing
## User Manual & Test Cases

---

## Module 2.1 — Property Management

### 2.1.1 Property List

**Navigation:** 🔐 Properties → All Properties (`/admin/properties`)

- Card or table view of all managed properties
- Search by name, code, address
- Filter by: Type (commercial, residential, mixed), Status (active, inactive), City
- Sort by occupancy rate, total units, revenue

### 2.1.2 Create Property

**Navigation:** Properties → + Add Property (`/admin/properties/create`)

1. **Basic Info:** Name, Property Code, Type (commercial/residential/mixed-use)
2. **Address:** Street, City, State/Province, Country, ZIP
3. **Geo Location:** Latitude/Longitude (auto-filled from address or manual entry)
4. **Details:** Total area (sqft/sqm), Year built, Number of floors, Parking capacity
5. **Financials:** Currency, Tax rate, Default billing cycle
6. **Media:** Upload property photos (cover image, gallery)
7. Click **Save** → redirected to Property Detail page

### 2.1.3 Property Detail

**Navigation:** Click any property card → (`/admin/properties/:id`)

**Tabs:**
- **Overview** — KPIs (occupancy, revenue, tenant count), location map
- **Towers & Blocks** — Building structures under this property
- **Units** — All units across all towers
- **Amenities** — Swimming pool, gym, parking, etc.
- **Common Areas** — Lobbies, corridors, gardens with area breakdown
- **Documents** — Property-level documents (title deed, insurance, etc.)
- **Settings** — Property-specific configurations

---

## Module 2.2 — Tower, Block & Unit Management

### 2.2.1 Tower/Block Management

**Navigation:** Property Detail → Towers & Blocks tab

**Create Tower:**
1. Click **+ Add Tower/Block**
2. Enter: Name (e.g., "Tower A"), Code, Number of floors, Total units
3. Optionally add: Floor plan image, description
4. Click **Save**

### 2.2.2 Unit Management

**Navigation:** Property Detail → Units tab

**Create Unit:**
1. Click **+ Add Unit**
2. **Basic:** Unit Number, Floor, Tower/Block, Unit Type (apartment/office/retail/storage)
3. **Size:** Area (sqft or sqm), Bedroom count, Bathroom count
4. **Status:** Available, Occupied, Under Maintenance, Reserved
5. **Financials:** Base rent, Service charge, Deposit amount
6. **Amenities:** Balcony, parking slot included, pet-friendly, etc.
7. Click **Save**

**Unit Features:**
- Floor plan viewer
- Unit status indicator (color-coded)
- Linked lease display
- Meter readings (electricity, water, gas)
- Maintenance history for this unit

### 2.2.3 Floor Plan View

- Visual grid layout showing all units per floor
- Color-coded by status: 🟢 Available, 🔴 Occupied, 🟡 Reserved, ⚪ Maintenance
- Click any unit to see quick details popover
- Drag-and-drop floor plan image mapping (optional)

---

## Module 2.3 — Tenant Management

### 2.3.1 Tenant Directory

**Navigation:** 🔐 Tenants → All Tenants (`/admin/tenants`)

- Searchable list with avatar, name, company, email, phone
- Filter by: Type (individual/corporate), Status (active/former/prospect), Property
- Quick view: Active lease count, outstanding balance, KYC status

### 2.3.2 Create Tenant

**Navigation:** Tenants → + New Tenant (`/admin/tenants/new`)

1. **Type:** Individual or Corporate
2. **Personal/Company Info:**
   - Individual: First Name, Last Name, ID Number, Nationality
   - Corporate: Company Name, Registration No., Industry, Tax ID
3. **Contact:** Email, Phone, Emergency Contact
4. **Address:** Permanent address, Correspondence address
5. **KYC Documents:** Upload ID copy, proof of income, references
6. Click **Create** 📧 (sends welcome email if portal access enabled)

### 2.3.3 Tenant Detail

**Navigation:** Click tenant name → (`/admin/tenants/:id`)

**Tabs:**
- **Profile** — Editable personal/company info
- **Leases** — All leases (active, expired, draft) linked to this tenant
- **Invoices** — Billing history, outstanding balance
- **Documents** — Uploaded and received documents
- **Contacts** — Additional contacts (spouse, authorized persons)
- **KYC** — KYC document status and verification
- **History** — Activity timeline, communication log

### 2.3.4 Tenant Merge

**Navigation:** Tenants → Merge (`/admin/tenants/merge`)

- Select two duplicate tenant records
- Preview merged data (choose which fields to keep)
- All linked leases, invoices, documents transferred to surviving record
- Confirm merge (irreversible)

### 2.3.5 KYC Requirements

**Navigation:** Tenants → KYC Requirements (`/admin/tenants/kyc-requirements`)

- Define required documents per tenant type (individual vs corporate)
- Set expiry tracking (e.g., ID renewal every 5 years)
- Dashboard shows KYC compliance % across all tenants

---

## Module 2.4 — Lease Management

### 2.4.1 Lease List

**Navigation:** 🔐 Leases → All Leases (`/admin/leases`)

- Filter by: Status (draft/active/expired/terminated), Property, Tenant, Expiry date range
- View key dates: Start, End, Next renewal, Days remaining
- Color-coded urgency: 🔴 Expiring <30 days, 🟡 <90 days, 🟢 Active

### 2.4.2 Create Lease

**Navigation:** Leases → + New Lease (`/admin/leases/new`)

1. **Parties:** Select Tenant, Select Unit(s)
2. **Term:** Start Date, End Date, Lease Type (fixed/month-to-month/seasonal)
3. **Financials:**
   - Base Rent (monthly/quarterly/annual)
   - Service Charge, Escalation rate (% per year)
   - Security Deposit, Advance rent
   - Late payment penalty (% or fixed)
4. **Billing:** Payment due day, Grace period, Auto-generate invoices toggle
5. **Clauses:** Select from clause library or add custom clauses
6. **Documents:** Upload signed lease agreement
7. Click **Submit for Approval** 🔄 (triggers workflow)

### 2.4.3 Lease Lifecycle

```
Draft → Pending Approval → Approved → Active → Expiring → Expired/Renewed
                                         ↓
                                    Terminated
```

- **Draft** → Lease created but not submitted
- **Pending Approval** → Submitted, awaiting workflow approval
- **Approved** → Ready for activation on start date
- **Active** → Currently running lease
- **Expiring** → Within notification window (configurable: 30/60/90 days)
- **Renewed** → New lease created from renewal action
- **Terminated** → Early termination with penalty calculation

### 2.4.4 Lease Templates

**Navigation:** Leases → Templates (`/admin/leases/templates`)

- Create reusable lease templates with pre-filled clauses and financial terms
- Apply template when creating new lease to auto-populate fields
- Version control on templates

### 2.4.5 Lease Clauses

**Navigation:** Leases → Clauses (`/admin/leases/clauses`)

- Library of standard lease clauses (maintenance responsibilities, insurance, etc.)
- Categorized by: General, Financial, Maintenance, Insurance, Exit
- Each clause has: Title, Body, Category, Required flag

---

## Module 2.5 — CRM & Leasing Pipeline

### 2.5.1 CRM Dashboard

**Navigation:** 🔐 CRM (`/admin/crm`)

- **Pipeline view:** Kanban board of leads moving through stages
- Stages: Lead → Qualified → Viewing Scheduled → Offer Made → Negotiation → Won/Lost
- Drag-and-drop lead cards between stages
- Lead value summary per stage

### 2.5.2 Lead Management

- Create leads from: walk-ins, website inquiries, referrals
- Assign leads to leasing agents
- Track activities: calls, emails, viewings, proposals
- Convert won lead to tenant + lease in one action

---

## Module 2.6 — Parking Management

### 2.6.1 Parking Lot Setup

**Navigation:** 🔐 Admin → Parking (`/admin/parking`)

- Define parking zones (underground, surface, covered)
- Create individual parking slots with numbering
- Assign slots to units or tenants
- Configure rates: monthly, hourly, visitor rates

### 2.6.2 Parking Assignment

- Assign reserved slots to tenants (linked to lease)
- Track visitor parking usage
- Generate parking invoices
- View real-time slot availability map

---

## Phase 2 — Test Cases (20 Test Cases)

### Property Management (TC-2.01 to TC-2.05)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-2.01 | Create Property | 1. Navigate to Properties 2. Click + Add 3. Fill: name "Downtown Tower", type "commercial", address, 25 floors 4. Upload cover image 5. Save | Property created. Appears in list. Detail page shows all fields correctly. | Critical |
| TC-2.02 | Add Tower & Units | 1. Open property detail 2. Create Tower A with 10 floors 3. Bulk-create 100 units (10 per floor) 4. Set types: 80 office, 20 retail | Tower created. 100 units appear in Units tab. Floor plan view shows grid layout. | Critical |
| TC-2.03 | Unit Status Change | 1. Select vacant unit 2. Change status to "Under Maintenance" 3. Add note | Status updated. Unit color changes in floor plan. Status history recorded. | High |
| TC-2.04 | Property Geo Search | 1. Go to property list 2. Open map view 3. Search by city "Dubai" | Only properties in Dubai shown on map. Clicking marker opens property card. | Medium |
| TC-2.05 | Property Delete Guard | 1. Try to delete property with active leases | Deletion blocked. Error: "Cannot delete property with active leases (5 active)." | High |

### Tenant Management (TC-2.06 to TC-2.10)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-2.06 | Create Corporate Tenant | 1. Click + New Tenant 2. Select "Corporate" 3. Fill: company name, registration no, contacts 4. Upload trade license 5. Create | Tenant created. KYC status shows "Pending" until verified. | Critical |
| TC-2.07 | Tenant KYC Verification | 1. Open tenant detail → KYC tab 2. Review uploaded documents 3. Mark each as Verified/Rejected | KYC status updates to "Verified". Green badge shown on tenant list. | High |
| TC-2.08 | Tenant Merge | 1. Go to Tenant Merge 2. Select "John Smith" (2 records) 3. Choose fields to keep 4. Confirm merge | One record remains. All leases/invoices point to surviving record. Old record deleted. | High |
| TC-2.09 | Tenant Search & Filter | 1. Go to tenant list 2. Search "Acme Corp" 3. Filter by status "active" | Only active tenants matching "Acme Corp" displayed. Results update in real-time. | Medium |
| TC-2.10 | Tenant Portal Access | 1. Open tenant detail 2. Enable Portal Access toggle 3. Confirm | Tenant receives portal login credentials via email. Can access tenant portal. | High |

### Lease Management (TC-2.11 to TC-2.16)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-2.11 | Create Fixed-Term Lease | 1. Click + New Lease 2. Select tenant "Acme Corp", unit "A-101" 3. Term: 2 years 4. Rent: $5,000/month 5. Deposit: $15,000 6. Submit for approval | Lease in "Pending Approval". Workflow task created for approver. | Critical |
| TC-2.12 | Lease Approval Flow | 1. Login as Property Manager 2. Approve lease 3. Login as Finance Manager 4. Approve lease | Lease status changes to "Approved" then "Active" on start date. Unit status → Occupied. | Critical |
| TC-2.13 | Lease Renewal | 1. Open expiring lease 2. Click "Renew" 3. New term: 1 year, 5% rent increase 4. Submit | New lease created linked to old lease. Old lease marked "Renewed". Billing auto-updated. | High |
| TC-2.14 | Early Termination | 1. Open active lease 2. Click "Terminate" 3. Set termination date 4. System calculates penalty | Penalty calculated per clause. Lease terminated. Unit released. Final invoice generated. | High |
| TC-2.15 | Lease from Template | 1. Click + New Lease 2. Select template "Standard Office 1Y" | Fields auto-populated: clauses, financial terms. Only tenant/unit/dates need manual entry. | Medium |
| TC-2.16 | Lease Expiry Notification | 1. Create lease expiring in 29 days 2. Run notification scheduler | Property manager and tenant receive "Lease Expiring in 29 days" notification via in-app + email. | Medium |

### CRM & Parking (TC-2.17 to TC-2.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-2.17 | CRM Lead Pipeline | 1. Create lead: "ABC Ltd" interested in retail space 2. Schedule viewing 3. Move to "Offer Made" 4. Convert to Won | Lead progresses through Kanban board. On Win → auto-creates tenant record + draft lease. | High |
| TC-2.18 | Lead Activity Tracking | 1. Open lead detail 2. Log call activity 3. Log email activity with attachment | Activities appear in timeline. Total interaction count shown on lead card. | Medium |
| TC-2.19 | Parking Slot Assignment | 1. Go to Parking 2. Create zone "Underground P1" with 50 slots 3. Assign slot B-12 to tenant "Acme Corp" | Slot marked as reserved. Shows tenant name on parking map. Monthly charge added to billing. | Medium |
| TC-2.20 | Parking Availability | 1. View parking dashboard 2. Filter by zone 3. Check real-time availability | Available/occupied/reserved counts correct. Map shows color-coded slots. | Low |
