# Phase 5 — Tenant Experience & Mobile Applications
## User Manual & Test Cases

---

## Module 5.1 — Tenant & Resident Portal

### 5.1.1 Portal Overview

**Navigation:** Tenants access via separate URL (`/portal`) or subdomain

The Tenant Portal is a self-service web application where tenants and residents can:
- View their lease details and documents
- See and pay invoices online
- Submit maintenance requests
- Book community facilities
- Manage visitor passes
- Participate in community polls
- Update their profile and contacts

### 5.1.2 Portal Login

1. Navigate to the portal URL
2. Enter credentials (received via email when portal access was enabled)
3. First-time users must set their password
4. Optional: Enable MFA for additional security

### 5.1.3 Portal Dashboard

- **My Unit(s):** Unit number, property, floor, lease status
- **Outstanding Balance:** Current amount owed with "Pay Now" button
- **Recent Invoices:** Last 5 invoices with status
- **Active Requests:** Maintenance tickets submitted
- **Upcoming Bookings:** Facility reservations
- **Community Updates:** Latest announcements and polls

### 5.1.4 Invoice & Payments

- View all invoices with status (Paid, Pending, Overdue)
- Download PDF invoices
- **Online Payment:** Integration with Stripe/PayTabs
- Payment history with receipts
- Auto-pay setup for recurring charges

### 5.1.5 Maintenance Requests (Portal)

1. Click **+ New Request**
2. Select category (Plumbing, Electrical, etc.)
3. Enter description
4. Upload photos
5. Choose preferred time for access
6. Submit → Track status in real-time ⚡

### 5.1.6 Portal Branding

**Navigation:** 🔐 Admin → Portal Branding (`/admin/portal-branding`)

- Customize portal: Logo, Primary color, Welcome message
- Set property-specific branding
- Upload cover images for portal homepage

### 5.1.7 Portal Analytics

**Navigation:** 🔐 Admin → Portal Analytics (`/admin/portal-analytics`)

- Active users, Login frequency, Feature usage
- Most-used features breakdown
- Tenant engagement score

---

## Module 5.2 — Visitor Management

### 5.2.1 Pre-Registration (by Tenant)

**Portal Navigation:** Visitors → + Register Visitor

1. Enter visitor: Name, Phone, Email
2. Select visit date and expected time
3. Choose purpose: Guest, Delivery, Contractor, Event
4. Add vehicle info (optional): License plate, vehicle type
5. Submit → Visitor receives **QR code** via SMS/Email 📧

### 5.2.2 Visitor Check-In (by Security)

**Security App / Admin:**

1. Visitor arrives and shows QR code
2. Security scans QR via mobile app
3. System validates: ✅ Pre-registered, ✅ Active pass, ✅ Date matches
4. Photo captured (optional)
5. Visitor badge printed
6. Tenant receives arrival notification ⚡

### 5.2.3 Walk-In Visitors

1. Security clicks **+ Walk-In**
2. Enter visitor details and host tenant
3. Host tenant receives approval request ⚡
4. Tenant approves/rejects from portal or mobile app
5. If approved → check-in completed

### 5.2.4 Visitor Check-Out

- Security scans QR or manually checks out visitor
- Duration logged automatically
- Tenant notified of departure

### 5.2.5 Visitor Reports

- Daily visitor log with entry/exit times
- Frequent visitors report
- Peak hours analysis
- Blocked visitors list

---

## Module 5.3 — Facility Booking

### 5.3.1 Available Facilities

**Portal Navigation:** Facilities

- View all bookable amenities: Pool, Gym, BBQ Area, Party Room, Tennis Court, etc.
- See photos, capacity, rules, and available time slots
- Real-time availability calendar

### 5.3.2 Make a Booking

1. Select facility
2. Choose date and time slot
3. Enter: Number of guests, Purpose (optional)
4. Review booking fee (if applicable)
5. Confirm → Payment processed (if paid facility)
6. Booking confirmation sent via email 📧

### 5.3.3 Booking Rules

- Configured per facility:
  - Max booking duration (e.g., 2 hours)
  - Max advance booking (e.g., 14 days ahead)
  - Min cancellation notice (e.g., 24 hours)
  - Max bookings per tenant per week
  - Deposit requirements
  - Blackout dates (maintenance days)

### 5.3.4 Booking Management (Admin)

**Navigation:** 🔐 Operations → Facility Bookings (`/admin/facility-booking`)

- View all bookings in calendar or list view
- Approve/reject pending bookings (if approval required)
- Override booking rules for special cases
- Block facility for maintenance

---

## Module 5.4 — Community Features

### 5.4.1 Announcements

**Admin:** Community → Announcements (`/admin/community`)
**Portal:** Community page

- Admin posts announcements: Title, Body, Category, Attachments
- Target audience: All tenants, Specific property, Specific tower
- Delivery: In-app + Email + Push notification
- Pin important announcements to top
- Read receipts tracking

### 5.4.2 Community Polls

**Admin:** Community → Create Poll

1. Enter question and options
2. Set voting period (start/end date)
3. Choose: Anonymous or Named voting
4. Single-select or multi-select
5. Publish → Tenants notified 📧

**Portal:** Tenants view active polls and vote. Results shown after poll closes (or in real-time if configured).

### 5.4.3 Complaints

**Portal:** Submit Complaint

1. Select category (Noise, Parking, Facilities, Management, Other)
2. Enter description
3. Upload evidence (photos, video)
4. Submit → Tracked similar to maintenance tickets

**Admin:** View, assign, respond, and resolve complaints. Status tracking and resolution notes.

### 5.4.4 Move Requests

**Portal:** Request Move-In or Move-Out

1. Select type: Move-In or Move-Out
2. Preferred date and time
3. Special requirements (elevator booking, parking spot, etc.)
4. Submit → Admin approves and schedules 🔄

---

## Module 5.5 — Mobile Applications (Flutter)

### 5.5.1 Resident App

Available on: iOS + Android

**Features:**
- Dashboard with unit info and balance
- Pay invoices (Stripe/PayTabs)
- Submit/track maintenance requests with photo upload
- Register visitors with QR generation
- Book facilities
- View announcements and vote in polls
- Push notifications for all events

### 5.5.2 Technician App

**Features:**
- Task queue with priority-sorted tickets
- Start/stop work timer
- Checklist completion for PM tasks
- Photo documentation
- Material request from inventory
- Route optimization for multiple tasks

### 5.5.3 Security App

**Features:**
- QR scanner for visitor check-in/out
- Patrol route with checkpoint scanning
- Incident reporting with camera integration
- Access card management
- Emergency alert broadcast

### 5.5.4 Manager App

**Features:**
- KPI dashboard (occupancy, revenue, tickets)
- Approval actions (approve/reject from phone)
- Property walk-through notes
- Team management
- Push notifications for escalations

---

## Phase 5 — Test Cases (20 Test Cases)

### Tenant Portal (TC-5.01 to TC-5.06)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-5.01 | Portal First Login | 1. Enable portal access for tenant 2. Tenant clicks invite link 3. Sets password 4. Login | Dashboard loads with unit info, balance, and recent invoices. Welcome message displayed. | Critical |
| TC-5.02 | Online Payment | 1. Login to portal 2. Click "Pay Now" on invoice 3. Enter card details 4. Confirm | Payment processed via Stripe. Invoice status → Paid. Receipt generated. Email confirmation sent. | Critical |
| TC-5.03 | Submit Maintenance Request | 1. Portal → + New Request 2. Category: HVAC 3. Upload photo 4. Set preferred time 5. Submit | Ticket created. Tenant sees status "New". Admin notified. Appears in maintenance queue. | High |
| TC-5.04 | Track Request Status | 1. Submit request 2. Admin assigns technician 3. Technician starts work 4. Refresh portal | Status updates in real-time: New → Assigned → In Progress. Each transition timestamped. | High |
| TC-5.05 | Auto-Pay Setup | 1. Portal → Payments → Auto-Pay 2. Enter card details 3. Enable monthly auto-pay | On billing date, payment auto-processed. Tenant receives confirmation. No manual action needed. | Medium |
| TC-5.06 | Portal Branding | 1. Admin → Portal Branding 2. Upload logo, set color #1E40AF 3. Set welcome message 4. Save | Portal reflects custom logo, blue theme, and welcome message. Consistent across all pages. | Medium |

### Visitor Management (TC-5.07 to TC-5.11)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-5.07 | Pre-Register Visitor | 1. Portal → Visitors → + Register 2. Name: "Bob Smith" 3. Date: Tomorrow 4. Purpose: Guest 5. Submit | Visitor pass created. QR code generated. Bob receives QR via email/SMS. | High |
| TC-5.08 | QR Check-In | 1. Bob arrives at gate 2. Shows QR to security 3. Security scans via app | ✅ Valid pass confirmed. Check-in recorded with timestamp. Host tenant notified "Bob has arrived." | Critical |
| TC-5.09 | Walk-In Approval | 1. Unregistered visitor arrives 2. Security creates walk-in entry 3. Tenant receives approval request 4. Tenant approves | Visitor checked in. Temporary pass created. Duration tracked. | High |
| TC-5.10 | Visitor Check-Out | 1. Bob is leaving 2. Security scans QR or clicks "Check Out" | Visit duration logged. Pass deactivated. Cannot re-enter with same QR. | High |
| TC-5.11 | Block Visitor | 1. Admin → Visitors → Block List 2. Add "Bad Actor" with reason | Any future registration for this person is flagged. Security alerted on check-in attempt. | Medium |

### Facility Booking (TC-5.12 to TC-5.15)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-5.12 | Book Facility | 1. Portal → Facilities 2. Select "Swimming Pool" 3. Date: Saturday 10AM-12PM 4. Guests: 3 5. Confirm | Booking created. Slot marked as taken. Confirmation email sent. Calendar updated. | High |
| TC-5.13 | Double-Booking Prevention | 1. Tenant A books Pool Saturday 10-12 2. Tenant B tries to book Pool Saturday 11-1 | Tenant B sees "Slot unavailable". Suggested alternatives shown. Cannot proceed. | Critical |
| TC-5.14 | Cancel Booking | 1. Open upcoming booking 2. Click Cancel 3. Within 24h notice period | Booking cancelled. Slot freed. Refund processed (if paid). Cancellation notification sent. | High |
| TC-5.15 | Admin Override | 1. Admin blocks BBQ Area for maintenance 2. Tenant tries to book | Date shows as "Unavailable — Maintenance". Existing bookings for that date auto-cancelled with notice. | Medium |

### Community (TC-5.16 to TC-5.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-5.16 | Post Announcement | 1. Admin → Community → + Announcement 2. Title: "Water Shutdown" 3. Body: details 4. Target: All 5. Post | Announcement appears on all tenant portals. Push notification sent. Email sent. Read tracking starts. | High |
| TC-5.17 | Community Poll | 1. Admin creates poll: "Paint lobby color?" 2. Options: White, Beige, Gray 3. Voting period: 7 days 4. Anonymous 5. Publish | Poll appears on portal. Tenants can vote. Results hidden until poll closes. Final results show percentages. | Medium |
| TC-5.18 | Submit Complaint | 1. Portal → Complaints → + New 2. Category: Noise 3. Describe: "Loud music Unit B-410" 4. Submit | Complaint logged. Admin notified. Status trackable by tenant. Resolution notes visible when resolved. | Medium |
| TC-5.19 | Move-Out Request | 1. Portal → Move Request 2. Type: Move-Out 3. Date: Sept 30 4. Elevator booking: 2-4PM 5. Submit | Request created. Admin receives for approval. Calendar blocked for elevator. Checkout checklist triggered. | Medium |
| TC-5.20 | Mobile Push Notification | 1. Admin posts urgent announcement 2. Resident has mobile app installed | Push notification appears on phone within 30 seconds. Tapping opens announcement in app. | High |
