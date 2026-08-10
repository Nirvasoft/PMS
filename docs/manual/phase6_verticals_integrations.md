# Phase 6 — Vertical Specializations, BI & Integrations
## User Manual & Test Cases

---

## Module 6.1 — Shopping Mall Management

### 6.1.1 Mall Dashboard

**Navigation:** 🔐 Mall → Dashboard (`/admin/mall-dashboard`)

- **KPI Cards:** Total Shops, Occupancy Rate, Monthly GTO, CAM Collections
- **Footfall Counter:** Today's visitor count with hourly trend
- **Revenue Breakdown:** Base rent vs GTO percentage rent
- **Upcoming Events:** Next 5 mall events

### 6.1.2 Shop Directory

**Navigation:** 🔐 Mall → Shops (`/admin/shops`)

- Visual floor plan view of all shops
- List view with search/filter by: Floor, Category, Status, Tenant
- Shop detail with: size, frontage, lease info, GTO history

**Creating a Shop:**
1. Click **+ Add Shop**
2. Enter: Shop Number, Floor, Zone, Area (sqft)
3. Category: F&B, Fashion, Electronics, Services, Entertainment
4. Assign tenant (link to existing lease)
5. Upload shop logo and photos
6. Save

### 6.1.3 GTO (Gross Turnover) Management

**Navigation:** 🔐 Mall → GTO (`/admin/gto`)

- Tenants report monthly sales figures
- **GTO Entry:** Select tenant, Enter month, Enter total sales amount
- System calculates: GTO Rent = Sales × Percentage Rate (from lease)
- Compare GTO Rent vs Base Rent → bill the higher amount (or additional)
- GTO reports with trends per tenant

### 6.1.4 CAM (Common Area Maintenance) Charges

**Navigation:** 🔐 Mall → CAM (`/admin/cam`)

- Define CAM pools: Cleaning, Security, Utilities, Marketing, Insurance
- Set allocation method: Pro-rata by area, Fixed amount, Custom split
- Auto-calculate each tenant's share
- Generate CAM invoices monthly/quarterly
- CAM reconciliation at year-end (actual vs estimated)

### 6.1.5 Mall Events

**Navigation:** 🔐 Mall → Events (`/admin/mall-events`)

- Create events: Holiday promotions, Fashion shows, Food festivals
- Set: Date, Location (atrium, parking lot), Budget, Expected footfall
- Track: Sponsor revenue, Promotional costs, Actual footfall
- Post-event analytics with ROI calculation

### 6.1.6 Footfall Analytics

**Navigation:** 🔐 Mall → Footfall (`/admin/footfall`)

- Real-time visitor counting
- Hourly, daily, weekly, monthly trends
- Peak hour identification
- Zone-level heatmap (which areas get most traffic)
- Correlation with: Events, Weather, Promotions
- Year-over-year comparison

### 6.1.7 POS Integration

**Navigation:** 🔐 Mall → POS (`/admin/pos-integration`)

- Connect tenant POS systems to auto-capture GTO data
- Supported: REST API, file upload, manual entry
- Real-time sales dashboard
- Discrepancy alerts (POS vs reported GTO)

---

## Module 6.2 — Condominium Management

### 6.2.1 Condo Meetings (AGM/EGM)

**Navigation:** 🔐 Condo → Meetings (`/admin/meetings`)

**Creating a Meeting:**
1. Click **+ New Meeting**
2. Type: AGM (Annual General Meeting), EGM (Extraordinary), Board
3. Enter: Title, Date/Time, Location
4. Add **Agenda Items** (each becomes a discussion/resolution topic)
5. Add **Resolutions** to be voted on
6. Save as Draft

**Meeting Actions:**
- **Send Notice** 📧 → Notifies all unit owners with agenda attached
- **Digital Voting** → Unit owners vote For/Against/Abstain on each resolution
- **Submit Proxy** → Owners who can't attend designate a proxy
- **View Results** → Quorum check (are enough owners present?) + vote tallies
- **Publish Minutes** → Upload approved meeting minutes for all to access

### 6.2.2 By-Laws & Violations

**Navigation:** 🔐 Condo → By-Laws (`/admin/bylaws`)

**Tabs:**
- **By-Laws** — List of all property rules with: Number, Title, Content, Category, Status
  - **Edit By-Law:** Update title, content, category, effective date, active toggle
  - Categories: Noise, Pets, Parking, Renovation, Common Area
  
- **Violations** — Reported rule violations
  - Filter by: Status (open, warned, fined, appealing, resolved, closed)
  - **Report Violation:** Select by-law, unit, severity (warning/minor/major), description
  - **Actions per violation:** Fine, Appeal, Resolve
    - **Fine:** Set amount and notes
    - **Appeal:** Submit appeal notes (changes status to "appealing")
    - **Resolve:** Add resolution notes

### 6.2.3 Sinking Fund Management

**Navigation:** 🔐 Condo → Funds (`/admin/funds`)

- Create fund accounts: Sinking Fund, Management Fund, Reserve Fund
- Track contributions and expenditures
- Fund transaction history with GL integration
- Balance projections

### 6.2.4 Smart Meter Management

**Navigation:** 🔐 Condo → Smart Meters (`/admin/smart-meters`)

**Devices Tab:**
- View all IoT meter devices with connection status (online/offline)
- Per device: Serial No., Type (water/electricity/gas), Protocol, Last Reading
- **Actions:**
  - **View Readings** — Historical meter readings with consumption calculation
  - **Sync** — Trigger live reading from IoT device
  - **Config** — Configure device settings:
    - Protocol: Modbus TCP, MQTT, HTTP, LoRa
    - Connection details (host, port, broker, endpoint)
    - Polling interval (minutes)

**Readings Section (appears when a device is selected):**
- Table of readings with: Date, Value, Unit, Consumption, Source
- **Add Manual Reading** — For manual meter reads
- **Generate Invoice** — Create utility invoice from readings for a date range

### 6.2.5 Utility Invoice Generation

1. Select a meter device → View Readings
2. Click **Generate Invoice**
3. Set billing period: From date, To date
4. System calculates consumption from readings
5. Invoice generated with consumption details and tariff applied

---

## Module 6.3 — Business Intelligence & AI

### 6.3.1 Executive Dashboard

**Navigation:** 🔐 Reports → Executive (`/admin/executive-dashboard`)

- Company-wide KPIs across all properties
- Occupancy trends, Revenue trends, Cash flow
- Top/bottom performing properties
- Predictive analytics (AI-powered forecasts)

### 6.3.2 BI Reports (Saved Reports)

**Navigation:** 🔐 Reports → Saved Reports (`/admin/reports`)

**Creating a Report:**
1. Click **+ New Report**
2. Select report type: Occupancy, Revenue, Maintenance, Financial
3. Choose data source and metrics
4. Set filters: Property, Date range, Tenant type
5. Configure chart type: Line, Bar, Pie, Table
6. Preview → Save with name and description

**Report Features:**
- Run saved reports with updated date ranges
- Schedule automatic delivery via email (daily/weekly/monthly)
- Share reports with team members
- Export as PDF or Excel

### 6.3.3 Anomaly Dashboard

**Navigation:** 🔐 Reports → Anomalies (`/admin/anomaly-dashboard`)

- AI-detected anomalies in: Revenue, Occupancy, Maintenance, Utility usage
- Filter by: Severity (high/medium/low), Category, Date range, Status
- **Per anomaly:** Description, Score, Affected entity, Suggested action
- **Actions:**
  - **Mark as False Positive** — Teach the AI it's not actually anomalous
  - **Acknowledge** — Accept and track resolution
  - **Timeline view** — When anomalies occurred over time

---

## Module 6.4 — Enterprise Integrations

### 6.4.1 Integration Management

**Navigation:** 🔐 Settings → Integrations (`/admin/integrations`)

**Supported Systems:**
| System | Category | Use Case |
|--------|----------|----------|
| SAP S/4HANA | ERP | Journal sync, vendor sync |
| Oracle NetSuite | ERP | Financial data exchange |
| Microsoft Dynamics 365 | ERP | Full ERP integration |
| QuickBooks Online | Accounting | Invoice/payment sync |
| Xero | Accounting | GL journal push |
| DocuSign | E-Signature | Lease signing workflow |
| Adobe Acrobat Sign | E-Signature | Document signing |
| Stripe | Payment | Online payment processing |
| PayTabs | Payment | Regional payment gateway |
| BACnet BMS | Building | HVAC, elevator, fire systems |

**Integration Card Actions:**
- **Test** — Verify connection is live
- **Sync** — Trigger manual data sync
- **Logs** — View sync history with success/failure counts
- **Edit** — Change name, sync frequency, active status
- **Entity Map** — View local ↔ external ID mappings
- **Delete** — Remove integration

**Creating an Integration:**
1. Click **+ Add Integration**
2. Select type (e.g., Xero)
3. Enter display name and description
4. Set sync frequency: Realtime, Hourly, Daily
5. Configure credentials (API key, OAuth, etc.)
6. Test connection
7. Save

### 6.4.2 Entity Map Viewer

- View all synced entity mappings between PMS and external system
- Filter by entity type: tenant, invoice, property, unit, payment, vendor, lease
- Each mapping shows: Local ID ↔ External ID, Sync status, Last synced timestamp
- Useful for troubleshooting sync issues

### 6.4.3 Webhook Management

**Navigation:** 🔐 Settings → Webhooks (`/admin/webhooks`)

- Configure outbound webhook endpoints
- Subscribe to events: lease.created, invoice.posted, payment.received, tenant.created, etc.
- System pushes JSON payloads to your endpoint for each event

**Creating a Webhook:**
1. Click **+ Add Webhook**
2. Enter endpoint URL (HTTPS required)
3. Add description
4. Select events to subscribe to (checkboxes)
5. Create → **Webhook Secret** displayed (shown only once — copy and store!)

**Webhook Actions:**
- **Test** — Send test ping payload
- **Edit** — Change URL, events, active status
- **View Deliveries** — See delivery log with HTTP status codes
- **Retry** — Retry failed deliveries
- **Delete** — Remove webhook

### 6.4.4 API Key Management

**Navigation:** 🔐 Settings → API Keys (`/admin/api-keys`)

- Generate API keys for external system access
- Define scopes per key (read-only, read-write, specific modules)
- Key rotation and revocation
- Usage analytics per key

### 6.4.5 BMS (Building Management System)

**Navigation:** 🔐 Integrations → BMS (`/admin/bms`)

- Connect BACnet-compatible building systems
- Monitor: HVAC, Elevators, Fire systems, Lighting, Access Control
- Real-time device status and sensor readings
- Fault detection and alerting
- Energy consumption analytics

---

## Phase 6 — Test Cases (20 Test Cases)

### Mall Management (TC-6.01 to TC-6.05)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-6.01 | Create Shop | 1. Mall → Shops → + Add 2. Shop: "S-101", Floor: 1, Zone: "Fashion Wing" 3. Category: Fashion 4. Save | Shop created. Appears on floor plan. Shows "Vacant" until tenant assigned. | High |
| TC-6.02 | GTO Entry & Rent Calc | 1. GTO → Select tenant "Zara" 2. Month: July 3. Sales: $500,000 4. Rate: 8% 5. Submit | GTO rent = $40,000. If base rent is $25,000, additional GTO rent = $15,000 billed. | Critical |
| TC-6.03 | CAM Allocation | 1. CAM → Create pool "Cleaning" = $50,000 2. Allocate pro-rata by area 3. Generate charges | Each tenant charged proportional to their area. Total allocations = $50,000. Invoices created. | High |
| TC-6.04 | Mall Event ROI | 1. Create event "Summer Sale" 2. Budget: $10,000 3. Event runs 4. Enter: Footfall +30%, Sponsor $5,000 | ROI calculated. Footfall spike visible in analytics. Sponsor revenue tracked. | Medium |
| TC-6.05 | Footfall Report | 1. Go to Footfall Analytics 2. Select "Last Month" 3. View trends | Hourly heatmap displayed. Peak: Saturday 2-4PM. Y-o-Y comparison shows +15% growth. | Medium |

### Condo Management (TC-6.06 to TC-6.12)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-6.06 | Create AGM Meeting | 1. Meetings → + New 2. Type: AGM 3. Add 3 resolutions 4. Save as Draft | Meeting created with agenda and resolutions. Status: "Planned". | High |
| TC-6.07 | Send Meeting Notice | 1. Open planned meeting 2. Click "Send Notice" | All unit owners receive email with agenda. Status → "Notice Sent". Notification logged. | High |
| TC-6.08 | Digital Voting | 1. Meeting status: In Progress 2. Owner votes "For" on Resolution 1 3. Owner votes "Against" on Resolution 2 | Votes recorded. Real-time tally updated. Each owner can vote once per resolution. | Critical |
| TC-6.09 | Meeting Results (Quorum) | 1. Open completed meeting 2. Click "View Results" | Quorum check: 52 of 100 owners present = ✅ Quorum Met. Resolution results shown with pass/fail. | Critical |
| TC-6.10 | Submit Proxy | 1. Owner can't attend 2. Opens meeting 3. Clicks "Submit Proxy" 4. Enters proxy name and ID | Proxy recorded. Proxy person can vote on behalf of owner. | High |
| TC-6.11 | Report Violation | 1. By-Laws tab → Violations → + Report 2. By-Law: Noise after 10PM 3. Unit: C-503 4. Severity: Minor 5. Submit | Violation created. Status: "Open". Resident can see on portal. | High |
| TC-6.12 | Appeal Violation | 1. Resident opens fined violation 2. Clicks "Appeal" 3. Enters appeal notes 4. Submit | Status → "Appealing". Admin notified. Appeal notes visible in violation detail. | Medium |

### Smart Meters & BI (TC-6.13 to TC-6.16)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-6.13 | Sync Smart Meter | 1. Smart Meters → Device list 2. Click "Sync" on Meter #EM-101 | Live reading fetched from IoT device. New reading appears in table. Last polled time updated. | High |
| TC-6.14 | Device Configuration | 1. Click "Config" on device 2. Protocol: MQTT 3. Broker: mqtt://broker.io 4. Topic: meters/101 5. Save | Device config updated. Next poll uses new MQTT settings. | Medium |
| TC-6.15 | Generate Utility Invoice | 1. Select meter device 2. View Readings 3. Click "Generate Invoice" 4. Period: July 1-31 | Invoice created with consumption quantity and calculated amount. Linked to unit's billing. | High |
| TC-6.16 | Anomaly Detection | 1. Go to Anomaly Dashboard 2. Filter: Revenue anomalies 3. Review high-severity item | Anomaly card shows: "Unit B-205 revenue dropped 85% vs avg". Action buttons: False Positive, Acknowledge. | Medium |

### Integrations & Webhooks (TC-6.17 to TC-6.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-6.17 | Add Xero Integration | 1. Integrations → + Add 2. Type: Xero 3. Name: "Xero — Main" 4. Frequency: Daily 5. Create | Integration created. Card shows "Configured" status. Test button available. | High |
| TC-6.18 | Test Connection | 1. Click "Test" on Xero integration 2. Wait for response | Shows "Connected — 245ms" green badge. Or error message with troubleshooting details. | High |
| TC-6.19 | Create Webhook | 1. Webhooks → + Add 2. URL: https://api.myapp.com/webhook 3. Events: lease.created, invoice.posted 4. Create | Webhook created. Secret displayed once. Active status shown. Deliveries tab available. | High |
| TC-6.20 | Edit Webhook Events | 1. Click Edit on webhook 2. Add "payment.received" event 3. Toggle OFF "lease.created" 4. Save | Webhook updated. Now receives payment.received and invoice.posted events only. | Medium |
