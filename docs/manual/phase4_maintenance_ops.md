# Phase 4 — Maintenance & Facility Operations
## User Manual & Test Cases

---

## Module 4.1 — Maintenance Management

### 4.1.1 Maintenance Dashboard

**Navigation:** 🔐 Maintenance → Dashboard (`/admin/maintenance`)

- **Summary Cards:** Open Tickets, In Progress, Overdue, Completed Today
- **Priority Distribution:** Pie chart (Critical/High/Medium/Low)
- **SLA Compliance:** % of tickets resolved within SLA
- **Technician Workload:** Bar chart of assigned tickets per technician

### 4.1.2 Create Maintenance Ticket

**Navigation:** Maintenance → + New Ticket

1. **Source:** Tenant Request, Staff Report, Preventive Maintenance, Inspection
2. **Location:** Select Property → Tower → Unit (or common area)
3. **Category:** Plumbing, Electrical, HVAC, Structural, Cleaning, Other
4. **Priority:** Critical (4h SLA), High (24h), Medium (48h), Low (5 days)
5. **Description:** Detailed issue description
6. **Media:** Upload photos/videos of the issue
7. **Assign:** Auto-assign by skill/availability or manual assignment
8. Click **Create** 📧 → Tenant notified, Technician notified

### 4.1.3 Ticket Lifecycle

```
New → Assigned → In Progress → On Hold → Completed → Verified → Closed
                                  ↓
                            Reopened → In Progress
```

- **In Progress:** Technician clicks "Start Work" in mobile app
- **On Hold:** Waiting for parts, tenant access, or approval
- **Completed:** Technician marks work done, adds notes/photos
- **Verified:** Supervisor verifies quality
- **Closed:** Final closure, satisfaction survey sent to tenant 📧

### 4.1.4 Work Orders

- Linked to maintenance tickets
- Track: Labor hours, Materials used, External contractor costs
- Total cost calculation: Labor rate × hours + material costs + contractor fees
- Cost posted to GL (maintenance expense account)

### 4.1.5 SLA Management

- SLA timers start when ticket is created
- Color-coded countdown: 🟢 On Track, 🟡 Warning (75%), 🔴 Breached
- Auto-escalation on breach: notify supervisor → manager → director
- SLA pause while ticket is "On Hold"

---

## Module 4.2 — Preventive Maintenance

### 4.2.1 PM Schedules

**Navigation:** 🔐 Maintenance → Preventive

- Create recurring maintenance schedules for assets and systems
- **Frequency:** Daily, Weekly, Monthly, Quarterly, Semi-Annual, Annual
- **Examples:** Elevator inspection (monthly), Fire alarm testing (quarterly), HVAC filter change (monthly)

**Creating a PM Schedule:**
1. Click **+ New PM Schedule**
2. Select asset/equipment or common area
3. Set frequency and start date
4. Define checklist items (inspection points)
5. Assign technician or team
6. Enable auto-ticket generation
7. Save

### 4.2.2 PM Execution

- System auto-creates tickets on schedule dates
- Technician receives mobile notification
- Completes checklist items with pass/fail/N-A status
- Uploads inspection photos
- Records meter readings (operating hours, etc.)

### 4.2.3 PM Calendar

- Calendar view showing all upcoming PM tasks
- Color-coded by: Equipment type, Priority, Status
- Drag to reschedule (within constraints)

---

## Module 4.3 — Facility Management

### 4.3.1 Asset Register

**Navigation:** 🔐 Maintenance → Facility

- Complete inventory of all building assets/equipment
- **Categories:** HVAC, Elevators, Fire Systems, Electrical, Plumbing, Generators
- **Per Asset:** Make, Model, Serial No., Install Date, Warranty Expiry, Location
- **Lifecycle:** Active → Maintenance → Decommissioned → Disposed

### 4.3.2 Warranty Tracking

- Track warranty start/end dates per asset
- Alert before warranty expiry (30/60/90 days)
- Log warranty claims and outcomes

---

## Module 4.4 — Inventory & Store Management

### 4.4.1 Inventory Dashboard

**Navigation:** 🔐 Operations → Inventory (`/admin/inventory`)

- **Stock Levels:** Current stock, Reorder point alerts
- **Movement Summary:** Issues, Receipts, Returns this month
- **Top Items:** Most used materials

### 4.4.2 Item Catalog

- Define inventory items: Name, SKU, Category, Unit of Measure
- Set reorder levels and preferred vendors
- Track item costs (FIFO, Weighted Average)

### 4.4.3 Stock Transactions

- **Goods Receipt:** Receive items from PO or direct purchase
- **Issue:** Issue materials to work orders (reduces stock)
- **Transfer:** Move stock between stores/properties
- **Adjustment:** Physical count adjustments with reason codes
- All transactions post to GL inventory accounts

---

## Module 4.5 — Housekeeping Management

### 4.5.1 Cleaning Schedules

**Navigation:** 🔐 Operations → Housekeeping (`/admin/housekeeping`)

- Create cleaning schedules for common areas and units
- Assign cleaning staff with shift patterns
- Track cleaning completion with timestamps

### 4.5.2 Inspection Checklists

- Define cleanliness inspection checklists by area type
- Rating system (1-5 stars or Pass/Fail)
- Photo documentation requirement
- Generate inspection reports

### 4.5.3 Turn-Over Cleaning

- Triggered when tenant moves out
- Checklist: deep clean, carpet, paint touch-up, fixture check
- Move-in readiness approval before new tenant
- Cost tracked against unit

---

## Module 4.6 — Security Management

### 4.6.1 Security Dashboard

**Navigation:** 🔐 Operations → Security (`/admin/security`)

- **Active Incidents:** Count and severity breakdown
- **Patrol Status:** Current patrol progress
- **Access Card Activity:** Today's entries/exits

### 4.6.2 Incident Reporting

1. Click **+ Report Incident**
2. **Type:** Theft, Vandalism, Trespassing, Fire, Medical, Other
3. **Location:** Property, Tower, Floor, Area
4. **Severity:** Critical, High, Medium, Low
5. **Description:** What happened, when, witnesses
6. **Evidence:** Upload photos, CCTV screenshots
7. **Actions Taken:** Initial response description
8. Click **Submit** 📧 → Alerts property manager

### 4.6.3 Patrol Routes

- Define patrol routes with checkpoints
- Guard scans NFC/QR at each checkpoint via mobile app
- Track patrol completion time and missed checkpoints
- Historical patrol logs with gaps highlighted

### 4.6.4 Access Card Management

**Navigation:** Operations → Access Cards (`/admin/access-cards`)

- Issue access cards to tenants, staff, visitors
- Define access zones (building entry, parking, specific floors)
- Time-based restrictions (office hours only, 24/7)
- Card activation/deactivation/replacement
- Access log: who entered where, when

---

## Phase 4 — Test Cases (20 Test Cases)

### Maintenance (TC-4.01 to TC-4.07)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-4.01 | Create Urgent Ticket | 1. Click + New Ticket 2. Category: Plumbing, Priority: Critical 3. Unit: A-205 4. Desc: "Burst pipe flooding unit" 5. Submit | Ticket TKT-2026-00001 created. SLA: 4 hours. Technician notified immediately. Tenant gets SMS + email. | Critical |
| TC-4.02 | Ticket Assignment | 1. Open unassigned ticket 2. Click Assign 3. Select technician "John" | John receives push notification. Ticket status → Assigned. Shows in John's task list. | Critical |
| TC-4.03 | Complete Ticket with Photos | 1. (As technician) Open assigned ticket 2. Click "Start Work" 3. Add notes: "Pipe replaced" 4. Upload 2 photos 5. Mark Complete | Status → Completed. Time logged. Supervisor notified for verification. | High |
| TC-4.04 | SLA Breach Escalation | 1. Create High priority ticket (24h SLA) 2. Do not resolve for 25 hours | SLA shows "Breached" in red. Auto-notification sent to supervisor. Escalation logged. | High |
| TC-4.05 | Work Order Costing | 1. Open completed ticket 2. Add labor: 2 hours × $50/hr 3. Add material: pipe fitting $25 4. Add contractor: $150 | Total cost: $275. Posted to maintenance GL account. Shows on property P&L. | High |
| TC-4.06 | Ticket Reopen | 1. Open closed ticket 2. Click "Reopen" 3. Reason: "Issue recurred" | Status → Reopened → In Progress. New SLA timer starts. History shows reopen event. | Medium |
| TC-4.07 | Maintenance Report | 1. Go to Maintenance → Reports 2. Select property, date range 3. Run | Report shows: total tickets, avg resolution time, SLA compliance %, cost breakdown. Export works. | Medium |

### Preventive Maintenance (TC-4.08 to TC-4.10)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-4.08 | Create PM Schedule | 1. Click + New PM 2. Asset: Elevator #1 3. Frequency: Monthly 4. Checklist: 10 items 5. Assign team | PM schedule created. First ticket auto-generated for next month. Shows on PM calendar. | High |
| TC-4.09 | PM Ticket Execution | 1. Open auto-generated PM ticket 2. Complete all 10 checklist items (8 pass, 2 fail) 3. Submit | PM recorded. Failed items flagged. Corrective maintenance ticket auto-created for failed items. | High |
| TC-4.10 | PM Calendar View | 1. Go to PM → Calendar 2. View current month | All PM tasks shown on correct dates. Color-coded by type. Click opens PM detail. | Medium |

### Inventory (TC-4.11 to TC-4.13)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-4.11 | Goods Receipt | 1. Receive PO #PO-001 2. Enter received quantities 3. Confirm | Stock levels updated. GR linked to PO. GL: DR Inventory, CR GR/IR accrual. | High |
| TC-4.12 | Material Issue to WO | 1. Open work order WO-005 2. Issue: 3× pipe fittings from store 3. Confirm | Stock reduced by 3. Cost posted to WO. Alert if stock falls below reorder level. | High |
| TC-4.13 | Stock Adjustment | 1. Physical count: item X has 45 units 2. System shows 50 3. Create adjustment: -5 with reason "Damage" | Stock corrected to 45. Variance posted to GL. Adjustment audit trail recorded. | Medium |

### Housekeeping & Security (TC-4.14 to TC-4.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-4.14 | Cleaning Schedule | 1. Create daily schedule: Lobby cleaning 8AM-10AM 2. Assign staff "Maria" | Schedule appears on Maria's dashboard. Daily task auto-created. Completion tracked. | Medium |
| TC-4.15 | Turnover Cleaning | 1. Tenant moves out of Unit B-310 2. System triggers turnover cleaning 3. Complete 15-item checklist | Unit status: "Being Cleaned" → "Ready for Move-in". Report generated. Cost logged. | Medium |
| TC-4.16 | Security Incident | 1. Report incident: Vandalism at Parking Level 2 2. Severity: High 3. Upload CCTV screenshot 4. Submit | Incident INC-2026-00001 created. Property manager alerted immediately. Police report section available. | High |
| TC-4.17 | Patrol Route Completion | 1. Guard starts patrol via mobile 2. Scans 8 of 10 checkpoints 3. End patrol | Patrol logged. 80% completion. Missed checkpoints flagged. Supervisor alerted. | Medium |
| TC-4.18 | Issue Access Card | 1. Go to Access Cards 2. Click + New 3. Tenant: "Jane Smith" 4. Zones: Building Entry + Parking 5. Activate | Card issued. Access zones configured. Jane can enter building and parking. Entry logged on swipe. | Medium |
| TC-4.19 | Deactivate Access Card | 1. Select active card 2. Click "Deactivate" 3. Reason: "Tenant moved out" | Card blocked immediately. Any swipe attempt denied. Log entry recorded. | High |
| TC-4.20 | Access Card Report | 1. Go to Security → Access Logs 2. Filter: last 7 days, Building Entry | Report shows all entries with timestamp, card holder, door. Export to CSV works. | Low |
