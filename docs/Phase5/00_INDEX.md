# PMS — Phase 5: Tenant Experience & Mobile Applications
## Developer Specification Index

**Stack:**
- **Web Portal:** React 18 · Redux Toolkit · Stripe · Socket.IO
- **Mobile:** Flutter 3.x · Dart · Riverpod · Dio · Firebase (FCM + Crashlytics)
- **Backend:** Express · Prisma · PostgreSQL · Redis

**Timeline:** Months 13–15  
**Depends On:** Phase 1 + 2 + 3 + 4 (all modules)  
**Total Effort:** ~14 developer-weeks

---

## Module Index

| File | Modules Covered | Backend | Frontend/Mobile |
|------|----------------|---------|-----------------|
| `01_tenant_resident_portal.md` | 5.1 Tenant & Resident Portal | 1.5 weeks | 1 week |
| `02_visitor_booking_community.md` | 5.2 Visitor Mgmt + 5.3 Facility Booking + 5.4 Community | 3 weeks | 1.5 weeks |
| `03_flutter_mobile_apps.md` | 5.5 All 4 Flutter Apps | — | 6 weeks |

---

## Dependency Graph (Phase 5)

```
Phase 4 (all modules)
    └─► 5.1 Tenant & Resident Portal (web)
            ├─► 5.2 Visitor Management
            ├─► 5.3 Facility Booking
            └─► 5.4 Community (Announcements, Polls, Complaints, Move Requests)
    └─► 5.5 Flutter Apps
            ├─► Resident App  (consumes 5.1 + 5.2 + 5.3 + 5.4 APIs)
            ├─► Technician App (consumes 4.1 + 4.2 APIs)
            ├─► Security App  (consumes 4.6 + 5.2 APIs)
            └─► Manager App   (consumes dashboard + 1.4 workflow + 4.1 + 3.2 APIs)
```

Build order: 5.1 → 5.2 → 5.3 → 5.4 → (Flutter apps in parallel with backend)

---

## Cross-Cutting Concerns (Phase 5)

### 1. Portal vs Admin — Separate Deployments

The Tenant Portal is deployed as a **separate React app** (or sub-path) with its own branding, navigation, and route guards. It shares the same API but uses portal-specific endpoints under `/api/v1/portal/*`.

```
Deployment options:
  Option A (recommended): /portal/* sub-path on same domain
    Web app: https://app.pms.com/portal
    Admin: https://app.pms.com/admin

  Option B: Separate subdomain
    Portal: https://portal.pms.com
    Admin:  https://app.pms.com
```

Branding config per property — stored in `properties.settings.portal`:

```typescript
interface PropertyPortalSettings {
  logoUrl: string;
  primaryColor: string;    // hex
  accentColor: string;
  welcomeMessage: string;
  supportEmail: string;
  supportPhone: string;
  onlinePaymentEnabled: boolean;
  visitorRegistrationEnabled: boolean;
  facilityBookingEnabled: boolean;
  communityEnabled: boolean;
  maxResidentsPerUnit: number;    // default 10
}
```

### 2. Tenant User Provisioning

Tenants get portal access through the invite flow:

```typescript
// When a lease is ACTIVATED:
// 1. Check if tenant has a user account
// 2. If not: create user with role='tenant', companyId, propertyId
// 3. Create resident record (residentType='primary_tenant')
// 4. Send portal invitation email

// LeaseLifecycleService.activate() extension:
async provisionTenantPortalAccess(lease: Lease): Promise<void> {
  const tenant = await this.tenantRepo.findOne({ where: { id: lease.tenantId } });
  if (!tenant?.email) return;

  let user = await this.userRepo.findOne({ where: { email: tenant.email, companyId: lease.companyId } });
  if (!user) {
    user = await this.userRepo.save({
      email: tenant.email,
      companyId: lease.companyId,
      emailVerified: false,
      isActive: true,
      mustChangePassword: true,
    });
    // Assign tenant role scoped to property
    await this.userRoleRepo.save({ userId: user.id, roleId: tenantRoleId, propertyId: lease.propertyId });
  }

  // Create primary resident record
  await this.residentRepo.save({
    userId: user.id,
    tenantId: tenant.id,
    unitId: lease.unitId,
    leaseId: lease.id,
    propertyId: lease.propertyId,
    companyId: lease.companyId,
    firstName: tenant.firstName ?? tenant.contactPersonName ?? '',
    lastName: tenant.lastName ?? '',
    residentType: 'primary_tenant',
    hasPortalAccess: true,
    moveInDate: lease.handoverDate ?? lease.startDate,
  });

  // Send portal invite
  await this.usersService.invite({ email: tenant.email, roleId: tenantRoleId }, user.id, lease.companyId);
}
```

### 3. Flutter Deep Linking

All 4 apps support deep linking for push notification navigation:

```dart
// pms_core/lib/deep_link_service.dart
// Deep link scheme: pms://resident/invoices/{id}
// Universal link:   https://app.pms.com/resident/invoices/{id}

// In go_router, add routes with deep link support:
GoRoute(
  path: '/invoices/:id',
  builder: (context, state) => InvoiceDetailScreen(id: state.pathParameters['id']!),
),

// android/app/src/main/AndroidManifest.xml — intent filter:
// <intent-filter android:autoVerify="true">
//   <action android:name="android.intent.action.VIEW" />
//   <category android:name="android.intent.category.DEFAULT" />
//   <category android:name="android.intent.category.BROWSABLE" />
//   <data android:scheme="https" android:host="app.pms.com" android:pathPrefix="/resident" />
// </intent-filter>
```

### 4. Flutter Localization

All apps support English + property-level locale override (e.g. Arabic for UAE, Bahasa for Malaysia):

```dart
// pms_core/lib/l10n/
// app_en.arb  — English (default)
// app_ar.arb  — Arabic
// app_ms.arb  — Bahasa Malaysia
// app_th.arb  — Thai
// app_zh.arb  — Chinese Simplified

// pubspec.yaml:
flutter:
  generate: true
  
# l10n.yaml:
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```

### 5. QR Code Standards

All QR codes in the system follow a consistent format:

| Entity | Format | Example | Validity |
|--------|--------|---------|---------|
| Visitor Pass | `VIS-{propertyCode}-{uuid}` | `VIS-TWR-A-abc123` | Time-bounded |
| Patrol Checkpoint | `CHKPT-{uuid}` | `CHKPT-uuid` | Permanent |
| Facility Asset | `ASSET-{uuid}` | `ASSET-uuid` | Permanent |
| Parking Pass | `VP-{propertyCode}-{uuid}` | `VP-TWR-A-def456` | Time-bounded |
| Resident Card | `RES-{residentId}` | `RES-uuid` | Until revoked |

### 6. Stripe Mobile Integration

Resident App uses `flutter_stripe` for in-app payments:

```dart
// apps/resident_app/lib/features/invoices/payment_screen.dart

// Method 1: Stripe Checkout (recommended — full hosted page)
await launchUrl(Uri.parse(checkoutUrl), mode: LaunchMode.inAppBrowserView);

// Method 2: Stripe Payment Sheet (native Flutter UI)
// Use when property settings allow native payment
await Stripe.instance.initPaymentSheet(paymentSheetParameters: SetupPaymentSheetParameters(
  merchantDisplayName: 'PMS Property Management',
  paymentIntentClientSecret: clientSecret,
  style: ThemeMode.system,
));
await Stripe.instance.presentPaymentSheet();
```

### 7. Background Processing in Flutter Apps

```dart
// Technician + Security apps support background location for:
// - GPS tracking during active work orders (Technician)
// - Patrol route verification (Security)

// flutter_background_service (technician app only):
@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  final position = await Geolocator.getCurrentPosition();
  // POST /maintenance/work-orders/{activeWoId}/location every 5 min
}
```

### 8. New Notification Templates (Phase 5)

```typescript
export const PHASE5_NOTIFICATION_TEMPLATES = [
  { code: 'visitor_pass_issued',         name: 'Visitor Pass Issued',           channels: ['sms', 'in_app'] },
  { code: 'visitor_approval_request',    name: 'Visitor Approval Request',       channels: ['push', 'in_app'] },
  { code: 'visitor_checked_in',          name: 'Visitor Checked In',             channels: ['in_app'] },
  { code: 'visitor_overstay',            name: 'Visitor Overstay Alert',          channels: ['push', 'in_app'] },
  { code: 'booking_confirmed',           name: 'Facility Booking Confirmed',      channels: ['push', 'in_app', 'email'] },
  { code: 'booking_pending_approval',    name: 'Booking Pending Approval',        channels: ['push', 'in_app'] },
  { code: 'booking_cancelled',           name: 'Facility Booking Cancelled',      channels: ['push', 'in_app'] },
  { code: 'booking_reminder',            name: 'Upcoming Booking Reminder',       channels: ['push', 'in_app'] },
  { code: 'announcement_published',      name: 'New Announcement',               channels: ['push', 'in_app'] },
  { code: 'poll_started',                name: 'New Poll Available',             channels: ['push', 'in_app'] },
  { code: 'complaint_responded',         name: 'Complaint Response',             channels: ['push', 'in_app', 'email'] },
  { code: 'move_request_approved',       name: 'Move Request Approved',          channels: ['push', 'in_app', 'email'] },
  { code: 'portal_invite',              name: 'Portal Invitation',              channels: ['email'] },
  { code: 'walkin_approval_timeout',    name: 'Walk-in Approval Timed Out',     channels: ['push', 'in_app'] },
];
```

### 9. Phase 5 Migration Files

```
migrations/
├── 1700040001-create-residents.ts
├── 1700040002-create-resident-access-cards.ts
├── 1700040003-create-portal-sessions.ts
├── 1700040004-create-portal-quick-actions.ts
├── 1700040005-create-visitors.ts
├── 1700040006-create-walkin-approvals.ts
├── 1700040007-create-visitor-blacklist.ts
├── 1700040008-create-facility-booking-rules.ts
├── 1700040009-create-facility-bookings.ts
├── 1700040010-create-booking-blackout-dates.ts
├── 1700040011-create-announcements.ts
├── 1700040012-create-announcement-reads.ts
├── 1700040013-create-polls.ts
├── 1700040014-create-poll-votes.ts
├── 1700040015-create-community-complaints.ts
├── 1700040016-create-move-requests.ts
├── 1700040017-seed-phase5-notification-templates.ts
└── 1700040018-seed-portal-quick-actions.ts
```

---

## Phase 5 Acceptance Criteria

### Web Portal
- [ ] Tenant can log in, view dashboard with live invoice summary and lease info
- [ ] Invoice payment: Stripe checkout initiated, webhook received, receipt auto-created, invoice marked paid
- [ ] Maintenance request submitted from portal: appears in admin kanban in real-time
- [ ] Tenant rates completed ticket: rating recorded, ticket moves to 'closed'
- [ ] Resident self-registers 2 family members; invites one to portal; portal invite received and accepted
- [ ] KYC document uploaded from portal: appears in admin KYC review queue

### Visitor Management
- [ ] Visitor pre-registered, QR pass URL sent via SMS, visitor can open pass on phone
- [ ] Security app scans QR → authorized screen shown → visitor checked in
- [ ] Second scan of same QR (check-out) → visitor checked out, duration recorded
- [ ] Walk-in: guard submits request → push notification to resident → resident approves → guard notified
- [ ] Overstay: visitor not checked out 30 min after validTo → security notified

### Facility Booking
- [ ] Availability grid shows correct slots (blocking booked slots + buffer)
- [ ] Booking created → confirmation notification sent → appears in "My Bookings"
- [ ] Late cancellation: cancellation fee calculated correctly (50% if < cancellationHours)
- [ ] Blackout date set by admin → slot shows unavailable in portal
- [ ] Paid booking: invoice generated on booking create, payment status tracked

### Community
- [ ] Announcement published → push sent to all residents → appears in portal feed
- [ ] Announcement read status tracked per user
- [ ] Poll: resident votes → real-time count updated → results shown after poll ends
- [ ] Anonymous complaint submitted → admin can respond → submitter identity hidden in response
- [ ] Move-in request: submitted → approved by admin → move-in date confirmed email sent

### Flutter Apps (all 4)
- [ ] **Resident App:** Login → Dashboard → Pay invoice (Stripe) → Submit maintenance request with photo → Register visitor → Book facility — complete end-to-end flow tested on iOS + Android
- [ ] **Technician App:** Login → View assigned WOs → Start WO (GPS captured) → Complete with checklist + photos + materials → WO cost posted to ticket — end-to-end on Android
- [ ] **Security App:** Login → Scan valid QR → Green screen shown → Scan again (checkout) → Red screen for expired QR — tested on Android
- [ ] **Security App:** Walk-in flow → Approval push to resident app → Approve → Guard app shows approved
- [ ] **Manager App:** Login → Dashboard KPIs visible → Pending approval → Approve lease → Lease status updates in admin
- [ ] Push notifications received in foreground + background on all apps
- [ ] Offline mode: Technician completes WO without connectivity → action queued → syncs on reconnect
- [ ] Deep link: push notification tap → correct screen opened on all apps
- [ ] All apps published to Firebase App Distribution for internal testing
- [ ] Resident + Manager apps submitted to TestFlight (iOS) and Play Console internal track
