# PMS — Phase 6: Vertical Specializations, BI & Integrations
## Developer Specification Index

**Stack:** Node.js 20+ · Express · Prisma · TypeScript · PostgreSQL 15+ · Redis 7+ · Python 3.11 (FastAPI — AI service) · React 18 · Redux Toolkit  
**Timeline:** Months 16–18+  
**Depends On:** Phase 1 + 2 + 3 + 4 + 5 (all modules)  
**Total Effort:** ~13 developer-weeks

---

## Module Index

| File | Modules Covered | Backend | Frontend |
|------|----------------|---------|----------|
| `01_shopping_mall_modules.md` | 6.1 Mall: Shops, GTO, CAM, Events, Footfall | 3 weeks | 1 week |
| `02_condo_modules_and_03_bi_ai.md` | 6.2 Condo + 6.3 BI & AI | 3 weeks | 1.5 weeks |
| `03_enterprise_integrations.md` | 6.4 ERP, Webhooks, API Keys, BMS | 2.5 weeks | 0.5 weeks |

---

## Dependency Graph (Phase 6)

```
Phase 5 (all)
    ├─► 6.1 Mall Modules
    │       ├─► Phase 3.1 Billing (GTO percentage rent invoice)
    │       ├─► Phase 3.4 GL (CAM journal postings)
    │       └─► Phase 4.3 CAM costs (feeds CAM pools)
    ├─► 6.2 Condo Modules
    │       ├─► Phase 2.2 Unit Meters (smart meter extension)
    │       ├─► Phase 3.1 Billing (utility invoice generation)
    │       └─► Phase 3.4 GL (fund transactions)
    ├─► 6.3 BI & AI
    │       ├─► ALL phases (data sources)
    │       └─► External: OpenAI API, Python/Prophet
    └─► 6.4 Enterprise Integrations
            ├─► Phase 3.4 GL (ERP journal push)
            ├─► Phase 3.3 AP (vendor/invoice sync)
            └─► ALL phases (webhook events)
```

Build order: 6.1 (Mall) → 6.2 (Condo) → 6.3 (BI/AI) → 6.4 (Integrations) — can be run in parallel by separate squads.

---

## Cross-Cutting Concerns (Phase 6)

### 1. Feature Flags — Module Activation

Phase 6 modules are activated per company via feature flags in `companies.settings`. The API gateway checks these before routing to module controllers:

```typescript
// src/common/guards/feature-flag.guard.ts
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(@InjectRepository(Company) private companyRepo: Repository<Company>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const companyId = req.user?.companyId;
    const requiredFlag = Reflect.getMetadata('feature_flag', context.getHandler());
    if (!requiredFlag) return true;

    const company = await this.companyRepo.findOne({ where: { id: companyId }, select: ['settings'] });
    const flagValue = company?.settings?.[requiredFlag];

    if (!flagValue) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_ENABLED',
        message: `The ${requiredFlag} feature is not enabled for your account. Please contact support to upgrade.`,
      });
    }
    return true;
  }
}

// Decorator usage on controller class or method:
@FeatureFlag('mall_module_enabled')
@Controller('mall')
export class MallController { ... }

// Feature flag keys in companies.settings:
const FEATURE_FLAGS = {
  MALL_MODULE:        'mall_module_enabled',
  CONDO_MODULE:       'condo_module_enabled',
  BI_AI:              'bi_ai_enabled',
  ENTERPRISE_INTEGRATIONS: 'integrations_enabled',
  SMART_METERS:       'smart_meters_enabled',
  FOOTFALL:           'footfall_enabled',
  DEVELOPER_API:      'developer_api_enabled',
} as const;
```

### 2. AI Microservice Architecture

The Python FastAPI AI service runs as a separate Docker container alongside NestJS:

```yaml
# docker-compose additions for Phase 6:
services:
  ai-service:
    build: ./pms-ai-service
    ports: ['8001:8001']
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SECRET_KEY=${AI_SERVICE_SECRET}
    depends_on: [postgres]

  bacnet-gateway:
    build: ./pms-bacnet-gateway
    network_mode: host               # needs access to BMS local network
    environment:
      - API_BASE_URL=http://api:3000
      - API_KEY=${BACNET_GATEWAY_API_KEY}
```

NestJS calls the AI service via internal HTTP:

```typescript
// src/modules/bi/bi.service.ts
@Injectable()
export class BiService {
  constructor(private readonly http: HttpService, private config: ConfigService) {}

  private get aiServiceUrl() {
    return this.config.get('AI_SERVICE_URL', 'http://ai-service:8001');
  }

  async getOccupancyForecast(propertyId: string, period: string): Promise<ForecastData> {
    const response = await firstValueFrom(
      this.http.post(`${this.aiServiceUrl}/forecast/occupancy`, { propertyId, period: parseInt(period) })
    );
    return response.data;
  }

  async runNlQuery(question: string, companyId: string): Promise<NlqResult> {
    const response = await firstValueFrom(
      this.http.post(`${this.aiServiceUrl}/ai/natural-language-query`, { question, companyId })
    );
    // Log to ai_query_log
    await this.queryLogRepo.save({ companyId, userId: 'current', queryText: question, ...response.data });
    return response.data;
  }
}
```

### 3. Webhook Event Emission Pattern

Every domain service that generates webhook events must call `WebhooksService.emitEvent()`. This is wired via NestJS EventEmitter2 to keep domain services decoupled:

```typescript
// src/common/decorators/emit-webhook.decorator.ts
// Use on service methods to auto-emit webhook after execution:
export const EmitWebhook = (eventType: string): MethodDecorator =>
  (target, key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const result = await original.apply(this, args);
      const companyId = result?.companyId ?? args[0]?.companyId;
      if (companyId) {
        await this.webhooksService.emitEvent(eventType, result, companyId);
      }
      return result;
    };
    return descriptor;
  };

// Usage in any service:
@EmitWebhook('lease.activated')
async activate(leaseId: string, activatedBy: string): Promise<Lease> { ... }

@EmitWebhook('invoice.issued')
async generateInvoiceForSchedule(scheduleId: string): Promise<Invoice> { ... }
```

### 4. ERP Integration Data Flow

```
PMS Event (e.g. invoice issued)
  │
  ▼
IntegrationEventListener (listens to domain events)
  │
  ▼
Check: does company have active ERP integration?
  │
  ├── NO → skip
  └── YES ▼
      Queue Bull job: 'erp-push' { integrationType, entityType, entityId }
        │
        ▼
      Bull Processor:
        1. Load entity from PMS DB
        2. Map to external format via adapter
        3. POST to ERP API
        4. Store entity_map (pms_id ↔ external_id)
        5. Log to integration_sync_logs
        6. On failure: retry 3× with backoff → mark as failed → alert admin
```

### 5. CAM Billing Schedule

```
1st of each month (03:00 AM):
  → Bull job: cam-billing for all active mall properties
  → For each property: generateMonthlyCamBillings(propertyId, month, year)
  → Creates cam_billings records + invoices for each tenant

After fiscal year end (configurable per mall_properties.fiscal_year_start):
  → Admin manually triggers: POST /mall/cam/reconciliation/run
  → Compares estimated billings vs actual cam_cost_entries
  → Creates debit/credit notes for variance
```

### 6. Footfall Analytics Caching

Footfall data is high-volume (hourly per sensor). Redis caching prevents expensive aggregation queries:

```typescript
// Cache keys:
// pms:footfall:daily:{propertyId}:{date}           TTL: 24h (historical) or 5min (today)
// pms:footfall:heatmap:{propertyId}:{date}:{hour}  TTL: 1h
// pms:footfall:trend:{propertyId}:{from}:{to}      TTL: 1h
// pms:footfall:live:{propertyId}                   TTL: 30s (real-time current count)
```

### 7. NLQ Security Controls

The natural language query (NLQ) interface must be hardened against SQL injection and data exfiltration:

```typescript
// Pre-execution checks in NestJS before forwarding to AI service:
async validateNlqRequest(question: string, companyId: string): Promise<void> {
  // 1. Reject questions asking for personal data fields directly
  const sensitiveTerms = ['password', 'password_hash', 'mfa_secret', 'api_key', 'token', 'credentials'];
  if (sensitiveTerms.some(t => question.toLowerCase().includes(t))) {
    throw new ForbiddenException('This query type is not allowed');
  }
  // 2. Rate limit: 20 NLQ calls per user per hour
  const key = `pms:nlq:${companyId}:${userId}`;
  const count = await this.redis.incr(key);
  if (count === 1) await this.redis.expire(key, 3600);
  if (count > 20) throw new TooManyRequestsException('NLQ rate limit exceeded');
}

// AI service SQL validation (Python):
FORBIDDEN_SQL_KEYWORDS = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE']
ALLOWED_TABLES = ['properties', 'units', 'leases', 'tenants', 'invoices', 'receipts',
                  'maintenance_tickets', 'work_orders', 'residents', 'bookings']

def validate_generated_sql(sql: str, company_id: str) -> str:
    upper = sql.upper().strip()
    if not upper.startswith('SELECT'):
        raise ValueError("Only SELECT queries allowed")
    for keyword in FORBIDDEN_SQL_KEYWORDS:
        if keyword in upper:
            raise ValueError(f"Forbidden keyword: {keyword}")
    if f"'{company_id}'" not in sql and f'"{company_id}"' not in sql:
        raise ValueError("Query must be scoped to company")
    return sql
```

### 8. Phase 6 Migration Files

```
migrations/
├── 1700050001-create-mall-properties.ts
├── 1700050002-create-shop-profiles.ts
├── 1700050003-create-commercial-leases.ts
├── 1700050004-create-gto-submissions.ts
├── 1700050005-create-cam-cost-pools.ts
├── 1700050006-create-cam-billings.ts
├── 1700050007-create-cam-reconciliations.ts
├── 1700050008-create-mall-events.ts
├── 1700050009-create-booth-rentals.ts
├── 1700050010-create-footfall-sensors.ts
├── 1700050011-create-footfall-counts.ts
├── 1700050012-create-smart-meter-readings.ts
├── 1700050013-create-smart-meter-devices.ts
├── 1700050014-create-fund-accounts.ts
├── 1700050015-create-fund-transactions.ts
├── 1700050016-create-general-meetings.ts
├── 1700050017-create-meeting-resolutions.ts
├── 1700050018-create-meeting-votes.ts
├── 1700050019-create-bylaws.ts
├── 1700050020-create-bylaw-violations.ts
├── 1700050021-create-bi-forecasts.ts
├── 1700050022-create-bi-anomalies.ts
├── 1700050023-create-ai-query-log.ts
├── 1700050024-create-integration-configs.ts
├── 1700050025-create-integration-sync-logs.ts
├── 1700050026-create-integration-entity-map.ts
├── 1700050027-create-webhook-endpoints.ts
├── 1700050028-create-webhook-deliveries.ts
├── 1700050029-create-api-keys.ts
├── 1700050030-create-bms-devices.ts
├── 1700050031-create-bms-readings.ts
├── 1700050032-seed-phase6-notification-templates.ts
└── 1700050033-seed-feature-flags.ts
```

### 9. Phase 6 Notification Templates

```typescript
export const PHASE6_NOTIFICATION_TEMPLATES = [
  // Mall
  { code: 'gto_submission_reminder',   name: 'GTO Submission Reminder',        channels: ['email', 'in_app'] },
  { code: 'gto_variance_alert',        name: 'GTO High Variance Alert',         channels: ['email', 'in_app'] },
  { code: 'cam_billing_issued',        name: 'CAM Billing Invoice Issued',      channels: ['email', 'in_app'] },
  { code: 'cam_reconciliation_ready',  name: 'CAM Annual Reconciliation',       channels: ['email', 'in_app'] },
  // Condo
  { code: 'smart_meter_offline',       name: 'Smart Meter Offline',            channels: ['in_app'] },
  { code: 'agm_notice',               name: 'AGM/EGM Meeting Notice',          channels: ['email', 'in_app'] },
  { code: 'bylaw_violation_warning',  name: 'By-Law Violation Warning',        channels: ['email', 'in_app'] },
  { code: 'bylaw_violation_fine',     name: 'By-Law Violation Fine Issued',    channels: ['email', 'in_app'] },
  // BI / AI
  { code: 'anomaly_detected',         name: 'Anomaly Detected',               channels: ['email', 'in_app'] },
  { code: 'forecast_ready',           name: 'New Forecast Available',          channels: ['in_app'] },
  // Integrations
  { code: 'integration_sync_failed',  name: 'Integration Sync Failed',         channels: ['email', 'in_app'] },
  { code: 'webhook_endpoint_failing', name: 'Webhook Endpoint Failing',        channels: ['email', 'in_app'] },
  { code: 'bms_device_fault',         name: 'BMS Device Fault',               channels: ['push', 'in_app'] },
];
```

---

## Phase 6 Acceptance Criteria

### Mall Module (6.1)
- [ ] Shop profile created → shows in tenant mix dashboard with correct category breakdown
- [ ] Commercial lease configured with 8% percentage rent, natural breakpoint
- [ ] GTO submitted: percentage rent calculated correctly (verified manually for 3 test cases)
- [ ] GTO reminder cron fires on 15th of month for all tenants with no submission
- [ ] CAM billing generated for January: each tenant's allocation = unit_gla/total_gla × pool_cost
- [ ] CAM annual reconciliation: variance amounts match manual Excel calculation
- [ ] Mall event created, booth rental invoiced → payment tracked
- [ ] Footfall sensor (mock/stub): hourly data pulled, daily total shown in dashboard
- [ ] Footfall vs GTO correlation chart renders with data

### Condo Module (6.2)
- [ ] Modbus TCP mock meter: hourly reading captured, consumption delta calculated
- [ ] Smart meter offline → maintenance ticket auto-created with P2 priority
- [ ] Utility invoice generated from meter readings: consumption × tariff = correct amount
- [ ] Sinking fund contribution recorded → balance updated → GL journal posted
- [ ] AGM created → notice sent to all unit owners → digital vote recorded per resolution
- [ ] Quorum check: meeting marked quorum_met = true when attendees ≥ quorum_percentage × total_units
- [ ] By-law violation: warning issued → fine issued with invoice → appeal submitted
- [ ] Fund expenditure approval workflow: requires approval > threshold

### BI & AI (6.3)
- [ ] Executive summary dashboard: all 5 properties' KPIs aggregated correctly
- [ ] Occupancy forecast: 12-month forecast generated, accuracy_score > 0.85 on staging data
- [ ] NLQ: "What is total rent collected from Tower A in 2025?" → correct SQL + correct answer
- [ ] NLQ: SQL injection attempt blocked ("DROP TABLE") → 403 returned
- [ ] Lease clause review: returns rating + issues + suggestions for 3 test clauses
- [ ] Anomaly detection: billing spike detected for manually inflated test invoice
- [ ] Anomaly acknowledged by admin → acknowledged_at recorded
- [ ] All BI charts render with real Phase 1–5 data (no stubs)

### Enterprise Integrations (6.4)
- [ ] Xero integration: test connection successful → GL journal pushed → visible in Xero sandbox
- [ ] Integration sync log: records_processed, records_created, error_details populated
- [ ] Webhook endpoint created → test event delivered → signature verified correctly
- [ ] Webhook retry: simulated 500 from endpoint → 5 retries with exponential backoff → abandoned
- [ ] API key created → request authenticated with key → scoped permissions enforced
- [ ] BMS device (Modbus mock): 5-minute poll captures reading → stored in bms_readings
- [ ] BMS device offline → fault_active = true → maintenance ticket auto-created
- [ ] Webhook emitted for: lease.activated, invoice.issued, payment.received, ticket.completed

---

## Complete Project Summary — All Phases

| Phase | Timeline | Modules | Spec Lines | Key Deliverables |
|-------|----------|---------|-----------|-----------------|
| 1 | Months 1–3 | 7 | 6,713 | Auth, RBAC, Org, Workflow Engine, Notifications, Documents, Dashboard |
| 2 | Months 4–6 | 6 | 4,555 | Properties, Towers/Units, Tenants, Leases, CRM, Parking |
| 3 | Months 7–9 | 7 | 3,023 | Billing Engine, AR, AP, General Ledger, Budgeting, Fixed Assets, Banking |
| 4 | Months 10–12 | 6 | 3,162 | Reactive & Preventive Maintenance, Facility Assets, Inventory, Housekeeping, Security |
| 5 | Months 13–15 | 5+4 apps | 3,906 | Tenant Portal, Visitor Mgmt, Facility Booking, Community, 4 Flutter Apps |
| 6 | Months 16–18+ | 8 | ~4,500 | Mall GTO/CAM/Footfall, Condo Smart Meters/AGM/By-Laws, BI+AI, ERP/Webhooks/BMS |
| **Total** | **18 months** | **~39** | **~25,859** | **Complete PMS Platform** |

### Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js 20 · Express · Prisma · TypeScript |
| AI/ML Service | Python 3.11 · FastAPI · Prophet · OpenAI API |
| Primary DB | PostgreSQL 15 + PostGIS |
| Cache / Queue | Redis 7 · Bull (job queues) |
| Search | Elasticsearch 8 |
| File Storage | AWS S3 / MinIO |
| Web Frontend | React 18 · TypeScript · Redux Toolkit · Tailwind CSS |
| Mobile Apps | Flutter 3.x · Dart · Riverpod · Firebase |
| Realtime | Socket.IO (WebSocket) |
| Payments | Stripe · PayTabs |
| Auth | JWT · Passport.js · OAuth2 (Google, Azure AD) |
| IoT Protocols | Modbus TCP · MQTT · BACnet/IP |
| DevOps | Docker · Kubernetes · Helm · ArgoCD · GitHub Actions |
| Monitoring | Prometheus · Grafana · ELK Stack · Sentry · Firebase Crashlytics |
| CI/CD Mobile | Melos (monorepo) · Firebase App Distribution · TestFlight |
