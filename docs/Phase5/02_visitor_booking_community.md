# Module 5.2 — Visitor Management

**Phase:** 5 — Tenant Experience & Mobile Applications  
**Stack:** NestJS · PostgreSQL · Redis · React 18 · Flutter (Security App)  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 2.1, 2.2, 5.1 (Resident Portal), 4.6 (Security)

---

## Overview

Full visitor lifecycle: pre-registration by residents, QR pass generation, security gate check-in/out, walk-in approval, overstay detection, and visitor logs. Deeply integrated with the Security App (Flutter) for gate scanning.

---

## DB Schema

```sql
-- Visitors
CREATE TABLE visitors (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id),
  host_unit_id      UUID NOT NULL REFERENCES units(id),
  host_resident_id  UUID REFERENCES residents(id),
  host_user_id      UUID REFERENCES users(id),
  visitor_name      VARCHAR(200) NOT NULL,
  visitor_ic        VARCHAR(50),                        -- optional ID number
  visitor_mobile    VARCHAR(50),
  visitor_company   VARCHAR(150),
  visit_purpose     VARCHAR(255),
  expected_at       TIMESTAMPTZ,
  expected_duration_hours SMALLINT DEFAULT 2,
  valid_from        TIMESTAMPTZ NOT NULL,
  valid_to          TIMESTAMPTZ NOT NULL,
  -- QR pass
  qr_token          VARCHAR(255) NOT NULL UNIQUE,
  qr_token_hash     VARCHAR(255) NOT NULL UNIQUE,       -- SHA-256 of qr_token
  pass_type         VARCHAR(20) DEFAULT 'single',       -- 'single'|'recurring'|'multi_day'
  max_uses          SMALLINT DEFAULT 1,
  use_count         SMALLINT DEFAULT 0,
  -- Status
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- 'pending'|'approved'|'checked_in'|'checked_out'|'expired'|'cancelled'|'denied'
  -- Actual visit
  checked_in_at     TIMESTAMPTZ,
  checked_out_at    TIMESTAMPTZ,
  check_in_gate     VARCHAR(100),
  check_in_guard_id UUID REFERENCES users(id),
  actual_duration_minutes SMALLINT,
  -- Overstay
  is_overstay       BOOLEAN NOT NULL DEFAULT FALSE,
  overstay_notified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Vehicle
  vehicle_plate     VARCHAR(30),
  vehicle_make      VARCHAR(50),
  parking_slot_id   UUID REFERENCES parking_slots(id),
  -- Misc
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visitors_property ON visitors(property_id, valid_from DESC);
CREATE INDEX idx_visitors_unit ON visitors(host_unit_id);
CREATE INDEX idx_visitors_qr ON visitors(qr_token_hash);
CREATE INDEX idx_visitors_status ON visitors(status) WHERE status IN ('pending','approved','checked_in');

-- Walk-in approval requests (security calls host for verbal approval)
CREATE TABLE walkin_approvals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  visitor_id    UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  rejected_at   TIMESTAMPTZ,
  responded_by  UUID REFERENCES users(id),            -- host who approved/rejected
  response      VARCHAR(10),                          -- 'approved'|'rejected'
  reason        TEXT,
  timeout_at    TIMESTAMPTZ NOT NULL                  -- if no response by this time → deny
);

-- Visitor blacklist
CREATE TABLE visitor_blacklist (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  property_id UUID REFERENCES properties(id),        -- null = all properties
  visitor_name VARCHAR(200),
  visitor_ic  VARCHAR(50),
  visitor_mobile VARCHAR(50),
  reason      TEXT NOT NULL,
  added_by    UUID NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
```

### Service

```typescript
// src/modules/visitors/visitors.service.ts
@Injectable()
export class VisitorsService {
  async preRegister(dto: PreRegisterVisitorDto, hostUserId: string): Promise<Visitor> {
    // 1. Check visitor against blacklist
    await this.checkBlacklist(dto.visitorName, dto.visitorIc, dto.visitorMobile, dto.companyId);

    // 2. Generate QR token
    const rawToken = `VIS-${dto.propertyId.slice(0,8)}-${uuidv4()}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const visitor = await this.visitorRepo.save({
      ...dto,
      qrToken: rawToken,
      qrTokenHash: tokenHash,
      status: 'approved',
    });

    // 3. Send QR pass to visitor via SMS/WhatsApp if mobile provided
    if (dto.visitorMobile) {
      await this.notificationsService.send({
        templateCode: 'visitor_pass_issued',
        companyId: dto.companyId,
        recipientIds: [],  // external recipient — use raw SMS
        channels: ['sms'],
        variables: {
          visitorName: dto.visitorName,
          hostUnit: dto.hostUnitNumber,
          propertyName: dto.propertyName,
          validFrom: dto.validFrom,
          validTo: dto.validTo,
          qrPassUrl: `${process.env.PORTAL_URL}/visitor-pass/${rawToken}`,
        },
        metadata: { toPhone: dto.visitorMobile },
      });
    }

    return visitor;
  }

  async scanQrCode(rawToken: string, guardId: string, gateId: string): Promise<VisitorScanResult> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const visitor = await this.visitorRepo.findOne({
      where: { qrTokenHash: tokenHash },
      relations: ['hostUnit', 'hostUnit.property'],
    });

    if (!visitor) return { authorized: false, reason: 'INVALID_QR' };

    const now = new Date();
    if (now < visitor.validFrom) return { authorized: false, reason: 'PASS_NOT_YET_VALID' };
    if (now > visitor.validTo)   return { authorized: false, reason: 'PASS_EXPIRED' };
    if (visitor.status === 'cancelled') return { authorized: false, reason: 'PASS_CANCELLED' };
    if (visitor.passType === 'single' && visitor.useCount >= (visitor.maxUses ?? 1)) {
      return { authorized: false, reason: 'PASS_ALREADY_USED' };
    }

    // Entry or exit?
    if (visitor.status === 'approved' || visitor.status === 'pending') {
      // Check-in
      await this.visitorRepo.update(visitor.id, {
        status: 'checked_in',
        checkedInAt: now,
        checkInGate: gateId,
        checkInGuardId: guardId,
        useCount: () => 'use_count + 1',
      });
      // Schedule overstay check
      await this.scheduleOverstayCheck(visitor.id, visitor.validTo);

      return {
        authorized: true,
        action: 'check_in',
        visitor: {
          name: visitor.visitorName,
          hostUnit: visitor.hostUnit.unitNumber,
          validTo: visitor.validTo,
          minutesRemaining: Math.ceil((visitor.validTo.getTime() - now.getTime()) / 60000),
        },
      };
    } else if (visitor.status === 'checked_in') {
      // Check-out
      const durationMinutes = Math.ceil((now.getTime() - visitor.checkedInAt!.getTime()) / 60000);
      await this.visitorRepo.update(visitor.id, {
        status: 'checked_out',
        checkedOutAt: now,
        actualDurationMinutes: durationMinutes,
      });

      return { authorized: true, action: 'check_out', visitor: { name: visitor.visitorName } };
    }

    return { authorized: false, reason: 'INVALID_STATE' };
  }

  async requestWalkInApproval(dto: WalkInApprovalRequestDto, guardId: string): Promise<WalkinApproval> {
    const visitor = await this.visitorRepo.save({
      ...dto,
      status: 'pending',
      qrToken: `WALKIN-${uuidv4()}`,
      qrTokenHash: uuidv4(),
    });

    const timeoutAt = addMinutes(new Date(), 5); // 5-minute response window

    const approval = await this.approvalRepo.save({
      visitorId: visitor.id,
      timeoutAt,
    });

    // Push notification to host
    await this.notificationsService.send({
      templateCode: 'visitor_approval_request',
      companyId: dto.companyId,
      recipientIds: [dto.hostUserId],
      channels: ['push', 'in_app'],
      variables: {
        visitorName: dto.visitorName,
        visitorCompany: dto.visitorCompany,
        unitNumber: dto.hostUnitNumber,
        timeoutMinutes: 5,
      },
    });

    // Schedule auto-deny on timeout
    await this.visitorQueue.add('walkin-timeout', { approvalId: approval.id }, { delay: 5 * 60 * 1000 });

    return approval;
  }

  private async scheduleOverstayCheck(visitorId: string, validTo: Date): Promise<void> {
    const delay = validTo.getTime() - Date.now() + 30 * 60 * 1000; // 30 min after expiry
    await this.visitorQueue.add('check-overstay', { visitorId }, { delay });
  }
}
```

---

## API Contract

### `POST /visitors/pre-register`
**Access:** Tenant portal / Resident App

```json
{
  "propertyId": "uuid",
  "hostUnitId": "uuid",
  "visitorName": "David Wong",
  "visitorIc": "S9012345A",
  "visitorMobile": "+65-9555-1234",
  "visitorCompany": "ABC Corp",
  "visitPurpose": "Business meeting",
  "validFrom": "2025-01-20T14:00:00Z",
  "validTo": "2025-01-20T18:00:00Z",
  "vehiclePlate": "SBA1234Z",
  "parkingSlotId": "uuid"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "qrToken": "VIS-abc12345-uuid",
    "qrPassUrl": "https://portal.pms.com/visitor-pass/VIS-abc12345-uuid",
    "validFrom": "2025-01-20T14:00:00Z",
    "validTo": "2025-01-20T18:00:00Z",
    "status": "approved"
  }
}
```

### `GET /visitors/pass/:token`
**Access:** Public (QR pass landing page — shown to visitor on their phone)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "propertyName": "Acme Tower A",
    "propertyAddress": "123 Main St, Singapore",
    "visitorName": "David Wong",
    "hostUnit": "1201",
    "validFrom": "2025-01-20T14:00:00Z",
    "validTo": "2025-01-20T18:00:00Z",
    "status": "approved",
    "qrCodeDataUrl": "data:image/png;base64,..."
  }
}
```

### `POST /visitors/scan`
**Access:** Security App (guard)

```json
{
  "qrToken": "VIS-abc12345-uuid",
  "gateId": "GATE-MAIN",
  "lat": 1.2842,
  "lng": 103.8512
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "authorized": true,
    "action": "check_in",
    "visitor": {
      "name": "David Wong",
      "hostUnit": "1201",
      "validTo": "2025-01-20T18:00:00Z",
      "minutesRemaining": 240,
      "parkingSlot": "B1-045"
    }
  }
}
```

**Unauthorized Response:**
```json
{
  "success": true,
  "data": {
    "authorized": false,
    "reason": "PASS_EXPIRED",
    "message": "This visitor pass expired at 18:00. Please contact the host for a new pass."
  }
}
```

### `POST /visitors/walkin`
**Access:** Security App

```json
{
  "propertyId": "uuid",
  "hostUnitId": "uuid",
  "hostUserId": "uuid",
  "visitorName": "Jane Stranger",
  "visitorIc": "S8800001A",
  "visitPurpose": "Parcel delivery"
}
```

**Response 202 Accepted:**
```json
{
  "success": true,
  "data": {
    "approvalId": "uuid",
    "timeoutAt": "2025-01-20T14:35:00Z",
    "message": "Approval request sent to Unit 1201. Waiting for response (5 minutes)..."
  }
}
```

### `POST /visitors/walkin/respond`
**Access:** Resident App / Tenant Portal

```json
{
  "approvalId": "uuid",
  "response": "approved",
  "reason": null
}
```

### `GET /portal/visitors`
**Access:** Tenant portal  
Returns visitors for the resident's unit.

### `GET /security/visitors/active`
**Access:** Security staff  
Returns currently checked-in visitors across the property.

### `GET /security/visitors/logs`
**Access:** Security staff  
**Query:** `?propertyId=&from=&to=&unitId=&status=&page=1&limit=50`

### `POST /visitors/:id/cancel`
**Access:** Host resident or admin

---

## Business Logic

```
QR token:
  Raw token: "VIS-{propertyId[0:8]}-{uuid}" — sent to visitor
  DB stores SHA-256 hash of raw token only — never raw token
  QR code image generated via 'qrcode' library on demand (not stored)

Walk-in approval timeout:
  Bull job fires at timeoutAt → if no response → auto-deny + guard notified
  Host app shows approval request as push notification with Approve/Deny quick actions
  Response via portal or app → Bull job cancelled

Overstay detection:
  Bull job fires 30 min after validTo
  If visitor still in 'checked_in' status → mark isOverstay=true
  Notify security guard + host unit
  Overstay billing hook (Phase 6 parking module)

Recurring visitors:
  passType='recurring': valid_from/valid_to span multiple days
  max_uses = days × expected visits per day (e.g. daily cleaner = 30 uses/month)
  use_count incremented on each check-in

Blacklist check:
  On pre-register: check visitor_ic OR visitor_mobile OR visitor_name (fuzzy) against blacklist
  If match found: warn host + return warning in response (host can still proceed or cancel)
```

---

---

# Module 5.3 — Facility Booking

**Phase:** 5  
**Stack:** NestJS · PostgreSQL · Redis · React 18 · Flutter (Resident App)  
**Estimated Effort:** 1.5 weeks (1 backend, 0.5 frontend)  
**Depends On:** Module 2.1 (property facilities), 3.1 (billing — for paid bookings), 5.1

---

## DB Schema

```sql
-- Booking rules per facility
CREATE TABLE facility_booking_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id           UUID NOT NULL REFERENCES property_facilities(id) ON DELETE CASCADE,
  property_id           UUID NOT NULL REFERENCES properties(id),
  company_id            UUID NOT NULL REFERENCES companies(id),
  min_duration_minutes  SMALLINT NOT NULL DEFAULT 30,
  max_duration_minutes  SMALLINT NOT NULL DEFAULT 240,
  advance_booking_days  SMALLINT NOT NULL DEFAULT 7,
  max_advance_days      SMALLINT NOT NULL DEFAULT 30,
  max_bookings_per_day  SMALLINT,                    -- per resident per day
  max_bookings_per_week SMALLINT,
  cancellation_hours    SMALLINT DEFAULT 24,         -- hours before booking to cancel free
  is_paid               BOOLEAN NOT NULL DEFAULT FALSE,
  hourly_rate           NUMERIC(10,2),
  flat_rate             NUMERIC(10,2),
  currency              VARCHAR(3) DEFAULT 'USD',
  requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
  auto_approve          BOOLEAN NOT NULL DEFAULT TRUE,
  buffer_minutes        SMALLINT DEFAULT 15,         -- gap between bookings for cleaning
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_facility_rules UNIQUE (facility_id)
);

-- Facility bookings
CREATE TABLE facility_bookings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id),
  facility_id       UUID NOT NULL REFERENCES property_facilities(id),
  unit_id           UUID NOT NULL REFERENCES units(id),
  resident_id       UUID NOT NULL REFERENCES residents(id),
  booking_date      DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  start_at          TIMESTAMPTZ NOT NULL,             -- computed: booking_date + start_time in property tz
  end_at            TIMESTAMPTZ NOT NULL,
  duration_minutes  SMALLINT NOT NULL,
  pax_count         SMALLINT DEFAULT 1,
  purpose           VARCHAR(255),
  status            VARCHAR(20) NOT NULL DEFAULT 'confirmed',
                    -- 'pending'|'confirmed'|'cancelled'|'completed'|'no_show'
  -- Payment
  is_paid_booking   BOOLEAN NOT NULL DEFAULT FALSE,
  charge_amount     NUMERIC(10,2),
  currency          VARCHAR(3),
  invoice_id        UUID REFERENCES invoices(id),
  payment_status    VARCHAR(20) DEFAULT 'not_required',
                    -- 'not_required'|'pending'|'paid'|'refunded'
  -- Approval
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  -- Cancellation
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancellation_fee  NUMERIC(10,2) DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_facility_date ON facility_bookings(facility_id, booking_date);
CREATE INDEX idx_bookings_resident ON facility_bookings(resident_id, booking_date DESC);
CREATE INDEX idx_bookings_status ON facility_bookings(status) WHERE status NOT IN ('cancelled','completed');

-- Blackout dates (maintenance, events, holidays)
CREATE TABLE booking_blackout_dates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id  UUID REFERENCES property_facilities(id) ON DELETE CASCADE,
  property_id  UUID NOT NULL REFERENCES properties(id),
  company_id   UUID NOT NULL REFERENCES companies(id),
  blackout_date DATE NOT NULL,
  from_time    TIME,                                 -- null = all day
  to_time      TIME,
  reason       VARCHAR(255),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Service

```typescript
// src/modules/facility-booking/booking.service.ts
@Injectable()
export class FacilityBookingService {
  async checkAvailability(facilityId: string, date: string, timezone: string): Promise<AvailabilitySlot[]> {
    const facility = await this.facilityRepo.findOneOrFail({ where: { id: facilityId } });
    const rules = await this.rulesRepo.findOneOrFail({ where: { facilityId } });

    // Parse operating hours for this day
    const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][new Date(date).getDay()];
    const operatingHours = facility.operatingHours?.[dayOfWeek];
    if (!operatingHours) return []; // facility closed

    const [openStr, closeStr] = operatingHours.split('-');
    const openMinutes = this.timeToMinutes(openStr);
    const closeMinutes = this.timeToMinutes(closeStr);

    // Get existing confirmed bookings for this day
    const existingBookings = await this.bookingRepo.find({
      where: { facilityId, bookingDate: date, status: Not(In(['cancelled'])) },
      order: { startTime: 'ASC' },
    });

    // Get blackout dates
    const blackouts = await this.blackoutRepo.find({ where: { facilityId, blackoutDate: date } });

    // Generate available slots
    const slots: AvailabilitySlot[] = [];
    const slotDuration = rules.minDurationMinutes;
    const buffer = rules.bufferMinutes;

    let cursor = openMinutes;
    while (cursor + slotDuration <= closeMinutes) {
      const slotEnd = cursor + slotDuration;
      const startTime = this.minutesToTime(cursor);
      const endTime = this.minutesToTime(slotEnd);

      // Check conflicts
      const hasConflict = existingBookings.some(b => {
        const bStart = this.timeToMinutes(b.startTime);
        const bEnd = this.timeToMinutes(b.endTime) + buffer;
        return cursor < bEnd && slotEnd > bStart;
      });

      const isBlackedOut = blackouts.some(bl => {
        if (!bl.fromTime) return true; // all day
        return cursor < this.timeToMinutes(bl.toTime!) && slotEnd > this.timeToMinutes(bl.fromTime);
      });

      slots.push({
        startTime,
        endTime,
        available: !hasConflict && !isBlackedOut,
      });

      cursor += slotDuration;
    }

    return slots;
  }

  async createBooking(dto: CreateBookingDto, residentId: string): Promise<FacilityBooking> {
    const rules = await this.rulesRepo.findOneOrFail({ where: { facilityId: dto.facilityId } });

    // Validate booking rules
    await this.validateBookingRules(dto, rules, residentId);

    // Double-check availability (concurrent request protection via DB unique constraint)
    const conflict = await this.bookingRepo.findOne({
      where: {
        facilityId: dto.facilityId,
        bookingDate: dto.bookingDate,
        status: Not(In(['cancelled'])),
      },
    });
    if (conflict && this.timesOverlap(dto.startTime, dto.endTime, conflict.startTime, conflict.endTime, rules.bufferMinutes)) {
      throw new ConflictException({ code: 'BOOKING_SLOT_TAKEN', message: 'This time slot is no longer available.' });
    }

    const durationMinutes = (this.timeToMinutes(dto.endTime) - this.timeToMinutes(dto.startTime));
    const chargeAmount = rules.isPaid
      ? rules.flatRate ?? (durationMinutes / 60) * (rules.hourlyRate ?? 0)
      : 0;

    const booking = await this.bookingRepo.save({
      ...dto,
      residentId,
      durationMinutes,
      status: rules.requiresApproval ? 'pending' : 'confirmed',
      isPaidBooking: rules.isPaid,
      chargeAmount: rules.isPaid ? chargeAmount : null,
      currency: rules.currency,
      requiresApproval: rules.requiresApproval,
    });

    // Generate invoice if paid booking
    if (rules.isPaid && chargeAmount > 0) {
      const invoice = await this.billingEngine.createManualInvoice({
        tenantId: dto.tenantId!,
        unitId: dto.unitId,
        lines: [{ description: `${dto.facilityName} booking — ${dto.bookingDate} ${dto.startTime}–${dto.endTime}`, amount: chargeAmount }],
      });
      await this.bookingRepo.update(booking.id, { invoiceId: invoice.id, paymentStatus: 'pending' });
    }

    // Notification
    await this.notificationsService.send({
      templateCode: rules.requiresApproval ? 'booking_pending_approval' : 'booking_confirmed',
      companyId: dto.companyId,
      recipientIds: [dto.userId!],
      channels: ['push', 'in_app'],
      variables: { facilityName: dto.facilityName, bookingDate: dto.bookingDate, startTime: dto.startTime, endTime: dto.endTime },
    });

    return booking;
  }

  async cancelBooking(bookingId: string, residentId: string, reason: string): Promise<void> {
    const booking = await this.bookingRepo.findOneOrFail({ where: { id: bookingId } });
    if (booking.residentId !== residentId) throw new ForbiddenException();

    const rules = await this.rulesRepo.findOneOrFail({ where: { facilityId: booking.facilityId } });
    const hoursUntilBooking = (booking.startAt.getTime() - Date.now()) / 3600000;

    let cancellationFee = 0;
    if (booking.isPaidBooking && hoursUntilBooking < rules.cancellationHours) {
      cancellationFee = Number(booking.chargeAmount) * 0.5; // 50% fee for late cancellation
    }

    await this.bookingRepo.update(bookingId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason,
      cancellationFee,
    });

    // Refund invoice if payment was made
    if (booking.invoiceId && booking.paymentStatus === 'paid' && cancellationFee < Number(booking.chargeAmount)) {
      const refundAmount = Number(booking.chargeAmount) - cancellationFee;
      await this.arService.createRefund({ tenantId: booking.tenantId!, amount: refundAmount, reason: 'Facility booking cancellation' });
    }
  }

  private async validateBookingRules(dto: CreateBookingDto, rules: FacilityBookingRules, residentId: string): Promise<void> {
    const errors: string[] = [];
    const durationMins = this.timeToMinutes(dto.endTime) - this.timeToMinutes(dto.startTime);

    if (durationMins < rules.minDurationMinutes) errors.push(`Minimum booking duration is ${rules.minDurationMinutes} minutes`);
    if (durationMins > rules.maxDurationMinutes) errors.push(`Maximum booking duration is ${rules.maxDurationMinutes} minutes`);

    const daysAhead = Math.ceil((new Date(dto.bookingDate).getTime() - Date.now()) / 86400000);
    if (daysAhead < 0) errors.push('Cannot book in the past');
    if (daysAhead < rules.advanceBookingDays) errors.push(`Must book at least ${rules.advanceBookingDays} days in advance`);
    if (daysAhead > rules.maxAdvanceDays) errors.push(`Cannot book more than ${rules.maxAdvanceDays} days ahead`);

    if (rules.maxBookingsPerDay) {
      const todayBookings = await this.bookingRepo.count({
        where: { residentId, facilityId: dto.facilityId, bookingDate: dto.bookingDate, status: Not('cancelled') },
      });
      if (todayBookings >= rules.maxBookingsPerDay) errors.push(`Maximum ${rules.maxBookingsPerDay} bookings per day for this facility`);
    }

    if (errors.length) throw new BadRequestException({ code: 'BOOKING_RULE_VIOLATION', errors });
  }
}
```

---

## API Contract

### `GET /facilities/:facilityId/availability`
**Access:** Tenant portal / Resident App  
**Query:** `?date=2025-01-20&timezone=Asia/Singapore`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "facilityId": "uuid",
    "facilityName": "BBQ Terrace",
    "date": "2025-01-20",
    "operatingHours": "14:00-22:00",
    "slots": [
      { "startTime": "14:00", "endTime": "14:30", "available": true },
      { "startTime": "14:30", "endTime": "15:00", "available": true },
      { "startTime": "15:00", "endTime": "15:30", "available": false },
      { "startTime": "15:30", "endTime": "16:00", "available": false }
    ]
  }
}
```

### `POST /portal/bookings`
**Access:** Tenant portal

```json
{
  "facilityId": "uuid",
  "bookingDate": "2025-01-20",
  "startTime": "18:00",
  "endTime": "22:00",
  "paxCount": 8,
  "purpose": "Birthday celebration"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "facilityName": "BBQ Terrace",
    "bookingDate": "2025-01-20",
    "startTime": "18:00",
    "endTime": "22:00",
    "durationMinutes": 240,
    "status": "confirmed",
    "isPaidBooking": false,
    "chargeAmount": null
  }
}
```

### `GET /portal/bookings`
**Access:** Tenant portal  
**Query:** `?upcoming=true&page=1&limit=10`

### `GET /portal/bookings/:id`

### `POST /portal/bookings/:id/cancel`
```json
{ "reason": "Change of plans" }
```

### `GET /properties/:propertyId/facilities/:facilityId/schedule`
**Access:** `facility.read` (admin)  
Returns all bookings in a date range for admin view.

### `GET /facility-booking-rules/:facilityId`
### `PUT /facility-booking-rules/:facilityId`
**Access:** `facility.manage`

### `POST /facilities/:facilityId/blackout-dates`
```json
{ "blackoutDate": "2025-02-10", "reason": "CNY — facility closed" }
```

---

---

# Module 5.4 — Community Management

**Phase:** 5  
**Stack:** NestJS · PostgreSQL · Socket.IO · React 18 · Flutter  
**Estimated Effort:** 1 week (0.75 backend, 0.25 frontend)  
**Depends On:** Module 5.1, 1.5 (Notifications)

---

## DB Schema

```sql
-- Community announcements
CREATE TABLE announcements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id),
  title           VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL,
  content_html    TEXT,
  category        VARCHAR(50) DEFAULT 'general',     -- 'general'|'maintenance'|'event'|'emergency'|'policy'
  priority        VARCHAR(10) DEFAULT 'normal',      -- 'normal'|'important'|'urgent'
  target_audience VARCHAR(20) DEFAULT 'all',         -- 'all'|'unit_type'|'floor_range'|'specific_units'
  target_config   JSONB,                             -- { unitType: '2br' } or { floors: [1,2,3] }
  attachments     JSONB DEFAULT '[]',
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'draft',       -- 'draft'|'published'|'expired'|'archived'
  send_push       BOOLEAN NOT NULL DEFAULT TRUE,
  send_email      BOOLEAN NOT NULL DEFAULT FALSE,
  view_count      INTEGER DEFAULT 0,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_property ON announcements(property_id, published_at DESC)
  WHERE status = 'published';

-- Announcement read receipts
CREATE TABLE announcement_reads (
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);

-- Polls
CREATE TABLE polls (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  options         JSONB NOT NULL,                    -- [{ id, text, vote_count }]
  poll_type       VARCHAR(10) DEFAULT 'single',      -- 'single'|'multiple'
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) DEFAULT 'active',
  is_anonymous    BOOLEAN DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Poll votes
CREATE TABLE poll_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  option_ids  TEXT[] NOT NULL,                      -- selected option IDs
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_poll_vote UNIQUE (poll_id, user_id)
);

-- Complaints & feedback
CREATE TABLE community_complaints (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  property_id     UUID NOT NULL REFERENCES properties(id),
  unit_id         UUID REFERENCES units(id),
  submitted_by    UUID NOT NULL REFERENCES users(id),
  resident_id     UUID REFERENCES residents(id),
  category        VARCHAR(50) NOT NULL,             -- 'noise'|'cleanliness'|'neighbor'|'management'|'facility'|'other'
  title           VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  is_anonymous    BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
                  -- 'open'|'in_review'|'resolved'|'closed'
  response        TEXT,
  responded_by    UUID REFERENCES users(id),
  responded_at    TIMESTAMPTZ,
  satisfaction_score SMALLINT,                      -- 1-5 post-resolution
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Move-in / Move-out requests
CREATE TABLE move_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  property_id         UUID NOT NULL REFERENCES properties(id),
  unit_id             UUID NOT NULL REFERENCES units(id),
  lease_id            UUID REFERENCES leases(id),
  resident_id         UUID NOT NULL REFERENCES residents(id),
  request_type        VARCHAR(10) NOT NULL,          -- 'move_in'|'move_out'
  requested_date      DATE NOT NULL,
  preferred_time      TIME,
  elevator_booking_id UUID,
  deposit_amount      NUMERIC(15,2),
  deposit_paid        BOOLEAN DEFAULT FALSE,
  inspection_required BOOLEAN NOT NULL DEFAULT TRUE,
  inspection_at       TIMESTAMPTZ,
  inspection_by       UUID REFERENCES users(id),
  inspection_checklist JSONB DEFAULT '[]',
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
                      -- 'pending'|'approved'|'rejected'|'completed'|'cancelled'
  workflow_instance_id UUID,
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## API Contract

### Announcements

### `GET /portal/announcements`
**Access:** Tenant portal  
**Query:** `?category=&priority=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Annual Fire Drill — 20 Jan 2025",
      "preview": "Please be advised that the annual fire drill will be conducted...",
      "category": "maintenance",
      "priority": "important",
      "isPinned": true,
      "publishedAt": "2025-01-13T09:00:00Z",
      "isRead": false
    }
  ]
}
```

### `GET /portal/announcements/:id`
### `POST /portal/announcements/:id/read`

### `POST /admin/announcements`
**Access:** `announcements.create`

```json
{
  "propertyId": "uuid",
  "title": "Annual Fire Drill — 20 Jan 2025",
  "content": "Please be advised that the annual fire drill will be conducted on 20 January 2025, 3:00 PM. All residents must evacuate to the assembly point at the car park B1 entrance.",
  "category": "maintenance",
  "priority": "important",
  "targetAudience": "all",
  "isPinned": true,
  "publishedAt": "2025-01-13T09:00:00Z",
  "expiresAt": "2025-01-20T18:00:00Z",
  "sendPush": true,
  "sendEmail": false
}
```

---

### Polls

### `GET /portal/polls`
### `POST /portal/polls/:id/vote`

```json
{ "optionIds": ["opt-1"] }
```

### `GET /portal/polls/:id/results`
**Access:** After poll ends OR if user has voted

### `POST /admin/polls`

```json
{
  "propertyId": "uuid",
  "title": "Which new facility should we add?",
  "options": [
    { "id": "opt-1", "text": "Co-working space" },
    { "id": "opt-2", "text": "Children playground" },
    { "id": "opt-3", "text": "Dog run area" }
  ],
  "pollType": "single",
  "startAt": "2025-01-15T00:00:00Z",
  "endAt": "2025-01-22T23:59:59Z",
  "isAnonymous": true
}
```

---

### Complaints

### `GET /portal/complaints`
### `POST /portal/complaints`

```json
{
  "category": "noise",
  "title": "Loud music from Unit 1202 past midnight",
  "description": "Persistent loud music from the neighboring unit after midnight on weekends.",
  "isAnonymous": false
}
```

### `POST /admin/complaints/:id/respond`

```json
{ "response": "We have spoken to the tenant in Unit 1202 and reminded them of quiet hours (10PM-8AM). Please let us know if the issue persists." }
```

### `POST /portal/complaints/:id/rate`
```json
{ "satisfactionScore": 4 }
```

---

### Move Requests

### `POST /portal/move-requests`

```json
{
  "requestType": "move_in",
  "requestedDate": "2025-01-28",
  "preferredTime": "10:00",
  "depositAmount": 7000,
  "notes": "Have 2 large sofas and a piano — will need extra time"
}
```

### `GET /portal/move-requests`
### `GET /admin/move-requests`
**Query:** `?propertyId=&status=pending&type=move_in`

### `POST /admin/move-requests/:id/approve`
### `POST /admin/move-requests/:id/complete`

```json
{
  "inspectionChecklist": [
    { "item": "Walls condition", "status": "pass", "notes": "" },
    { "item": "Flooring", "status": "pass", "notes": "Minor scratch in bedroom" },
    { "item": "AC units", "status": "pass", "notes": "" },
    { "item": "Sanitary fittings", "status": "pass", "notes": "" }
  ]
}
```

---

## Business Logic

```
Announcement targeting:
  all → send to all residents in property
  unit_type → filter by unit.unit_type (e.g. all 2BR residents)
  floor_range → filter by unit.floor_number BETWEEN config.from AND config.to
  specific_units → send to config.unitIds list

Announcement push:
  On publish: send push via FCM to all targeted users
  Pinned announcements: appear at top of list regardless of date
  Expired announcements: auto-hidden from portal after expires_at

Poll voting:
  One vote per user per poll (enforced by unique constraint)
  Anonymous polls: vote stored but user_id not exposed in results
  Results only visible after poll ends OR if current user has already voted
  Real-time vote count via WebSocket broadcast on each vote

Complaint anonymous mode:
  isAnonymous=true → submitted_by stored in DB but NOT returned in any API response
  Only company admins with 'complaints.view_identity' permission can see submitter

Move-in inspection checklist:
  Template stored in property.settings.moveInChecklist JSONB
  Admin fills checklist results on site inspection
  Any 'fail' item auto-creates maintenance ticket
  On move-out: compare with move-in photos for damage assessment

Move-out deposit handling:
  If move-out inspection clean → full deposit refund created
  If damage found → deduct repair cost from deposit → create refund for remainder
  Triggers refund workflow (Module 3.2)
```

---

## UI Screens (5.2 + 5.3 + 5.4)

```
portal/
├── PortalVisitors/
│   ├── VisitorListPage.tsx            # upcoming + past visitors per unit
│   └── components/
│       ├── RegisterVisitorModal.tsx
│       ├── VisitorCard.tsx            # name + time + status + QR button
│       ├── QrPassModal.tsx            # shows QR code for sharing
│       └── WalkInApprovalToast.tsx    # push: "David Wong is at the gate. Approve?"

├── PortalBookings/
│   ├── FacilityListPage.tsx           # grid of bookable facilities
│   ├── FacilityDetailPage.tsx
│   └── components/
│       ├── FacilityCard.tsx           # photo + name + hours + "Book" button
│       ├── AvailabilityCalendar.tsx   # month view with colored available/booked days
│       ├── TimeSlotPicker.tsx         # grid of 30-min slots, green=available
│       ├── BookingForm.tsx            # pax count + purpose + submit
│       ├── BookingConfirmCard.tsx
│       └── MyBookingsList.tsx

├── PortalCommunity/
│   ├── CommunityFeedPage.tsx          # timeline: announcements + polls + pinned
│   └── components/
│       ├── AnnouncementCard.tsx       # pinned badge + priority indicator + read overlay
│       ├── AnnouncementDetailPage.tsx
│       ├── PollCard.tsx               # question + options (radio/checkbox) + vote button
│       ├── PollResultsBar.tsx         # horizontal bar chart per option
│       └── ComplaintsPage/
│           ├── ComplaintsList.tsx
│           ├── SubmitComplaintModal.tsx
│           └── ComplaintDetailPage.tsx

└── PortalMoveRequest/
    ├── MoveRequestPage.tsx
    └── components/
        ├── MoveRequestForm.tsx
        └── InspectionChecklistView.tsx

admin/community/
├── AnnouncementsAdmin/
│   ├── AnnouncementTable.tsx
│   ├── AnnouncementEditor.tsx          # rich text editor (Quill/TipTap)
│   └── TargetAudienceSelector.tsx

├── PollsAdmin/
│   └── PollTable.tsx

├── ComplaintsAdmin/
│   ├── ComplaintTable.tsx
│   └── RespondComplaintModal.tsx

└── MoveRequestsAdmin/
    ├── MoveRequestTable.tsx
    └── InspectionForm.tsx
```

---

## State Management (5.2 + 5.3 + 5.4)

```typescript
export const visitorsApi = createApi({
  reducerPath: 'visitorsApi',
  tagTypes: ['Visitors'],
  endpoints: (builder) => ({
    getVisitors: builder.query<PaginatedResponse<Visitor>, VisitorQueryParams>({
      query: (params) => ({ url: '/portal/visitors', params }),
      providesTags: ['Visitors'],
    }),
    preRegisterVisitor: builder.mutation<Visitor, PreRegisterVisitorDto>({
      query: (body) => ({ url: '/visitors/pre-register', method: 'POST', body }),
      invalidatesTags: ['Visitors'],
    }),
    cancelVisitor: builder.mutation<void, string>({
      query: (id) => ({ url: `/visitors/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Visitors'],
    }),
    respondWalkIn: builder.mutation<void, { approvalId: string; response: 'approved' | 'rejected'; reason?: string }>({
      query: ({ approvalId, ...body }) => ({ url: '/visitors/walkin/respond', method: 'POST', body: { approvalId, ...body } }),
    }),
  }),
});

export const bookingsApi = createApi({
  reducerPath: 'bookingsApi',
  tagTypes: ['Bookings', 'Availability'],
  endpoints: (builder) => ({
    getAvailability: builder.query<AvailabilitySlot[], { facilityId: string; date: string }>({
      query: ({ facilityId, date }) => ({ url: `/facilities/${facilityId}/availability`, params: { date } }),
      providesTags: (_, __, { facilityId, date }) => [{ type: 'Availability', id: `${facilityId}-${date}` }],
    }),
    createBooking: builder.mutation<FacilityBooking, CreateBookingDto>({
      query: (body) => ({ url: '/portal/bookings', method: 'POST', body }),
      invalidatesTags: ['Bookings', 'Availability'],
    }),
    getMyBookings: builder.query<FacilityBooking[], { upcoming?: boolean }>({
      query: (params) => ({ url: '/portal/bookings', params }),
      providesTags: ['Bookings'],
    }),
    cancelBooking: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/portal/bookings/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Bookings', 'Availability'],
    }),
  }),
});

export const communityApi = createApi({
  reducerPath: 'communityApi',
  tagTypes: ['Announcements', 'Polls', 'Complaints', 'MoveRequests'],
  endpoints: (builder) => ({
    getAnnouncements: builder.query<PaginatedResponse<Announcement>, AnnouncementQueryParams>({
      query: (params) => ({ url: '/portal/announcements', params }),
      providesTags: ['Announcements'],
    }),
    markAnnouncementRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/portal/announcements/${id}/read`, method: 'POST' }),
      invalidatesTags: (_, __, id) => [{ type: 'Announcements', id }],
    }),
    getPolls: builder.query<Poll[], void>({
      query: () => '/portal/polls',
      providesTags: ['Polls'],
    }),
    votePoll: builder.mutation<void, { pollId: string; optionIds: string[] }>({
      query: ({ pollId, optionIds }) => ({ url: `/portal/polls/${pollId}/vote`, method: 'POST', body: { optionIds } }),
      invalidatesTags: ['Polls'],
    }),
    submitComplaint: builder.mutation<void, CreateComplaintDto>({
      query: (body) => ({ url: '/portal/complaints', method: 'POST', body }),
      invalidatesTags: ['Complaints'],
    }),
    submitMoveRequest: builder.mutation<MoveRequest, CreateMoveRequestDto>({
      query: (body) => ({ url: '/portal/move-requests', method: 'POST', body }),
      invalidatesTags: ['MoveRequests'],
    }),
  }),
});
```
