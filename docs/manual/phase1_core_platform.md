# Phase 1 — Core Platform Foundation
## User Manual & Test Cases

---

## Module 1.1 — Authentication & Security

### 1.1.1 Login

**Navigation:** Direct URL → `/login`

1. Enter your **Company Code** — the system validates it exists before proceeding
2. Enter your **Email** and **Password**
3. Click **Sign In**

💡 If your company has only one tenant, the Company Code field is auto-filled and hidden.

**Features:**
- Company code pre-validation (checks if company exists before showing email/password)
- "Remember Company Code" checkbox saves it to local storage
- Password field has show/hide toggle
- Account locks after 5 consecutive failed attempts (configurable)

### 1.1.2 Multi-Factor Authentication (MFA)

**Navigation:** Redirected automatically after login if MFA is enabled

1. Open your authenticator app (Google Authenticator, Authy, etc.)
2. Enter the **6-digit TOTP code**
3. Click **Verify**

**First-time MFA Setup:**
1. Go to **Profile → Security**
2. Click **Enable MFA**
3. Scan the QR code with your authenticator app
4. Enter the displayed code to confirm setup
5. Save the **recovery codes** securely

### 1.1.3 Password Recovery

**Navigation:** Login page → "Forgot Password?"

1. Enter your **Company Code** and **Email**
2. Click **Send Reset Link** 📧
3. Check your email for the password reset link
4. Click the link, enter your **New Password** (must meet complexity requirements)
5. Click **Reset Password**

**Password Policy:**
- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 digit, 1 special character
- Cannot reuse last 5 passwords

### 1.1.4 Session Management

**Navigation:** Profile → Security → Active Sessions

- View all active sessions across devices
- See IP address, browser/device info, last activity time
- **Revoke** individual sessions or **Revoke All** except current
- Sessions auto-expire after configurable idle timeout

### 1.1.5 IP Restriction Policies

**Navigation:** 🔐 Admin → Security → IP Policies

- Create **allowlist** or **blocklist** IP rules
- Apply rules globally or per user
- Supports individual IPs and CIDR ranges (e.g., `192.168.1.0/24`)
- Block entries show custom deny message

---

## Module 1.2 — User & Role Management

### 1.2.1 User Management

**Navigation:** 🔐 Admin → Users (`/admin/users`)

**User List:**
- Searchable/filterable table of all company users
- Filter by: Status (active/inactive/locked), Role, Department
- Sort by name, email, last login, created date
- Bulk actions: Activate, Deactivate, Reset Password

**Create User:**
1. Click **+ New User**
2. Fill in: First Name, Last Name, Email, Phone
3. Assign **Role(s)** and optionally scope to a **Property**
4. Assign **Department** and **Position**
5. Choose whether to send an **invite email** 📧
6. Click **Save**

**User Detail Page** (`/admin/users/:id`):
- Profile tab — personal info, avatar, timezone
- Roles tab — assigned roles with property scoping
- Sessions tab — active sessions with revoke option
- Audit Log tab — all actions performed by/on this user

### 1.2.2 Role Management

**Navigation:** 🔐 Admin → Roles (`/admin/roles`)

- View all roles with permission count
- **System roles** (Admin, Property Manager, etc.) are read-only
- Create **Custom Roles** with granular permission matrix

**Creating a Custom Role:**
1. Click **+ New Role**
2. Enter Role Name and Description
3. Check permissions from the permission matrix:
   - Users, Properties, Tenants, Leases, Billing, Maintenance, etc.
   - Each module has: Read, Create, Update, Delete, Manage
4. Click **Save**

### 1.2.3 Department & Position Management

**Navigation:** 🔐 Admin → Departments / Positions

- Create departments with optional parent (hierarchy support)
- Create positions with department assignment
- Used for organizational charts and workflow routing

---

## Module 1.3 — Organization Management

### 1.3.1 Company Settings

**Navigation:** 🔐 Admin → Company (`/admin/company`)

- **General:** Company name, code, logo, timezone, currency
- **Address:** Registered address, tax ID, registration number
- **Features:** Toggle modules on/off (Mall, Condo, BI, etc.)
- **Branding:** Primary color, logo upload for portal/emails

### 1.3.2 Branch Management

**Navigation:** 🔐 Admin → Branches (`/admin/branches`)

- Multi-branch support for companies with multiple locations
- Each branch has: Name, Code, Address, Contact Info
- Properties are assigned to branches

### 1.3.3 SSO Configuration

**Navigation:** 🔐 Admin → SSO (`/admin/sso`)

- Configure Azure AD, Okta, or Google Workspace
- Set Client ID, Client Secret, Tenant ID
- Enable/disable SSO login for the company
- Auto-provisioning of SSO users (JIT provisioning)

---

## Module 1.4 — Workflow Engine

### 1.4.1 Workflow Templates

**Navigation:** 🔐 Admin → Workflows (`/admin/workflows`)

- Create multi-step approval workflows
- Apply to: Lease Approvals, Work Orders, Purchase Requests, Leave Requests
- Steps can be: Sequential, Parallel, or Conditional

**Creating a Workflow:**
1. Click **+ New Workflow**
2. Enter Name, Description, Category
3. Add **Steps** (each has: step name, approver role/user, SLA hours)
4. Configure **conditions** (e.g., "if amount > $10,000 → add Finance VP step")
5. Set **escalation rules** (auto-escalate after SLA breach)
6. Click **Publish**

### 1.4.2 My Tasks

**Navigation:** Dashboard → My Tasks (`/admin/my-tasks`)

- View all pending approval tasks assigned to you
- Filter by: Status (pending/approved/rejected), Category, Priority
- One-click Approve/Reject with optional comments
- View full request details before deciding

---

## Module 1.5 — Notification Center

### 1.5.1 Notification Preferences

**Navigation:** Profile → Notifications

- Configure per-channel preferences:
  - **In-App** (real-time bell icon ⚡)
  - **Email** 📧
  - **Push** (mobile apps)
- Toggle by event category (Lease Events, Maintenance, Billing, etc.)

### 1.5.2 Notification Administration

**Navigation:** 🔐 Admin → Notifications (`/admin/notifications`)

- View all notification templates
- Edit email subject/body templates
- Configure delivery channels per event type
- View delivery logs and failure stats

---

## Module 1.6 — Document Management

### 1.6.1 Document Library

**Navigation:** Documents (`/documents`)

- Folder-based document organization
- Upload files (drag & drop or click)
- Preview PDFs, images, and common file types in-browser
- Version history for every document
- Full-text search across document contents

### 1.6.2 Document Sharing

- Share documents via **secure link** (with optional expiry date and password)
- Set access permissions: View Only, Download, Edit
- Track who accessed shared documents (audit log)

### 1.6.3 Document Tags & Categories

- Tag documents with custom labels
- Filter documents by tags, type, upload date, uploader
- Bulk tag/move operations

---

## Module 1.7 — Dashboard & Analytics

### 1.7.1 Main Dashboard

**Navigation:** `/dashboard`

- **KPI Cards:** Occupancy Rate, Monthly Revenue, Pending Invoices, Open Tickets
- **Charts:** Revenue trend (line), Occupancy by property (bar), Lease expiry timeline
- **Quick Actions:** Create Tenant, New Maintenance Ticket, Generate Invoice
- **Recent Activity Feed:** Latest system events across all modules
- Property selector dropdown to filter dashboard data

### 1.7.2 Reports & Exports

- Export dashboard data as CSV or PDF
- Schedule recurring report delivery via email
- Customizable date range filters

---

## Phase 1 — Test Cases (20 Test Cases)

### Authentication (TC-1.01 to TC-1.05)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-1.01 | Valid Login | 1. Enter valid company code 2. Enter valid email/password 3. Click Sign In | User is redirected to Dashboard. JWT token stored in cookie. | Critical |
| TC-1.02 | Invalid Password (5 attempts) | 1. Enter valid company code/email 2. Enter wrong password 5 times | Account locked after 5th attempt. Error: "Account locked. Contact admin." | Critical |
| TC-1.03 | MFA Verification | 1. Login with valid credentials (MFA enabled) 2. Enter valid TOTP code 3. Click Verify | User redirected to Dashboard. MFA verified flag set. | Critical |
| TC-1.04 | Password Reset Flow | 1. Click "Forgot Password" 2. Enter company code + email 3. Click link in email 4. Enter new password | Password updated. User can login with new password. Old password rejected. | High |
| TC-1.05 | Session Revocation | 1. Login on Device A and Device B 2. On Device A, go to Security → Sessions 3. Click Revoke on Device B session | Device B session invalidated. Device B redirected to login on next request. | High |

### User & Role Management (TC-1.06 to TC-1.10)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-1.06 | Create User with Invite | 1. Navigate to Admin → Users 2. Click + New User 3. Fill all fields 4. Enable "Send Invite" 5. Save | User created with status "invited". Email sent with accept-invite link. | High |
| TC-1.07 | Custom Role Creation | 1. Go to Admin → Roles 2. Click + New Role 3. Name: "Leasing Coordinator" 4. Select leases.read, tenants.read, crm.manage 5. Save | Role created. Can be assigned to users. Users with this role can only access selected modules. | High |
| TC-1.08 | Property-Scoped Role | 1. Edit user 2. Assign "Property Manager" role 3. Scope to "Tower A" property only | User sees only Tower A data in all modules. Other properties hidden. | High |
| TC-1.09 | Deactivate User | 1. Go to user list 2. Select active user 3. Click Deactivate | User status changes to inactive. User cannot login. All active sessions revoked. | Medium |
| TC-1.10 | Department Hierarchy | 1. Create "Operations" department 2. Create "Maintenance" as child of Operations 3. Assign users | Department tree displays correctly. Users show correct department in profile. | Medium |

### Workflows (TC-1.11 to TC-1.13)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-1.11 | Create Approval Workflow | 1. Go to Admin → Workflows 2. Click + New 3. Add 3 steps (Manager → Finance → Director) 4. Set SLA 24h each 5. Publish | Workflow active. New lease requests follow this approval chain. | High |
| TC-1.12 | Approve Task | 1. Login as approver 2. Go to My Tasks 3. Click pending request 4. Review details 5. Click Approve | Task moves to next step (or completed if final). Requester notified. | High |
| TC-1.13 | Reject with Comment | 1. Login as approver 2. Open pending task 3. Click Reject 4. Enter reason | Task status: Rejected. Requester receives rejection notification with reason. | High |

### Documents (TC-1.14 to TC-1.16)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-1.14 | Upload Document | 1. Go to Documents 2. Click Upload 3. Select PDF file 4. Add tags | File uploaded. Preview loads. Tags searchable. | Medium |
| TC-1.15 | Share with Secure Link | 1. Select document 2. Click Share 3. Set expiry 7 days, enable password 4. Copy link | Shared link works. Password required. Expires after 7 days. | Medium |
| TC-1.16 | Version History | 1. Upload document v1 2. Upload same name again (v2) 3. View version history | Both versions listed. Can download either. v2 is current. | Medium |

### Dashboard & Notifications (TC-1.17 to TC-1.20)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| TC-1.17 | Dashboard KPI Cards | 1. Login as admin 2. Navigate to Dashboard 3. Select a property | KPI cards show occupancy %, revenue, pending invoices, open tickets for selected property. | High |
| TC-1.18 | Real-time Notification | 1. User A creates a maintenance ticket 2. User B (property manager) is logged in | User B sees bell icon badge increment in real-time. Notification appears in dropdown. | Medium |
| TC-1.19 | Email Notification | 1. Create a lease expiring in 30 days 2. Wait for scheduled notification job | Property manager receives email with lease expiry warning. | Medium |
| TC-1.20 | Export Dashboard PDF | 1. Go to Dashboard 2. Click Export → PDF | PDF generated with current KPI data and charts. File downloads. | Low |
