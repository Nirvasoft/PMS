# Module 1.5 — Notification Center

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · Handlebars · React 18 · Redux Toolkit  
**Status:** ✅ Implemented (Phase 1 core — in-app, email stub, preferences, templates)  
**Depends On:** Module 1.1, 1.2, 1.3, 1.4

---

## Overview

Centralized notification dispatch service. All modules emit notification events; this module routes them to the correct channel(s) per recipient preferences. Supports email, SMS, push (FCM), in-app (WebSocket), WhatsApp, Telegram, scheduled reminders, and cron-based batch notifications.

---

## DB Schema

```sql
-- Notification templates
CREATE TABLE notification_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = system template
  code          VARCHAR(100) NOT NULL,          -- 'lease_approved', 'rent_due', 'maintenance_assigned'
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  channels      TEXT[] NOT NULL DEFAULT '{}',   -- which channels this template supports
  subject       VARCHAR(500),                   -- email subject (Handlebars template)
  body_text     TEXT NOT NULL,                  -- plain text / SMS (Handlebars)
  body_html     TEXT,                           -- HTML email body (Handlebars)
  body_push     VARCHAR(500),                   -- push notification body (shorter)
  variables     JSONB DEFAULT '[]',             -- [{ name, type, required, description }]
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_template_code_company UNIQUE (code, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Notification log (every sent notification)
CREATE TABLE notification_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID REFERENCES companies(id),
  template_code   VARCHAR(100),
  channel         VARCHAR(20) NOT NULL,          -- 'email' | 'sms' | 'push' | 'in_app' | 'whatsapp'
  recipient_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),
  recipient_device_token VARCHAR(500),
  subject         VARCHAR(500),
  body            TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'queued',
                  -- 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opened'
  provider        VARCHAR(50),                   -- 'sendgrid' | 'twilio' | 'fcm' | 'in_app'
  provider_message_id VARCHAR(255),
  error_message   TEXT,
  retry_count     SMALLINT NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  entity_type     VARCHAR(100),                  -- optional: linked entity
  entity_id       UUID,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_log_recipient ON notification_logs(recipient_id, created_at DESC);
CREATE INDEX idx_notif_log_status ON notification_logs(status) WHERE status IN ('queued', 'failed');
CREATE INDEX idx_notif_log_entity ON notification_logs(entity_type, entity_id);

-- In-app notifications (bell icon items)
CREATE TABLE in_app_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  icon          VARCHAR(50) DEFAULT 'bell',      -- icon key for frontend
  action_type   VARCHAR(50),                     -- 'navigate' | 'open_modal' | null
  action_url    VARCHAR(500),                    -- deep link / route
  entity_type   VARCHAR(100),
  entity_id     UUID,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inapp_user_unread ON in_app_notifications(user_id, is_read, created_at DESC);

-- User notification preferences
CREATE TABLE notification_preferences (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_code     VARCHAR(100) NOT NULL,
  email_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,                        -- e.g. 22:00 — suppress non-critical
  quiet_hours_end   TIME,                        -- e.g. 07:00
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_code)
);

-- Scheduled / reminder notifications
CREATE TABLE scheduled_notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  template_code   VARCHAR(100) NOT NULL,
  recipient_ids   UUID[] NOT NULL,
  variables       JSONB DEFAULT '{}',            -- template variables
  channels        TEXT[],
  scheduled_at    TIMESTAMPTZ NOT NULL,
  recurrence      JSONB,                         -- null = one-time; { cron: '0 9 1 * *' }
  entity_type     VARCHAR(100),
  entity_id       UUID,
  status          VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'sent' | 'cancelled'
  bull_job_id     VARCHAR(100),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Push device tokens
CREATE TABLE push_device_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     UUID REFERENCES user_devices(id),
  token         VARCHAR(500) NOT NULL,
  platform      VARCHAR(10) NOT NULL,            -- 'ios' | 'android' | 'web'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_token UNIQUE (token)
);
```

---

## Server-Side Architecture

```
src/modules/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts            # main dispatch service
├── template.service.ts                 # template rendering (Handlebars)
├── channels/
│   ├── email.channel.ts                # SendGrid adapter
│   ├── sms.channel.ts                  # Twilio adapter
│   ├── push.channel.ts                 # Firebase FCM adapter
│   ├── in-app.channel.ts               # Socket.IO + DB
│   └── whatsapp.channel.ts             # WhatsApp Business API
├── queues/
│   ├── notification.processor.ts       # Bull queue processor
│   └── scheduled.processor.ts         # cron/delayed notification processor
├── preferences.controller.ts
├── preferences.service.ts
├── dto/
│   ├── send-notification.dto.ts
│   ├── schedule-notification.dto.ts
│   └── update-preferences.dto.ts
└── gateways/
    └── notification.gateway.ts         # Socket.IO WebSocket gateway
```

### Notification Service

```typescript
// src/modules/notifications/notifications.service.ts
@Injectable()
export class NotificationsService {
  constructor(
    private templateService: TemplateService,
    private emailChannel: EmailChannel,
    private smsChannel: SmsChannel,
    private pushChannel: PushChannel,
    private inAppChannel: InAppChannel,
    private preferencesService: PreferencesService,
    @InjectQueue('notifications') private queue: Queue,
  ) {}

  /**
   * Primary entry point for all notification dispatch.
   * Modules call this — never call channels directly.
   */
  async send(dto: SendNotificationDto): Promise<void> {
    // Enqueue for async processing — never block the calling service
    await this.queue.add('send', dto, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  /**
   * Called by the queue processor.
   */
  async dispatch(dto: SendNotificationDto): Promise<void> {
    const { templateCode, recipientIds, variables, channels: requestedChannels, companyId } = dto;

    for (const recipientId of recipientIds) {
      const prefs = await this.preferencesService.getPreferences(recipientId, templateCode);
      const effectiveChannels = this.resolveChannels(requestedChannels, prefs);

      for (const channel of effectiveChannels) {
        if (this.isInQuietHours(prefs)) {
          if (!this.isCritical(templateCode)) continue;
        }
        await this.dispatchToChannel(channel, recipientId, templateCode, variables, companyId, dto);
      }
    }
  }

  private resolveChannels(requested: string[], prefs: NotificationPreferences): string[] {
    return requested.filter(ch => {
      switch (ch) {
        case 'email': return prefs.emailEnabled;
        case 'sms': return prefs.smsEnabled;
        case 'push': return prefs.pushEnabled;
        case 'in_app': return prefs.inAppEnabled;
        case 'whatsapp': return prefs.whatsappEnabled;
        default: return true;
      }
    });
  }
}

// src/modules/notifications/gateways/notification.gateway.ts
@WebSocketGateway({ namespace: '/notifications', cors: { origin: process.env.FRONTEND_URL } })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client.handshake.auth.token);
    client.join(`user:${userId}`);
  }

  // Called by InAppChannel after saving to DB
  sendToUser(userId: string, notification: InAppNotification) {
    this.server.to(`user:${userId}`).emit('notification', {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      actionType: notification.actionType,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
    });
  }
}
```

---

## API Contract

### `POST /notifications/send`
**Access:** Internal service calls only (protected by service API key, not user JWT)

```json
{
  "templateCode": "lease_approved",
  "companyId": "uuid",
  "recipientIds": ["uuid1", "uuid2"],
  "channels": ["email", "in_app"],
  "variables": {
    "tenantName": "ABC Corp",
    "unitCode": "12A",
    "leaseStartDate": "2025-02-01",
    "rentAmount": "5,000"
  },
  "entityType": "lease",
  "entityId": "uuid"
}
```

**Response 202 Accepted:**
```json
{ "success": true, "data": { "queued": 2 } }
```

---

### `POST /notifications/schedule`
**Access:** `notifications.schedule`

```json
{
  "templateCode": "rent_due_reminder",
  "recipientIds": ["uuid"],
  "variables": { "rentAmount": "5,000", "dueDate": "2025-02-01" },
  "channels": ["email", "sms"],
  "scheduledAt": "2025-01-29T09:00:00Z",
  "entityType": "invoice",
  "entityId": "uuid"
}
```

---

### `GET /notifications/in-app`
**Access:** Authenticated (own notifications only)  
**Query:** `?isRead=false&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Lease Approved",
      "body": "Lease for Unit 12A has been approved.",
      "icon": "check-circle",
      "actionType": "navigate",
      "actionUrl": "/leases/uuid",
      "isRead": false,
      "createdAt": "2025-01-15T10:05:00Z"
    }
  ],
  "meta": { "total": 12, "unreadCount": 5 }
}
```

---

### `PUT /notifications/in-app/:id/read`
**Access:** Authenticated

### `POST /notifications/in-app/read-all`
**Access:** Authenticated

### `DELETE /notifications/in-app/:id`

---

### `GET /notifications/preferences`
**Access:** Authenticated

**Response 200:**
```json
{
  "success": true,
  "data": {
    "preferences": [
      {
        "templateCode": "lease_approved",
        "name": "Lease Approval",
        "emailEnabled": true,
        "smsEnabled": false,
        "pushEnabled": true,
        "inAppEnabled": true
      }
    ],
    "quietHoursStart": "22:00",
    "quietHoursEnd": "07:00"
  }
}
```

### `PUT /notifications/preferences`

```json
{
  "preferences": [
    { "templateCode": "lease_approved", "emailEnabled": true, "smsEnabled": true }
  ],
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00"
}
```

---

### `GET /notifications/logs`
**Access:** `notifications.logs`  
**Query:** `?recipientId=&channel=&status=&from=&to=&page=1&limit=50`

### `POST /notifications/logs/:id/retry`
**Access:** `notifications.manage`

---

### `GET /notification-templates`
### `POST /notification-templates`
### `PUT /notification-templates/:id`

**Template variables use Handlebars syntax:**
- Subject: `Lease Approved — Unit {{unitCode}}`
- Body: `Dear {{tenantName}}, your lease for Unit {{unitCode}} starting {{leaseStartDate}} has been approved.`

---

### `POST /push-tokens`
**Access:** Authenticated (mobile apps register their FCM token)

```json
{
  "token": "fcm-device-token-string",
  "platform": "ios",
  "deviceId": "uuid"
}
```

### `DELETE /push-tokens/:token`

---

## Business Logic & Validation Rules

```
Template rendering:
- Engine: Handlebars.js
- Variables validated against template.variables schema before render
- Missing required variables → throw TemplateRenderError (notification not sent)
- HTML email: inline CSS via juice library (email client compatibility)
- Plain text: auto-stripped from HTML if body_text not provided

Channel-specific rules:
- SMS: body truncated at 160 chars (single SMS); warn if multi-part
- Push: title max 65 chars, body max 240 chars
- WhatsApp: must use approved message template (template approval via Meta Business)
- Email: from address = company.email or default noreply@pms.app

Retry policy (Bull queue):
- Attempt 1: immediate
- Attempt 2: +5 seconds (exponential backoff)
- Attempt 3: +25 seconds
- After 3 failures: status = 'failed', error logged, alert sent to admin

Quiet hours:
- Critical templates bypass quiet hours: account_locked, payment_overdue_final, security_incident
- Non-critical notifications during quiet hours → delayed to quietHoursEnd time
- Quiet hours evaluated in user's timezone

FCM token rotation:
- Mobile app refreshes token → call POST /push-tokens (upsert by token value)
- FCM sends 'NotRegistered' error → set token is_active = false
```

---

## UI Screens & Component Breakdown

```
Notification Bell (global header):
├── NotificationBell.tsx               # badge with unread count
├── NotificationDropdown.tsx           # last 10 notifications, "Mark all read"
└── NotificationItem.tsx               # icon + title + relative time + action link

pages/notifications/
├── NotificationCenterPage/            # full notification inbox
│   └── components/
│       ├── NotificationList.tsx
│       ├── NotificationFilters.tsx    # unread/all, date range
│       └── EmptyState.tsx

settings/notifications/
├── NotificationPreferencesPage/
│   └── components/
│       ├── ChannelPreferenceTable.tsx # template rows × channel columns (toggle matrix)
│       ├── QuietHoursConfig.tsx       # time pickers for quiet start/end
│       └── PreferenceSaveButton.tsx

admin/notifications/
├── TemplateEditorPage/
│   └── components/
│       ├── TemplateForm.tsx           # code, name, subject, body editors
│       ├── HandlebarsEditor.tsx       # textarea with variable autocomplete
│       ├── TemplatePreview.tsx        # render preview with sample data
│       └── VariablesList.tsx          # shows all available template variables

├── NotificationLogsPage/
│   └── components/
│       ├── LogTable.tsx               # recipient, channel, status, sent_at
│       ├── StatusBadge.tsx
│       └── RetryButton.tsx
```

---

## State Management

```typescript
// src/store/api/notificationsApi.ts
export const notificationsApi = createApi({
  reducerPath: 'notificationsApi',
  tagTypes: ['InAppNotifications', 'Preferences', 'Templates'],
  endpoints: (builder) => ({
    getInAppNotifications: builder.query<PaginatedResponse<InAppNotification>, { isRead?: boolean }>({
      query: (params) => ({ url: '/notifications/in-app', params }),
      providesTags: ['InAppNotifications'],
    }),
    markAsRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/in-app/${id}/read`, method: 'PUT' }),
      invalidatesTags: ['InAppNotifications'],
    }),
    markAllRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/in-app/read-all', method: 'POST' }),
      invalidatesTags: ['InAppNotifications'],
    }),
    getPreferences: builder.query<NotificationPreferences, void>({
      query: () => '/notifications/preferences',
      providesTags: ['Preferences'],
    }),
    updatePreferences: builder.mutation<void, UpdatePreferencesDto>({
      query: (body) => ({ url: '/notifications/preferences', method: 'PUT', body }),
      invalidatesTags: ['Preferences'],
    }),
    registerPushToken: builder.mutation<void, RegisterPushTokenDto>({
      query: (body) => ({ url: '/push-tokens', method: 'POST', body }),
    }),
  }),
});

// src/store/slices/notificationsSlice.ts
interface NotificationsState {
  unreadCount: number;
  socketConnected: boolean;
}

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: { unreadCount: 0, socketConnected: false } as NotificationsState,
  reducers: {
    setUnreadCount: (state, action: PayloadAction<number>) => { state.unreadCount = action.payload; },
    incrementUnread: (state) => { state.unreadCount += 1; },
    setSocketConnected: (state, action: PayloadAction<boolean>) => { state.socketConnected = action.payload; },
  },
});

// src/hooks/useRealtimeNotifications.ts
// Connects on login via Socket.IO; listens for 'notification' event,
// invalidates RTK Query cache + shows react-hot-toast
export function useRealtimeNotifications() {
  const { accessToken } = useAppSelector(s => s.auth);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(import.meta.env['VITE_API_URL'] || 'http://localhost:3000', {
      auth: { token: accessToken },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('notification', (payload: { id: string; title: string; body: string; icon?: string }) => {
      dispatch(notificationsApi.util.invalidateTags(['InAppNotifications']));
      toast(payload.title, { icon: payload.icon === 'warning' ? '⚠️' : '🔔', duration: 5000 });
    });

    return () => { socket.disconnect(); };
  }, [accessToken, dispatch]);
};
```
