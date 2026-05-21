# Module 6.4 — Enterprise Integrations

**Phase:** 6 — Vertical Specializations, BI & Integrations  
**Stack:** NestJS · PostgreSQL · Redis · Bull · React 18  
**Estimated Effort:** 3 weeks (2.5 backend, 0.5 frontend)  
**Depends On:** Module 3.4 (GL), 3.3 (AP), 2.4 (Lease), 1.6 (Documents)

---

## Overview

Connects PMS to external enterprise systems via standardized adapters: ERP (SAP, Oracle NetSuite, Microsoft Dynamics 365), accounting software (QuickBooks, Xero), smart building BMS (BACnet, Modbus), e-signature providers (DocuSign, Adobe Sign), and a developer-facing Open API with webhook delivery.

**Adapter pattern:** Every integration is behind an interface. Adding a new ERP system = implement the adapter, register it — no changes to core modules.

---

## DB Schema

```sql
-- Integration configurations (one per integration type per company)
CREATE TABLE integration_configs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_type  VARCHAR(50) NOT NULL,
                    -- 'sap'|'netsuite'|'dynamics365'|'quickbooks'|'xero'
                    -- |'docusign'|'adobesign'|'bacnet_bms'|'stripe'|'paytabs'
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  config            JSONB NOT NULL DEFAULT '{}',   -- provider-specific config (encrypted fields)
  credentials       JSONB NOT NULL DEFAULT '{}',   -- encrypted OAuth tokens / API keys
  status            VARCHAR(20) DEFAULT 'configured',
                    -- 'configured'|'active'|'error'|'disabled'
  last_sync_at      TIMESTAMPTZ,
  last_error        TEXT,
  sync_frequency    VARCHAR(20) DEFAULT 'realtime', -- 'realtime'|'hourly'|'daily'
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_integration UNIQUE (company_id, integration_type)
);

-- Integration sync log (full audit of every sync operation)
CREATE TABLE integration_sync_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id    UUID NOT NULL REFERENCES integration_configs(id) ON DELETE CASCADE,
  sync_type         VARCHAR(50) NOT NULL,           -- 'gl_journal'|'ap_invoice'|'vendor'|'asset'|'full_sync'
  direction         VARCHAR(10) NOT NULL,           -- 'push'|'pull'|'bidirectional'
  status            VARCHAR(20) NOT NULL,           -- 'success'|'partial'|'failed'
  records_processed INTEGER DEFAULT 0,
  records_created   INTEGER DEFAULT 0,
  records_updated   INTEGER DEFAULT 0,
  records_failed    INTEGER DEFAULT 0,
  error_details     JSONB DEFAULT '[]',
  duration_ms       INTEGER,
  initiated_by      VARCHAR(20) DEFAULT 'cron',     -- 'cron'|'user'|'webhook'
  initiated_user_id UUID REFERENCES users(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- Entity mapping (local PMS ID ↔ external system ID)
CREATE TABLE integration_entity_map (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id    UUID NOT NULL REFERENCES integration_configs(id) ON DELETE CASCADE,
  entity_type       VARCHAR(50) NOT NULL,           -- 'gl_account'|'vendor'|'journal_entry'|'invoice'
  pms_id            UUID NOT NULL,
  external_id       VARCHAR(255) NOT NULL,
  external_ref      VARCHAR(255),                   -- human-readable ref in external system
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entity_map UNIQUE (integration_id, entity_type, pms_id)
);

CREATE INDEX idx_entity_map_pms ON integration_entity_map(integration_id, entity_type, pms_id);

-- Outbound webhooks (developer API)
CREATE TABLE webhook_endpoints (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url             VARCHAR(1000) NOT NULL,
  secret          VARCHAR(255) NOT NULL,            -- HMAC signing secret
  description     VARCHAR(255),
  events          TEXT[] NOT NULL DEFAULT '{}',     -- subscribed event types
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count   SMALLINT DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook delivery log
CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  http_status     SMALLINT,
  response_body   TEXT,
  attempt_count   SMALLINT DEFAULT 1,
  status          VARCHAR(20) DEFAULT 'pending',    -- 'pending'|'delivered'|'failed'|'abandoned'
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

-- Developer API keys
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  key_hash        VARCHAR(255) NOT NULL UNIQUE,     -- SHA-256 of raw key
  key_prefix      VARCHAR(10) NOT NULL,             -- first 8 chars for identification: pms_sk_xxx
  scopes          TEXT[] NOT NULL DEFAULT '{}',     -- ['leases:read', 'invoices:read', 'webhooks:write']
  rate_limit_rpm  SMALLINT DEFAULT 100,
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BMS devices (smart building hardware)
CREATE TABLE bms_devices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  company_id      UUID NOT NULL REFERENCES companies(id),
  device_name     VARCHAR(150) NOT NULL,
  device_type     VARCHAR(50) NOT NULL,             -- 'hvac'|'elevator'|'fire_panel'|'power_meter'|'water_meter'
  protocol        VARCHAR(20) NOT NULL,             -- 'bacnet_ip'|'bacnet_mstp'|'modbus_tcp'|'lonworks'
  ip_address      INET,
  port            SMALLINT,
  bacnet_device_id INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  fault_active    BOOLEAN DEFAULT FALSE,
  fault_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BMS readings
CREATE TABLE bms_readings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id       UUID NOT NULL REFERENCES bms_devices(id) ON DELETE CASCADE,
  point_name      VARCHAR(100) NOT NULL,            -- BACnet object name or Modbus register label
  point_type      VARCHAR(30) NOT NULL,             -- 'analog_input'|'binary_input'|'analog_value'
  value           NUMERIC(16,6),
  unit            VARCHAR(30),
  quality         VARCHAR(20) DEFAULT 'good',       -- 'good'|'bad'|'uncertain'
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bms_readings_device ON bms_readings(device_id, read_at DESC);
```

---

## Server-Side Architecture

```
src/modules/integrations/
├── integrations.module.ts
├── integrations.controller.ts
├── integrations.service.ts               # orchestrator
├── adapters/
│   ├── base.adapter.ts                   # IErpAdapter interface
│   ├── erp/
│   │   ├── sap.adapter.ts
│   │   ├── netsuite.adapter.ts
│   │   └── dynamics365.adapter.ts
│   ├── accounting/
│   │   ├── quickbooks.adapter.ts
│   │   └── xero.adapter.ts
│   ├── esign/
│   │   ├── docusign.adapter.ts
│   │   └── adobesign.adapter.ts
│   └── bms/
│       ├── bacnet.adapter.ts
│       └── bms-modbus.adapter.ts
├── webhooks/
│   ├── webhooks.controller.ts
│   ├── webhooks.service.ts
│   └── webhook-delivery.processor.ts
├── api-keys/
│   ├── api-keys.controller.ts
│   └── api-keys.service.ts
├── bms/
│   ├── bms.controller.ts
│   ├── bms.service.ts
│   └── bms-poller.processor.ts
├── dto/
│   ├── create-integration.dto.ts
│   ├── create-webhook.dto.ts
│   ├── create-api-key.dto.ts
│   └── bms-device.dto.ts
└── entities/ (as above)
```

### Adapter Interface

```typescript
// src/modules/integrations/adapters/base.adapter.ts
export interface IErpAdapter {
  /** Test connectivity and return status */
  testConnection(): Promise<{ connected: boolean; version?: string; error?: string }>;

  /** Push a GL journal entry to the external ERP */
  pushJournalEntry(journal: JournalEntry, config: IntegrationConfig): Promise<ExternalJournalRef>;

  /** Push an AP invoice to the external ERP */
  pushApInvoice(apInvoice: ApInvoice, config: IntegrationConfig): Promise<ExternalInvoiceRef>;

  /** Pull vendors from external ERP → PMS vendor catalog */
  pullVendors(config: IntegrationConfig): Promise<ExternalVendor[]>;

  /** Pull COA from external ERP → validate/map against PMS COA */
  pullChartOfAccounts(config: IntegrationConfig): Promise<ExternalAccount[]>;

  /** Full sync: pull all open AP invoices and match to PMS */
  fullSync(config: IntegrationConfig): Promise<SyncResult>;
}

// src/modules/integrations/adapters/erp/xero.adapter.ts
@Injectable()
export class XeroAdapter implements IErpAdapter {
  constructor(private readonly http: HttpService) {}

  async testConnection(config: IntegrationConfig): Promise<{ connected: boolean }> {
    const token = await this.getAccessToken(config);
    const response = await this.http.axiosRef.get('https://api.xero.com/api.xro/2.0/Organisation', {
      headers: { Authorization: `Bearer ${token}`, 'Xero-tenant-id': config.credentials.tenantId },
    });
    return { connected: response.status === 200, version: response.data.Organisations[0]?.Version };
  }

  async pushJournalEntry(journal: JournalEntry, config: IntegrationConfig): Promise<ExternalJournalRef> {
    const token = await this.getAccessToken(config);
    const xeroJournal = this.mapToXeroJournal(journal, config);

    const response = await this.http.axiosRef.put(
      'https://api.xero.com/api.xro/2.0/ManualJournals',
      { ManualJournals: [xeroJournal] },
      { headers: { Authorization: `Bearer ${token}`, 'Xero-tenant-id': config.credentials.tenantId } },
    );

    const created = response.data.ManualJournals[0];
    return {
      externalId: created.ManualJournalID,
      externalRef: created.Narration,
      syncedAt: new Date(),
    };
  }

  private mapToXeroJournal(journal: JournalEntry, config: IntegrationConfig) {
    return {
      Date: journal.entryDate,
      Narration: journal.description,
      Status: 'POSTED',
      JournalLines: journal.lines.map(line => ({
        Description: line.description,
        AccountCode: this.mapGlCode(line.account.code, config),
        LineAmount: line.debit > 0 ? line.debit : -line.credit,
      })),
    };
  }

  private async getAccessToken(config: IntegrationConfig): Promise<string> {
    // Check token expiry, refresh if needed
    const creds = config.credentials as XeroCredentials;
    if (new Date(creds.expiresAt) <= addMinutes(new Date(), 5)) {
      return this.refreshToken(config);
    }
    return creds.accessToken;
  }
}
```

### Webhook Service

```typescript
// src/modules/integrations/webhooks/webhooks.service.ts
@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEndpoint) private endpointRepo: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery) private deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue('webhook-delivery') private deliveryQueue: Queue,
  ) {}

  /**
   * Called by domain services when events occur.
   * e.g. LeaseService.activate() → emitEvent('lease.activated', { leaseId, ... })
   */
  async emitEvent(eventType: string, payload: Record<string, unknown>, companyId: string): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: {
        companyId,
        isActive: true,
        events: ArrayContains([eventType]),
      },
    });

    for (const endpoint of endpoints) {
      const delivery = await this.deliveryRepo.save({
        endpointId: endpoint.id,
        eventType,
        payload: { event: eventType, data: payload, timestamp: new Date().toISOString(), companyId },
        status: 'pending',
      });

      await this.deliveryQueue.add('deliver', { deliveryId: delivery.id }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 60000 },  // 1min, 2min, 4min, 8min, 16min
      });
    }
  }

  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.deliveryRepo.findOneOrFail({ where: { id: deliveryId }, relations: ['endpoint'] });
    const endpoint = delivery.endpoint;

    const signature = this.generateSignature(delivery.payload, endpoint.secret);

    try {
      const response = await axios.post(endpoint.url, delivery.payload, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Signature': signature,
          'X-PMS-Event': delivery.eventType,
          'X-PMS-Delivery': delivery.id,
        },
      });

      await this.deliveryRepo.update(deliveryId, {
        status: 'delivered',
        httpStatus: response.status,
        responseBody: JSON.stringify(response.data).slice(0, 1000),
        deliveredAt: new Date(),
      });

      await this.endpointRepo.update(endpoint.id, { lastSuccessAt: new Date(), failureCount: 0 });

    } catch (err) {
      const attemptCount = delivery.attemptCount + 1;
      const isAbandoned = attemptCount >= 5;

      await this.deliveryRepo.update(deliveryId, {
        status: isAbandoned ? 'abandoned' : 'failed',
        httpStatus: err.response?.status,
        responseBody: err.message,
        attemptCount,
      });

      if (isAbandoned) {
        await this.endpointRepo.update(endpoint.id, {
          failureCount: () => 'failure_count + 1',
          lastFailureAt: new Date(),
        });
        // Disable endpoint after 100 consecutive failures
        await this.checkAndDisableEndpoint(endpoint.id);
      }
    }
  }

  private generateSignature(payload: unknown, secret: string): string {
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;
  }
}
```

### BMS Service

```typescript
// src/modules/integrations/bms/bms.service.ts
@Injectable()
export class BmsService {
  @Cron('*/5 * * * *')  // Every 5 minutes
  async pollAllDevices(): Promise<void> {
    const devices = await this.deviceRepo.find({ where: { isActive: true } });
    for (const device of devices) {
      await this.bmsQueue.add('poll-device', { deviceId: device.id });
    }
  }

  async pollBacnetDevice(deviceId: string): Promise<void> {
    const device = await this.deviceRepo.findOneOrFail({ where: { id: deviceId } });
    const client = new bacnet.Client();

    try {
      await client.connect(device.ipAddress!.toString(), device.port ?? 47808);
      const points = await this.getBacnetPoints(device.bacnetDeviceId!);

      for (const point of points) {
        const value = await client.readProperty(point.objectIdentifier, bacnet.enum.PropertyIdentifier.PRESENT_VALUE);
        await this.readingRepo.save({
          deviceId: device.id,
          pointName: point.name,
          pointType: point.type,
          value: value.value,
          unit: point.unit,
          quality: 'good',
        });
      }

      await this.deviceRepo.update(device.id, { lastSeenAt: new Date(), faultActive: false, faultMessage: null });

    } catch (err) {
      await this.deviceRepo.update(device.id, { faultActive: true, faultMessage: err.message });

      // Auto-create maintenance ticket for BMS fault
      if (err.message.includes('timeout') || err.message.includes('connection')) {
        await this.maintenanceService.createSystemTicket({
          propertyId: device.propertyId,
          title: `BMS Device Offline: ${device.deviceName}`,
          description: `BMS device ${device.deviceName} (${device.deviceType}) is unreachable. Error: ${err.message}`,
          priority: 'P2',
          source: 'system',
        });
      }
    }
  }
}
```

---

## API Contract

### Integration Management

### `GET /integrations`
**Access:** `integrations.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "integrationType": "xero",
      "name": "Xero — Acme Holdings",
      "status": "active",
      "lastSyncAt": "2025-01-15T06:00:00Z",
      "syncFrequency": "daily",
      "stats": { "successfulSyncs": 42, "failedSyncs": 1, "lastError": null }
    }
  ]
}
```

### `POST /integrations`
**Access:** `integrations.manage`

```json
{
  "integrationType": "xero",
  "name": "Xero — Acme Holdings",
  "config": {
    "tenantId": "xero-tenant-uuid",
    "defaultAccountMappings": {
      "1100": "200",
      "4100": "200",
      "2100": "800"
    }
  },
  "credentials": {
    "clientId": "xero-client-id",
    "clientSecret": "xero-client-secret"
  },
  "syncFrequency": "daily"
}
```

### `POST /integrations/:id/test`
**Access:** `integrations.manage`

**Response 200:**
```json
{
  "success": true,
  "data": { "connected": true, "version": "Xero API 2.0", "organisationName": "Acme Holdings Ltd" }
}
```

### `POST /integrations/:id/sync`
**Access:** `integrations.manage`

```json
{ "syncType": "gl_journal", "fromDate": "2025-01-01", "toDate": "2025-01-31" }
```

**Response 202:**
```json
{
  "success": true,
  "data": { "syncJobId": "bull-job-id", "message": "Sync job queued. Estimated completion: 2 minutes." }
}
```

### `GET /integrations/:id/sync-logs`
**Query:** `?page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "syncType": "gl_journal",
      "direction": "push",
      "status": "success",
      "recordsProcessed": 48,
      "recordsCreated": 45,
      "recordsFailed": 3,
      "errorDetails": [{ "pmsId": "uuid", "error": "Account code 9999 not found in Xero" }],
      "durationMs": 3420,
      "startedAt": "2025-01-15T06:00:00Z",
      "completedAt": "2025-01-15T06:00:03Z"
    }
  ]
}
```

### `GET /integrations/entity-map`
**Query:** `?integrationType=xero&entityType=gl_account`

---

### Webhooks

### `GET /developer/webhooks`
**Access:** `developer.webhooks`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "url": "https://myapp.com/webhooks/pms",
      "events": ["lease.activated", "invoice.issued", "payment.received", "ticket.created"],
      "isActive": true,
      "failureCount": 0,
      "lastSuccessAt": "2025-01-15T10:05:00Z"
    }
  ]
}
```

### `POST /developer/webhooks`
**Access:** `developer.webhooks`

```json
{
  "url": "https://myapp.com/webhooks/pms",
  "events": [
    "lease.activated",
    "lease.terminated",
    "invoice.issued",
    "invoice.paid",
    "payment.received",
    "ticket.created",
    "ticket.completed",
    "visitor.checked_in"
  ],
  "description": "My integration endpoint"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "url": "https://myapp.com/webhooks/pms",
    "secret": "whsec_live_xxxxxxxxxxxxxxxxxx",
    "events": ["lease.activated", "invoice.issued"]
  }
}
```

### `PUT /developer/webhooks/:id`
### `DELETE /developer/webhooks/:id`
### `POST /developer/webhooks/:id/test`  
Sends a test event to the endpoint.

### `GET /developer/webhooks/:id/deliveries`
**Query:** `?status=failed&page=1&limit=20`

### `POST /developer/webhooks/deliveries/:id/retry`

---

### API Keys

### `GET /developer/api-keys`
**Access:** `developer.api_keys`

### `POST /developer/api-keys`

```json
{
  "name": "My Integration Key",
  "scopes": ["leases:read", "invoices:read", "tenants:read", "webhooks:write"],
  "rateLimitRpm": 100,
  "expiresAt": null
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Integration Key",
    "key": "pms_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "keyPrefix": "pms_sk_li",
    "scopes": ["leases:read", "invoices:read"],
    "message": "This key will only be shown once. Store it securely."
  }
}
```

### `DELETE /developer/api-keys/:id`

---

### BMS

### `GET /bms/devices`
**Query:** `?propertyId=&deviceType=hvac`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "deviceName": "AHU B1 Controller",
      "deviceType": "hvac",
      "protocol": "bacnet_ip",
      "ipAddress": "192.168.1.50",
      "isActive": true,
      "lastSeenAt": "2025-01-15T10:55:00Z",
      "faultActive": false,
      "latestReadings": [
        { "pointName": "Supply Air Temp", "value": 16.5, "unit": "degC", "readAt": "2025-01-15T10:55:00Z" },
        { "pointName": "Return Air Temp", "value": 24.2, "unit": "degC", "readAt": "2025-01-15T10:55:00Z" },
        { "pointName": "Fan Status", "value": 1, "unit": "binary", "readAt": "2025-01-15T10:55:00Z" }
      ]
    }
  ]
}
```

### `POST /bms/devices`

```json
{
  "propertyId": "uuid",
  "deviceName": "AHU B1 Controller",
  "deviceType": "hvac",
  "protocol": "bacnet_ip",
  "ipAddress": "192.168.1.50",
  "port": 47808,
  "bacnetDeviceId": 1001
}
```

### `GET /bms/devices/:id/readings`
**Query:** `?pointName=&from=&to=&limit=100`

### `GET /bms/devices/:id/faults`
Returns current and historical fault/alarm states.

### `POST /bms/devices/:id/poll`
**Access:** `bms.manage`  
Manually trigger a device poll.

---

## Webhook Events Catalog

All events follow the pattern: `{entity}.{action}`

```typescript
export const WEBHOOK_EVENTS = {
  // Leases
  'lease.created':       'Lease draft created',
  'lease.activated':     'Lease activated (live)',
  'lease.amended':       'Lease amendment approved',
  'lease.renewed':       'Lease renewed',
  'lease.terminated':    'Lease terminated',
  'lease.expiring':      'Lease expiring within 30 days',
  // Invoices & Payments
  'invoice.issued':      'Invoice generated',
  'invoice.sent':        'Invoice emailed to tenant',
  'invoice.paid':        'Invoice fully paid',
  'invoice.overdue':     'Invoice became overdue',
  'payment.received':    'Payment receipt created',
  'refund.processed':    'Refund marked as paid',
  // Maintenance
  'ticket.created':      'Maintenance ticket created',
  'ticket.assigned':     'Ticket assigned to technician',
  'ticket.completed':    'Ticket completed',
  'ticket.sla_breach':   'SLA breach detected',
  'ticket.rated':        'Tenant rating submitted',
  // Tenants
  'tenant.created':      'New tenant profile created',
  'tenant.kyc_verified': 'KYC verification completed',
  'tenant.blacklisted':  'Tenant added to blacklist',
  // Visitors
  'visitor.pre_registered': 'Visitor pass created',
  'visitor.checked_in':  'Visitor gate check-in',
  'visitor.checked_out': 'Visitor gate check-out',
  'visitor.overstay':    'Visitor overstay detected',
  // Bookings
  'booking.confirmed':   'Facility booking confirmed',
  'booking.cancelled':   'Facility booking cancelled',
  // Security
  'incident.created':    'Security incident reported',
  'incident.resolved':   'Security incident resolved',
  // Units
  'unit.status_changed': 'Unit status changed',
  // Properties
  'property.status_changed': 'Property status changed',
};
```

### Webhook Payload Structure

All webhook deliveries share this envelope:

```json
{
  "event": "invoice.issued",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "companyId": "uuid",
  "deliveryId": "uuid",
  "data": {
    "id": "uuid",
    "invoiceNumber": "INV-2025-00042",
    "tenantId": "uuid",
    "unitId": "uuid",
    "totalAmount": 3815,
    "currency": "SGD",
    "dueDate": "2025-01-22"
  }
}
```

Signature verification:
```javascript
const signature = req.headers['x-pms-signature'];
const expected = `sha256=${crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')}`;
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
  return res.status(401).send('Invalid signature');
}
```

---

## UI Screens

```
admin/developer/
├── IntegrationsPage/
│   └── components/
│       ├── IntegrationCard.tsx          # type icon + name + status badge + last sync
│       ├── AddIntegrationModal.tsx      # step 1: select type; step 2: configure; step 3: test
│       ├── SyncLogsDrawer.tsx           # table: date | type | records | errors | duration
│       └── EntityMapTable.tsx           # PMS ID ↔ External ID mapping view

├── WebhooksPage/
│   └── components/
│       ├── WebhookTable.tsx             # URL + events + status + failure count
│       ├── CreateWebhookModal.tsx       # URL input + event multi-select checklist
│       ├── WebhookDeliveriesDrawer.tsx  # delivery log with retry button
│       └── SecretRevealModal.tsx        # one-time secret display

├── ApiKeysPage/
│   └── components/
│       ├── ApiKeyTable.tsx              # prefix + scopes + last used + expiry
│       ├── CreateApiKeyModal.tsx        # name + scopes picker + optional expiry
│       └── NewKeyRevealModal.tsx        # one-time full key display

└── BmsPage/
    └── components/
        ├── BmsDeviceList.tsx
        ├── BmsDeviceCard.tsx            # device name + type + status LED + readings
        ├── BmsReadingsChart.tsx         # live readings time series
        └── AddBmsDeviceModal.tsx
```

---

## State Management

```typescript
export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  tagTypes: ['Integrations', 'SyncLogs', 'EntityMap', 'Webhooks', 'ApiKeys', 'BmsDevices'],
  endpoints: (builder) => ({
    getIntegrations: builder.query<Integration[], void>({
      query: () => '/integrations',
      providesTags: ['Integrations'],
    }),
    createIntegration: builder.mutation<Integration, CreateIntegrationDto>({
      query: (body) => ({ url: '/integrations', method: 'POST', body }),
      invalidatesTags: ['Integrations'],
    }),
    testIntegration: builder.mutation<TestConnectionResult, string>({
      query: (id) => ({ url: `/integrations/${id}/test`, method: 'POST' }),
    }),
    triggerSync: builder.mutation<SyncJobRef, { id: string; syncType: string; fromDate?: string; toDate?: string }>({
      query: ({ id, ...body }) => ({ url: `/integrations/${id}/sync`, method: 'POST', body }),
      invalidatesTags: ['SyncLogs'],
    }),
    getSyncLogs: builder.query<PaginatedResponse<SyncLog>, { integrationId: string; page?: number }>({
      query: ({ integrationId, ...params }) => ({ url: `/integrations/${integrationId}/sync-logs`, params }),
      providesTags: ['SyncLogs'],
    }),
    getWebhooks: builder.query<WebhookEndpoint[], void>({
      query: () => '/developer/webhooks',
      providesTags: ['Webhooks'],
    }),
    createWebhook: builder.mutation<WebhookEndpointWithSecret, CreateWebhookDto>({
      query: (body) => ({ url: '/developer/webhooks', method: 'POST', body }),
      invalidatesTags: ['Webhooks'],
    }),
    deleteWebhook: builder.mutation<void, string>({
      query: (id) => ({ url: `/developer/webhooks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Webhooks'],
    }),
    testWebhook: builder.mutation<void, string>({
      query: (id) => ({ url: `/developer/webhooks/${id}/test`, method: 'POST' }),
    }),
    retryWebhookDelivery: builder.mutation<void, string>({
      query: (deliveryId) => ({ url: `/developer/webhooks/deliveries/${deliveryId}/retry`, method: 'POST' }),
    }),
    getApiKeys: builder.query<ApiKey[], void>({
      query: () => '/developer/api-keys',
      providesTags: ['ApiKeys'],
    }),
    createApiKey: builder.mutation<ApiKeyWithSecret, CreateApiKeyDto>({
      query: (body) => ({ url: '/developer/api-keys', method: 'POST', body }),
      invalidatesTags: ['ApiKeys'],
    }),
    deleteApiKey: builder.mutation<void, string>({
      query: (id) => ({ url: `/developer/api-keys/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ApiKeys'],
    }),
    getBmsDevices: builder.query<BmsDevice[], { propertyId?: string }>({
      query: (p) => ({ url: '/bms/devices', params: p }),
      providesTags: ['BmsDevices'],
    }),
    createBmsDevice: builder.mutation<BmsDevice, CreateBmsDeviceDto>({
      query: (body) => ({ url: '/bms/devices', method: 'POST', body }),
      invalidatesTags: ['BmsDevices'],
    }),
    pollBmsDevice: builder.mutation<void, string>({
      query: (id) => ({ url: `/bms/devices/${id}/poll`, method: 'POST' }),
    }),
  }),
});
```
