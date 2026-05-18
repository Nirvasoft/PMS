# Module 6.2 — Condo & Residential Specific Modules

**Phase:** 6 — Vertical Specializations, BI & Integrations  
**Stack:** NestJS · PostgreSQL · Redis · MQTT/Modbus · React 18  
**Estimated Effort:** 2.5 weeks (2 backend, 0.5 frontend)  
**Feature Flag:** `condo_module_enabled = true` in `companies.settings`

---

## Overview

Residential condominium-specific modules not covered by the core residential leasing stack: smart utility meter management (Modbus TCP/MQTT for IoT meters), sinking fund and management fund ledger, AGM/EGM meeting management with digital voting, and by-laws enforcement with violation ticketing.

---

## DB Schema

```sql
-- Smart meter readings (IoT integration)
CREATE TABLE smart_meter_readings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_id        UUID NOT NULL REFERENCES utility_meters(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  reading_value   NUMERIC(14,4) NOT NULL,
  reading_unit    VARCHAR(20) NOT NULL,             -- 'kWh'|'m3'|'L'
  reading_at      TIMESTAMPTZ NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'manual',
                  -- 'manual'|'smart_meter'|'api'
  is_estimated    BOOLEAN NOT NULL DEFAULT FALSE,
  consumption     NUMERIC(12,4),                   -- delta from previous reading
  billing_triggered BOOLEAN NOT NULL DEFAULT FALSE, -- whether billing was auto-triggered
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_smart_readings_meter ON smart_meter_readings(meter_id, reading_at DESC);
CREATE INDEX idx_smart_readings_billing ON smart_meter_readings(billing_triggered, reading_at DESC)
  WHERE billing_triggered = FALSE;

-- Smart meter device configs (IoT connectivity settings)
CREATE TABLE smart_meter_devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meter_id        UUID NOT NULL REFERENCES utility_meters(id) ON DELETE CASCADE,
  protocol        VARCHAR(20) NOT NULL,             -- 'modbus_tcp'|'mqtt'|'http'|'lora'
  host            VARCHAR(255),                     -- IP for Modbus TCP
  port            SMALLINT,
  modbus_unit_id  SMALLINT,                        -- Modbus slave address
  mqtt_topic      VARCHAR(500),                    -- MQTT topic for readings
  mqtt_broker     VARCHAR(255),
  http_endpoint   VARCHAR(500),
  polling_interval_minutes SMALLINT DEFAULT 60,
  last_polled_at  TIMESTAMPTZ,
  last_reading_at TIMESTAMPTZ,
  connection_status VARCHAR(20) DEFAULT 'unknown', -- 'online'|'offline'|'error'
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sinking fund ledger
CREATE TABLE fund_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  fund_type       VARCHAR(20) NOT NULL,             -- 'sinking_fund'|'management_fund'|'reserve_fund'
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  bank_account_id UUID REFERENCES bank_accounts(id),
  fiscal_year     SMALLINT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fund_account UNIQUE (property_id, fund_type, fiscal_year)
);

-- Fund transactions
CREATE TABLE fund_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fund_account_id UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL,            -- 'contribution'|'expenditure'|'interest'|'transfer'
  amount          NUMERIC(15,2) NOT NULL,
  description     TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  reference_type  VARCHAR(30),                     -- 'invoice'|'receipt'|'approval'|'manual'
  reference_id    UUID,
  unit_id         UUID REFERENCES units(id),        -- for per-unit contributions
  approved_by     UUID REFERENCES users(id),
  gl_journal_id   UUID,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AGM / EGM meetings
CREATE TABLE general_meetings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  property_id         UUID NOT NULL REFERENCES properties(id),
  meeting_type        VARCHAR(10) NOT NULL,          -- 'AGM'|'EGM'
  title               VARCHAR(255) NOT NULL,
  fiscal_year         SMALLINT,
  scheduled_at        TIMESTAMPTZ NOT NULL,
  venue               VARCHAR(255),
  quorum_percentage   NUMERIC(5,2) DEFAULT 30,       -- % of owners needed for quorum
  notice_days_required SMALLINT DEFAULT 14,
  status              VARCHAR(20) NOT NULL DEFAULT 'planned',
                      -- 'planned'|'notice_sent'|'in_progress'|'completed'|'adjourned'
  agenda              JSONB DEFAULT '[]',            -- [{ item, description }]
  minutes_url         VARCHAR(500),
  minutes_published_at TIMESTAMPTZ,
  actual_attendees    SMALLINT,
  quorum_met          BOOLEAN,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meeting resolutions (voting items)
CREATE TABLE meeting_resolutions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id      UUID NOT NULL REFERENCES general_meetings(id) ON DELETE CASCADE,
  resolution_no   SMALLINT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  resolution_type VARCHAR(20) DEFAULT 'ordinary',   -- 'ordinary'|'special'|'unanimous'
  votes_for       SMALLINT DEFAULT 0,
  votes_against   SMALLINT DEFAULT 0,
  votes_abstain   SMALLINT DEFAULT 0,
  total_votes     SMALLINT DEFAULT 0,
  result          VARCHAR(10),                      -- 'passed'|'rejected'|'tied'
  passed_at       TIMESTAMPTZ,
  CONSTRAINT uq_resolution_no UNIQUE (meeting_id, resolution_no)
);

-- Proxy forms
CREATE TABLE meeting_proxies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id      UUID NOT NULL REFERENCES general_meetings(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id),
  owner_name      VARCHAR(200) NOT NULL,
  proxy_name      VARCHAR(200) NOT NULL,
  proxy_id_number VARCHAR(50),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Digital votes
CREATE TABLE meeting_votes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id      UUID NOT NULL REFERENCES general_meetings(id),
  resolution_id   UUID NOT NULL REFERENCES meeting_resolutions(id),
  unit_id         UUID NOT NULL REFERENCES units(id),
  voter_user_id   UUID NOT NULL REFERENCES users(id),
  vote            VARCHAR(10) NOT NULL,             -- 'for'|'against'|'abstain'
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_proxy        BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_id        UUID REFERENCES meeting_proxies(id),
  CONSTRAINT uq_unit_vote_resolution UNIQUE (resolution_id, unit_id)
);

-- By-laws
CREATE TABLE bylaws (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  bylaw_no    VARCHAR(30) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  category    VARCHAR(50),                         -- 'noise'|'pets'|'parking'|'renovation'|'common_area'
  effective_date DATE NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  document_id UUID REFERENCES documents(id),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bylaw_no UNIQUE (property_id, bylaw_no)
);

-- By-law violations
CREATE TABLE bylaw_violations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  bylaw_id        UUID NOT NULL REFERENCES bylaws(id),
  unit_id         UUID NOT NULL REFERENCES units(id),
  resident_id     UUID REFERENCES residents(id),
  violation_no    VARCHAR(30) NOT NULL UNIQUE,
  description     TEXT NOT NULL,
  evidence_urls   TEXT[] DEFAULT '{}',
  severity        VARCHAR(10) DEFAULT 'warning',   -- 'warning'|'minor'|'major'
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
                  -- 'open'|'warned'|'fined'|'appealing'|'resolved'|'closed'
  fine_amount     NUMERIC(12,2) DEFAULT 0,
  invoice_id      UUID REFERENCES invoices(id),
  warned_at       TIMESTAMPTZ,
  appeal_submitted_at TIMESTAMPTZ,
  appeal_notes    TEXT,
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT,
  reported_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Services

```typescript
// src/modules/condo/smart-meter.service.ts
@Injectable()
export class SmartMeterService {
  @Cron('0 * * * *')  // Every hour
  async pollAllSmartMeters(): Promise<void> {
    const devices = await this.deviceRepo.find({ where: { connectionStatus: Not('offline') } });
    for (const device of devices) {
      await this.meterQueue.add('poll-meter', { deviceId: device.id });
    }
  }

  async pollMeter(deviceId: string): Promise<void> {
    const device = await this.deviceRepo.findOneOrFail({ where: { id: deviceId }, relations: ['meter'] });

    try {
      let reading: number;
      switch (device.protocol) {
        case 'modbus_tcp':
          reading = await this.readModbusMeter(device);
          break;
        case 'mqtt':
          reading = await this.readMqttMeter(device);
          break;
        case 'http':
          reading = await this.readHttpMeter(device);
          break;
        default:
          throw new Error(`Unsupported protocol: ${device.protocol}`);
      }

      // Get previous reading to calculate consumption
      const prevReading = await this.readingRepo.findOne({
        where: { meterId: device.meterId },
        order: { readingAt: 'DESC' },
      });
      const consumption = prevReading ? reading - Number(prevReading.readingValue) : 0;

      await this.readingRepo.save({
        meterId: device.meterId,
        unitId: device.meter.unitId,
        propertyId: device.meter.propertyId,
        readingValue: reading,
        readingUnit: device.meter.meterType === 'electricity' ? 'kWh' : 'm3',
        readingAt: new Date(),
        source: 'smart_meter',
        consumption: Math.max(0, consumption),
      });

      await this.deviceRepo.update(device.id, {
        connectionStatus: 'online',
        lastPolledAt: new Date(),
        lastReadingAt: new Date(),
        errorMessage: null,
      });

      // Trigger billing if end of billing cycle
      await this.checkBillingTrigger(device.meter.unitId, device.meter.propertyId);

    } catch (err) {
      await this.deviceRepo.update(device.id, {
        connectionStatus: 'error',
        errorMessage: err.message,
      });
    }
  }

  private async readModbusMeter(device: SmartMeterDevice): Promise<number> {
    const client = new ModbusRTU();
    await client.connectTCP(device.host!, { port: device.port ?? 502 });
    client.setID(device.modbusUnitId ?? 1);
    const data = await client.readInputRegisters(0, 2);  // 32-bit register
    await client.close();
    // Combine two 16-bit registers into one 32-bit float
    const buffer = Buffer.alloc(4);
    buffer.writeUInt16BE(data.data[0], 0);
    buffer.writeUInt16BE(data.data[1], 2);
    return buffer.readFloatBE(0);
  }

  async generateUtilityInvoice(unitId: string, from: Date, to: Date): Promise<Invoice> {
    const meter = await this.meterRepo.findOne({ where: { unitId, meterType: 'electricity', isActive: true } });
    if (!meter) throw new NotFoundException('No active electricity meter for this unit');

    const readings = await this.readingRepo.find({
      where: { meterId: meter.id, readingAt: Between(from, to) },
      order: { readingAt: 'ASC' },
    });

    const totalConsumption = readings.reduce((s, r) => s + Number(r.consumption ?? 0), 0);
    const tariff = await this.getApplicableTariff(unitId, from);
    const amount = totalConsumption * tariff.ratePerUnit;

    return this.billingEngine.createManualInvoice({
      unitId,
      lines: [{
        chargeTypeCode: 'ELECTRICITY',
        description: `Electricity — ${totalConsumption.toFixed(2)} kWh × ${tariff.ratePerUnit}/kWh`,
        quantity: totalConsumption,
        unitPrice: tariff.ratePerUnit,
      }],
    });
  }
}

// src/modules/condo/fund.service.ts
@Injectable()
export class FundService {
  async recordContribution(fundId: string, dto: RecordContributionDto, createdBy: string): Promise<FundTransaction> {
    const txn = await this.txnRepo.save({
      fundAccountId: fundId,
      transactionType: 'contribution',
      amount: dto.amount,
      description: dto.description,
      transactionDate: dto.date,
      unitId: dto.unitId,
      referenceType: 'invoice',
      referenceId: dto.invoiceId,
      createdBy,
    });

    await this.fundRepo.increment({ id: fundId }, 'currentBalance', dto.amount);
    await this.glService.postFundJournal(txn);
    return txn;
  }

  async getFundSummary(propertyId: string, year: number): Promise<FundSummary> {
    const funds = await this.fundRepo.find({ where: { propertyId, fiscalYear: year } });
    return {
      funds: await Promise.all(funds.map(async (f) => ({
        ...f,
        ytdContributions: await this.getYtdAmount(f.id, 'contribution'),
        ytdExpenditures: await this.getYtdAmount(f.id, 'expenditure'),
        projectedYearEnd: await this.projectYearEnd(f.id),
      }))),
    };
  }
}
```

---

## API Contract

### Smart Meters

### `GET /condo/meters/:meterId/readings`
**Query:** `?from=2025-01-01&to=2025-01-31&limit=100`

### `POST /condo/meters/:meterId/readings`
**Access:** `meters.create`

```json
{
  "readingValue": 1250.5,
  "readingAt": "2025-01-31T23:59:00Z",
  "source": "manual",
  "notes": "Manual month-end reading"
}
```

### `POST /condo/meters/:meterId/sync`
**Access:** `meters.manage`  
Manually trigger smart meter poll.

### `GET /condo/meters/devices`
### `POST /condo/meters/:meterId/device`

```json
{
  "protocol": "modbus_tcp",
  "host": "192.168.1.100",
  "port": 502,
  "modbusUnitId": 1,
  "pollingIntervalMinutes": 60
}
```

### `POST /condo/meters/:unitId/generate-invoice`
**Access:** `billing.create`

```json
{ "from": "2025-01-01", "to": "2025-01-31" }
```

---

### Funds

### `GET /condo/funds`
**Query:** `?propertyId=&year=2025`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "fundType": "sinking_fund",
      "name": "2025 Sinking Fund",
      "currentBalance": 285000,
      "ytdContributions": 48000,
      "ytdExpenditures": 12500,
      "projectedYearEnd": 320500,
      "currency": "SGD"
    },
    {
      "id": "uuid",
      "fundType": "management_fund",
      "name": "2025 Management Fund",
      "currentBalance": 42500,
      "ytdContributions": 72000,
      "ytdExpenditures": 68000,
      "currency": "SGD"
    }
  ]
}
```

### `GET /condo/funds/:id/transactions`
**Query:** `?from=&to=&type=contribution`

### `POST /condo/funds/:id/transactions`
**Access:** `funds.manage`

```json
{
  "transactionType": "expenditure",
  "amount": 8500,
  "description": "Lift modernization — Advance payment",
  "transactionDate": "2025-01-15",
  "referenceType": "approval",
  "notes": "Approved at EGM 2025-01-10 Resolution 3"
}
```

---

### AGM / EGM

### `GET /condo/meetings`
**Query:** `?propertyId=&year=2025&meetingType=AGM`

### `POST /condo/meetings`

```json
{
  "propertyId": "uuid",
  "meetingType": "AGM",
  "title": "Annual General Meeting 2025",
  "fiscalYear": 2024,
  "scheduledAt": "2025-03-15T10:00:00Z",
  "venue": "Function Room, Level 3",
  "quorumPercentage": 25,
  "noticeDaysRequired": 14,
  "agenda": [
    { "item": 1, "description": "Confirmation of Minutes from AGM 2024" },
    { "item": 2, "description": "Presentation of Audited Accounts FY2024" },
    { "item": 3, "description": "Approval of Management Budget FY2025" },
    { "item": 4, "description": "Election of Management Committee Members" }
  ]
}
```

### `POST /condo/meetings/:id/send-notice`
**Access:** `meetings.manage`  
Sends meeting notice + proxy form to all unit owners.

### `POST /condo/meetings/:id/resolutions`

```json
{
  "resolutionNo": 1,
  "title": "Approval of Audited Accounts FY2024",
  "description": "To receive and adopt the audited financial statements for FY2024",
  "resolutionType": "ordinary"
}
```

### `POST /condo/meetings/:meetingId/resolutions/:resolutionId/vote`
**Access:** Owner/resident

```json
{ "vote": "for", "isProxy": false }
```

### `GET /condo/meetings/:id/results`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "meetingId": "uuid",
    "title": "Annual General Meeting 2025",
    "status": "completed",
    "actualAttendees": 42,
    "totalUnits": 150,
    "quorumMet": true,
    "resolutions": [
      {
        "resolutionNo": 1,
        "title": "Approval of Audited Accounts FY2024",
        "votesFor": 38,
        "votesAgainst": 2,
        "votesAbstain": 2,
        "totalVotes": 42,
        "result": "passed",
        "passedAt": "2025-03-15T10:45:00Z"
      }
    ]
  }
}
```

### `POST /condo/meetings/:id/minutes`
**Access:** `meetings.manage`

```json
{ "minutesUrl": "https://cdn.pms.com/minutes/AGM-2025.pdf" }
```

---

### By-Laws

### `GET /condo/bylaws`
**Query:** `?propertyId=&category=noise&isActive=true`

### `POST /condo/bylaws`

```json
{
  "propertyId": "uuid",
  "bylawNo": "BL-2025-001",
  "title": "Quiet Hours",
  "content": "No resident shall cause or permit any noise that is audible from outside the unit between 10:00 PM and 8:00 AM on any day.",
  "category": "noise",
  "effectiveDate": "2025-01-01"
}
```

### `GET /condo/violations`
**Query:** `?propertyId=&bylawId=&status=open&unitId=`

### `POST /condo/violations`
**Access:** `violations.create`

```json
{
  "bylawId": "uuid",
  "unitId": "uuid",
  "residentId": "uuid",
  "description": "Loud music at 11:30 PM reported by three neighboring units",
  "severity": "warning",
  "evidenceUrls": ["https://cdn.pms.com/evidence/noise-complaint-20250115.pdf"]
}
```

### `POST /condo/violations/:id/fine`
**Access:** `violations.manage`

```json
{ "fineAmount": 200, "notes": "Second offense within 30 days" }
```

### `POST /condo/violations/:id/appeal`
**Access:** Tenant portal

```json
{ "appealNotes": "The noise was from a one-time celebration ending before 11 PM. Supporting statement from neighbors attached." }
```

---

---

# Module 6.3 — Advanced BI & AI Insights

**Phase:** 6  
**Stack:** NestJS · PostgreSQL · Elasticsearch · OpenAI API · Python (FastAPI — AI microservice) · React 18 · Recharts  
**Estimated Effort:** 3 weeks (2 backend, 1 frontend)  
**Depends On:** All Phase 1–5 modules (data sources), 1.7 (Dashboard framework)

---

## Overview

Elevates the Phase 1 dashboard stub into a full executive BI suite with multi-property portfolio consolidation, drill-down analytics, ML-based forecasting (Prophet), AI lease clause analysis (OpenAI), anomaly detection, and a natural language query interface ("Ask in English").

---

## DB Schema

```sql
-- Saved BI reports / dashboards
CREATE TABLE bi_reports (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  report_type    VARCHAR(50) NOT NULL,             -- 'occupancy'|'revenue'|'maintenance'|'portfolio'|'custom'
  config         JSONB NOT NULL DEFAULT '{}',      -- chart type, dimensions, filters, date range
  is_shared      BOOLEAN DEFAULT FALSE,
  created_by     UUID NOT NULL REFERENCES users(id),
  last_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forecast results (cached ML predictions)
CREATE TABLE bi_forecasts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID REFERENCES properties(id),
  forecast_type   VARCHAR(30) NOT NULL,            -- 'occupancy'|'revenue'|'maintenance_cost'
  model_version   VARCHAR(20),
  forecast_period VARCHAR(10) NOT NULL,            -- '6m'|'12m'
  forecast_data   JSONB NOT NULL,                  -- [{ date, value, lower_bound, upper_bound }]
  accuracy_score  NUMERIC(5,4),                    -- MAPE on holdout set
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_forecast UNIQUE (company_id, property_id, forecast_type, forecast_period)
);

-- AI query log (NLQ interface)
CREATE TABLE ai_query_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  query_text   TEXT NOT NULL,
  generated_sql TEXT,
  result_summary TEXT,
  tokens_used  INTEGER,
  latency_ms   INTEGER,
  was_helpful  BOOLEAN,                            -- user feedback
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anomaly detection results
CREATE TABLE bi_anomalies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID REFERENCES properties(id),
  anomaly_type    VARCHAR(50) NOT NULL,            -- 'billing_spike'|'maintenance_surge'|'occupancy_drop'|'late_payment_risk'
  entity_type     VARCHAR(30),
  entity_id       UUID,
  description     TEXT NOT NULL,
  severity        VARCHAR(10) DEFAULT 'medium',
  metric_value    NUMERIC(15,4),
  expected_value  NUMERIC(15,4),
  deviation_pct   NUMERIC(8,4),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  is_false_positive BOOLEAN DEFAULT FALSE
);
```

### AI Microservice (Python FastAPI)

```python
# ai_service/main.py
# Separate Python microservice for ML/AI operations
# Runs alongside NestJS, called via HTTP from NestJS

from fastapi import FastAPI
from prophet import Prophet
import pandas as pd
import openai
from sqlalchemy import create_engine

app = FastAPI()

@app.post("/forecast/occupancy")
async def forecast_occupancy(request: ForecastRequest):
    """
    Uses Facebook Prophet to forecast occupancy rate.
    Trains on historical monthly occupancy data.
    Returns 6 or 12 month forecast with confidence intervals.
    """
    engine = create_engine(settings.DATABASE_URL)

    # Load historical data
    query = """
        SELECT
            DATE_TRUNC('month', created_at) AS ds,
            COUNT(*) FILTER (WHERE status = 'occupied')::float /
              NULLIF(COUNT(*), 0) * 100 AS y
        FROM units
        WHERE property_id = %(property_id)s
          AND deleted_at IS NULL
        GROUP BY 1
        ORDER BY 1
    """
    df = pd.read_sql(query, engine, params={'property_id': request.property_id})

    if len(df) < 12:
        raise HTTPException(400, "Insufficient historical data (need at least 12 months)")

    model = Prophet(
        seasonality_mode='multiplicative',
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        uncertainty_samples=1000,
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=request.periods, freq='MS')
    forecast = model.predict(future)

    result = forecast[forecast['ds'] > df['ds'].max()][['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
    return {
        "forecastType": "occupancy",
        "propertyId": request.property_id,
        "data": result.to_dict('records'),
        "accuracyScore": evaluate_model(model, df),
    }

@app.post("/forecast/revenue")
async def forecast_revenue(request: ForecastRequest):
    """Revenue forecasting using Prophet on monthly invoice totals."""
    # Similar to occupancy but using invoices.total_amount
    ...

@app.post("/ai/lease-review")
async def review_lease_clause(request: LeaseReviewRequest):
    """
    Uses GPT-4o to analyze lease clauses, flag unusual terms,
    and compare against market standards.
    """
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = """
    You are a commercial real estate lease analyst specializing in property management.
    Analyze the provided lease clause and:
    1. Identify any unusual or potentially unfavorable terms
    2. Flag missing standard protections (e.g. force majeure, HVAC obligations)
    3. Suggest improvements or negotiation points
    4. Rate the clause 1-5 (5=landlord-favorable, 3=balanced, 1=tenant-favorable)
    Respond in JSON: { rating, issues: [], suggestions: [], summary }
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze this lease clause:\n\n{request.clause_text}"},
        ],
        max_tokens=1000,
    )

    return json.loads(response.choices[0].message.content)

@app.post("/ai/natural-language-query")
async def natural_language_query(request: NlqRequest):
    """
    Converts natural language question to SQL, executes it,
    and returns a human-readable summary.
    Text-to-SQL uses GPT-4o with schema context.
    """
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    schema_context = get_schema_context(request.company_id)  # reduced schema for context

    sql_prompt = f"""
    You are a SQL expert for a Property Management System.
    Database schema (relevant tables only):
    {schema_context}

    The user's company_id is: {request.company_id}
    ALWAYS include WHERE company_id = '{request.company_id}' in queries.
    NEVER allow DELETE, UPDATE, INSERT, DROP commands.
    Return ONLY a valid PostgreSQL SELECT query. No explanation.

    Question: {request.question}
    """

    sql_response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": sql_prompt}],
        max_tokens=500,
    )

    generated_sql = sql_response.choices[0].message.content.strip()

    # Validate SQL (whitelist only SELECT)
    if not generated_sql.upper().strip().startswith('SELECT'):
        raise HTTPException(400, "Only SELECT queries are allowed")

    # Execute query with timeout
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text(generated_sql), execution_options={"timeout": 10})
        rows = result.fetchall()
        columns = result.keys()

    # Summarize results in English
    summary_prompt = f"""
    Question: {request.question}
    SQL Result ({len(rows)} rows): {[dict(zip(columns, row)) for row in rows[:20]]}
    Provide a concise 1-3 sentence summary of the result in plain English.
    """
    summary_response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": summary_prompt}],
        max_tokens=200,
    )

    return {
        "question": request.question,
        "sql": generated_sql,
        "rowCount": len(rows),
        "columns": list(columns),
        "rows": [dict(zip(columns, row)) for row in rows[:100]],
        "summary": summary_response.choices[0].message.content,
    }

@app.post("/ai/anomaly-detection")
async def detect_anomalies(request: AnomalyRequest):
    """
    Statistical anomaly detection using Z-score and IQR methods.
    Checks: billing spikes, maintenance surges, occupancy drops, late payment patterns.
    """
    anomalies = []
    engine = create_engine(settings.DATABASE_URL)

    # Check billing anomalies (invoice amounts > 3 std devs from mean)
    billing_df = pd.read_sql("""
        SELECT tenant_id, DATE_TRUNC('month', invoice_date) AS month,
               SUM(total_amount) AS monthly_total
        FROM invoices
        WHERE company_id = %(company_id)s AND invoice_date >= NOW() - INTERVAL '13 months'
        GROUP BY 1, 2
    """, engine, params={'company_id': request.company_id})

    for tenant_id, group in billing_df.groupby('tenant_id'):
        mean, std = group['monthly_total'].mean(), group['monthly_total'].std()
        latest = group.iloc[-1]
        if std > 0 and abs(latest['monthly_total'] - mean) / std > 3:
            anomalies.append({
                'type': 'billing_spike',
                'entityType': 'tenant',
                'entityId': str(tenant_id),
                'metricValue': float(latest['monthly_total']),
                'expectedValue': float(mean),
                'deviationPct': float((latest['monthly_total'] - mean) / mean * 100),
                'severity': 'high' if abs(latest['monthly_total'] - mean) / std > 5 else 'medium',
            })

    return {"anomalies": anomalies, "detectedAt": datetime.utcnow().isoformat()}
```

---

## API Contract (NestJS proxies to Python AI service)

### `GET /bi/executive-summary`
**Access:** `reports.executive`  
**Query:** `?propertyIds=uuid1,uuid2&dateRange=ytd`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "portfolio": {
      "totalProperties": 5,
      "totalUnits": 850,
      "occupancyRate": 88.4,
      "occupancyTrend": "+2.1% vs last quarter",
      "totalRevenueYtd": 12450000,
      "revenueTrend": "+8.3% vs last year",
      "collectionRate": 94.2,
      "openMaintenanceTickets": 38,
      "criticalTickets": 2
    },
    "properties": [
      {
        "propertyId": "uuid",
        "name": "Acme Tower A",
        "occupancyRate": 91.2,
        "revenueYtd": 4850000,
        "collectionRate": 96.8,
        "openTickets": 12
      }
    ],
    "topAlerts": [
      { "type": "lease_expiring", "count": 8, "severity": "warning", "message": "8 leases expiring within 60 days" },
      { "type": "overdue_invoices", "count": 5, "severity": "high", "message": "SGD 28,500 overdue > 30 days" }
    ]
  }
}
```

### `GET /bi/forecasts/occupancy`
**Access:** `reports.executive`  
**Query:** `?propertyId=&period=12m`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "forecastType": "occupancy",
    "period": "12m",
    "currentRate": 88.4,
    "data": [
      { "date": "2025-02-01", "value": 89.1, "lowerBound": 85.2, "upperBound": 93.0 },
      { "date": "2025-03-01", "value": 90.5, "lowerBound": 86.1, "upperBound": 94.9 }
    ],
    "accuracyScore": 0.943,
    "generatedAt": "2025-01-15T06:00:00Z"
  }
}
```

### `GET /bi/forecasts/revenue`
**Access:** `reports.executive`  
**Query:** `?propertyId=&period=6m`

### `POST /ai/lease-review`
**Access:** `leases.read`

```json
{
  "leaseId": "uuid",
  "clauseText": "The Tenant shall be entitled to terminate this Agreement by giving not less than one (1) month written notice to the Landlord at any time after the first six (6) months of the Lease Term, subject to payment of a termination fee equivalent to two (2) months' rent.",
  "context": "residential_singapore"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "rating": 3,
    "issues": [
      "Termination fee of 2 months is above Singapore market average of 1 month for residential",
      "No reciprocal landlord termination clause — asymmetric rights"
    ],
    "suggestions": [
      "Consider reducing termination fee to 1 month for leases > 12 months",
      "Add landlord termination clause with 3-month notice to balance rights",
      "Specify whether termination fee applies to rent or total monthly charges"
    ],
    "summary": "Clause is moderately landlord-favorable. Termination penalty is above market."
  }
}
```

### `POST /ai/query`
**Access:** `reports.executive`

```json
{
  "question": "What is the total revenue collected from Tower A in Q1 2025, broken down by month?"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "question": "Total revenue collected from Tower A in Q1 2025, by month?",
    "summary": "Tower A collected SGD 1,485,000 in Q1 2025. January was the highest at SGD 512,000, followed by February at SGD 488,000, and March at SGD 485,000.",
    "rowCount": 3,
    "columns": ["month", "total_collected"],
    "rows": [
      { "month": "2025-01-01", "total_collected": 512000 },
      { "month": "2025-02-01", "total_collected": 488000 },
      { "month": "2025-03-01", "total_collected": 485000 }
    ]
  }
}
```

### `GET /bi/anomalies`
**Access:** `reports.executive`  
**Query:** `?propertyId=&acknowledged=false`

### `POST /bi/anomalies/:id/acknowledge`

### `GET /bi/reports`
### `POST /bi/reports`
### `GET /bi/reports/:id/run`

---

## UI Screens (6.2 + 6.3)

```
admin/condo/
├── SmartMeterPage/
│   └── components/
│       ├── MeterReadingsChart.tsx      # line chart: readings over time
│       ├── ConsumptionSummaryCard.tsx  # current month kWh/m3 + cost estimate
│       ├── SmartMeterStatus.tsx        # online/offline/error badges
│       └── ManualReadingModal.tsx

├── FundsPage/
│   └── components/
│       ├── FundBalanceCard.tsx
│       ├── FundTransactionsTable.tsx
│       └── AddTransactionModal.tsx

├── MeetingsPage/
│   └── components/
│       ├── MeetingCard.tsx             # meeting type + date + quorum status
│       ├── CreateMeetingModal.tsx
│       ├── AgendaBuilder.tsx
│       ├── ResolutionVoteCard.tsx      # for/against/abstain bars
│       └── VotingModal.tsx             # owner casts digital vote

└── ByLawsPage/
    └── components/
        ├── ByLawTable.tsx
        ├── ViolationTable.tsx
        └── CreateViolationModal.tsx

admin/bi/
├── ExecutiveDashboard/
│   └── components/
│       ├── PortfolioKpiRow.tsx         # occupancy | revenue | collection | tickets
│       ├── PropertyPerformanceTable.tsx # sortable by any KPI
│       ├── AlertsPanel.tsx             # top alerts requiring attention
│       ├── OccupancyForecastChart.tsx  # recharts line + confidence band
│       └── RevenueForecastChart.tsx

├── NlqPage/
│   └── components/
│       ├── NlqInput.tsx                # large search bar "Ask anything..."
│       ├── NlqResultTable.tsx          # query result table
│       ├── NlqSummaryBanner.tsx        # AI-generated plain English summary
│       ├── NlqQueryHistory.tsx         # past queries in session
│       └── SuggestedQuestions.tsx      # pre-built question chips

├── AnomalyDashboard/
│   └── components/
│       ├── AnomalyCard.tsx             # type + severity + deviation % + acknowledge btn
│       └── AnomalyTimeline.tsx

└── LeaseReviewPanel/
    └── components/
        ├── ClauseInput.tsx             # large text area
        ├── ReviewResultCard.tsx        # rating stars + issues + suggestions
        └── ReviewHistory.tsx
```

---

## State Management (6.2 + 6.3)

```typescript
export const condoApi = createApi({
  reducerPath: 'condoApi',
  tagTypes: ['SmartReadings', 'Funds', 'Meetings', 'ByLaws', 'Violations'],
  endpoints: (builder) => ({
    getMeterReadings: builder.query<SmartMeterReading[], { meterId: string; from: string; to: string }>({
      query: ({ meterId, ...params }) => ({ url: `/condo/meters/${meterId}/readings`, params }),
      providesTags: ['SmartReadings'],
    }),
    addMeterReading: builder.mutation<SmartMeterReading, { meterId: string; data: AddReadingDto }>({
      query: ({ meterId, data }) => ({ url: `/condo/meters/${meterId}/readings`, method: 'POST', body: data }),
      invalidatesTags: ['SmartReadings'],
    }),
    getFunds: builder.query<FundAccount[], { propertyId: string; year: number }>({
      query: (p) => ({ url: '/condo/funds', params: p }),
      providesTags: ['Funds'],
    }),
    getMeetings: builder.query<GeneralMeeting[], { propertyId: string }>({
      query: (p) => ({ url: '/condo/meetings', params: p }),
      providesTags: ['Meetings'],
    }),
    createMeeting: builder.mutation<GeneralMeeting, CreateMeetingDto>({
      query: (body) => ({ url: '/condo/meetings', method: 'POST', body }),
      invalidatesTags: ['Meetings'],
    }),
    voteResolution: builder.mutation<void, { meetingId: string; resolutionId: string; vote: string }>({
      query: ({ meetingId, resolutionId, vote }) => ({
        url: `/condo/meetings/${meetingId}/resolutions/${resolutionId}/vote`, method: 'POST', body: { vote },
      }),
      invalidatesTags: ['Meetings'],
    }),
    getByLaws: builder.query<ByLaw[], { propertyId: string }>({
      query: (p) => ({ url: '/condo/bylaws', params: p }),
      providesTags: ['ByLaws'],
    }),
    getViolations: builder.query<PaginatedResponse<ByLawViolation>, ViolationQueryParams>({
      query: (p) => ({ url: '/condo/violations', params: p }),
      providesTags: ['Violations'],
    }),
  }),
});

export const biApi = createApi({
  reducerPath: 'biApi',
  tagTypes: ['ExecutiveSummary', 'Forecasts', 'Anomalies', 'NlqResults'],
  endpoints: (builder) => ({
    getExecutiveSummary: builder.query<ExecutiveSummary, ExecutiveSummaryParams>({
      query: (p) => ({ url: '/bi/executive-summary', params: p }),
      providesTags: ['ExecutiveSummary'],
    }),
    getOccupancyForecast: builder.query<ForecastData, { propertyId?: string; period: string }>({
      query: (p) => ({ url: '/bi/forecasts/occupancy', params: p }),
      providesTags: ['Forecasts'],
    }),
    getRevenueForecast: builder.query<ForecastData, { propertyId?: string; period: string }>({
      query: (p) => ({ url: '/bi/forecasts/revenue', params: p }),
      providesTags: ['Forecasts'],
    }),
    reviewLeaseClause: builder.mutation<LeaseReviewResult, LeaseReviewDto>({
      query: (body) => ({ url: '/ai/lease-review', method: 'POST', body }),
    }),
    runNlQuery: builder.mutation<NlqResult, { question: string }>({
      query: (body) => ({ url: '/ai/query', method: 'POST', body }),
      invalidatesTags: ['NlqResults'],
    }),
    getAnomalies: builder.query<BiAnomaly[], { propertyId?: string; acknowledged?: boolean }>({
      query: (p) => ({ url: '/bi/anomalies', params: p }),
      providesTags: ['Anomalies'],
    }),
    acknowledgeAnomaly: builder.mutation<void, string>({
      query: (id) => ({ url: `/bi/anomalies/${id}/acknowledge`, method: 'POST' }),
      invalidatesTags: ['Anomalies'],
    }),
  }),
});
```
