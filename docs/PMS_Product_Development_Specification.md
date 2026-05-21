
PRODUCT DEVELOPMENT SPECIFICATION
Property Management System
PMS

Tech Stack: Node.js | React | PostgreSQL | Redis
6 Phases • 18+ Months • 12 Core Module Groups
Prepared: May 15, 2026

# Table of Contents

# 1. Executive Summary
This document defines the full-scope Product Development Specification for a multi-tenant, cloud-native Property Management System (PMS). The system is designed to serve commercial and residential real estate operators — including office towers, shopping malls, residential condominiums, mixed-use developments, and multi-property portfolios.
Built on a Node.js (Express) backend with Prisma ORM and a React frontend, the PMS is structured across six sequential development phases spanning approximately 18–24 months. Each phase delivers independently deployable, production-ready modules, allowing stakeholders to realize value progressively while the platform grows toward its full capability.

# 2. Product Goals & Objectives
## 2.1 Primary Goals
Centralize all property operations — leasing, billing, maintenance, and tenant communication — into a single platform.
Provide a configurable, multi-company and multi-property architecture suitable for large portfolio operators.
Deliver mobile-first experiences for residents, technicians, security staff, and managers.
Enable data-driven decision-making through embedded BI, KPI dashboards, and AI-assisted insights.
Support integration with third-party systems: payment gateways, smart meters, RFID, CCTV, and ERP/accounting platforms.
## 2.2 Non-Goals (Out of Scope)
Property listing / marketplace functionality (MLS integration, public-facing listings site).
Construction project management or BIM integration.
Human Resources or full Payroll processing.
IoT device firmware management.

# 3. Technology Stack
The platform follows a layered, microservice-ready architecture. All components are containerized via Docker and deployable to AWS, Azure, or on-premise Kubernetes clusters.

# 4. System Architecture Overview
## 4.1 Architecture Pattern
The system adopts a Modular Monolith with a clear path to microservices. Each domain (Leasing, Billing, Maintenance, etc.) is isolated as an Express module with its own routes, service, and Prisma repository layer. Inter-module communication uses internal service interfaces in Phase 1–3, migrating to an event bus (Apache Kafka or AWS SQS) in Phase 4+.
## 4.2 Multi-Tenancy Strategy
Row-Level Security (RLS) in PostgreSQL separates tenant data. Each authenticated JWT carries a companyId and propertyId claim. A global Express middleware injects the tenant context into every database query via Prisma middleware.
## 4.3 API Design Principles
RESTful JSON APIs for CRUD operations; GraphQL for complex reporting queries.
API versioning via URL prefix (/api/v1/, /api/v2/).
OpenAPI 3.0 (Swagger) documentation maintained via dedicated spec files.
Standardized response envelope: { success, data, meta, errors }.
Cursor-based pagination for all list endpoints.

# 5. Development Phases — Summary
The PMS is delivered in six phases. Each phase concludes with a formal UAT (User Acceptance Testing) milestone, a staging deployment, and a production release candidate.

Phase 1 establishes the foundational infrastructure that every subsequent module depends on. No functional property or lease workflows can exist without a secure, multi-tenant platform core. This phase ships as a fully deployable SaaS skeleton.
## 1.1 Authentication & Security
Implements JWT-based session management with configurable token expiry, refresh token rotation, and device-level tracking. Supports external SSO via SAML 2.0 and OAuth2 (Google, Microsoft Azure AD).
## 1.2 User & Role Management
RBAC with dynamic permission overrides. Roles are templated (Admin, Manager, Finance, Maintenance, Tenant) but fully customizable. Department and position hierarchies control approval routing in later phases.
## 1.3 Organization Management
Multi-company (holding + subsidiaries), multi-branch, multi-property hierarchy. All subsequent data is scoped to the organization tree node.
## 1.4 Workflow Engine
Visual BPMN-based workflow designer. Used by Lease Approvals, Maintenance Escalation, Vendor PO Approval, Move-In/Out, and more. Supports parallel and sequential approvals, conditional branching, SLA timers, and auto-escalation.
## 1.5 Notification Center
Centralized notification dispatch with channel routing rules. Supports templated messages with merge fields. Users configure their preferred channels per notification category.
## 1.6 Document Management
Secure file storage with metadata, versioning, and lifecycle management. OCR via Tesseract/AWS Textract enables full-text search of uploaded documents.
## 1.7 Dashboard & Analytics (Foundation)
Configurable KPI widget framework deployed in Phase 1 with stub data providers. Real data populates as each domain module ships in subsequent phases.

Phase 2 introduces the core real estate data model — properties, towers, units, and their attributes — and the complete leasing lifecycle from prospect inquiry through contract execution and renewal.
## 2.1 Property Management
## 2.2 Tower, Block & Unit Management
## 2.3 Tenant Management
## 2.4 Lease Management
## 2.5 CRM & Leasing
## 2.6 Parking Management

Phase 3 delivers the complete financial stack. The Billing Engine automates rent, utility, service charge, and penalty invoicing. Accounts Receivable and Payable modules handle the full cash cycle, feeding into a proper General Ledger and management reporting suite.
## 3.1 Billing Engine
## 3.2 Accounts Receivable
## 3.3 Accounts Payable
## 3.4 General Ledger
## 3.5 Budgeting & Fixed Assets
## 3.6 Banking & Reconciliation

Phase 4 covers all physical operations — reactive maintenance ticketing, preventive maintenance scheduling, facility and equipment management, spare parts inventory, housekeeping, and security incident management.
## 4.1 Maintenance Management
## 4.2 Preventive Maintenance
## 4.3 Facility & Inventory Management
## 4.4 Housekeeping & Security

Phase 5 puts the platform directly in the hands of end users through self-service portals and purpose-built mobile applications for residents, technicians, security staff, and managers.
## 5.1 Tenant & Resident Portals
## 5.2 Visitor Management
## 5.3 Facility Booking & Community
## 5.4 Mobile Applications
Four purpose-built React Native (Expo) applications share a common component library and authentication layer. Each app is published to iOS App Store and Google Play.

Phase 6 delivers vertical-specific modules for Shopping Malls and Residential Condominiums, an advanced BI/AI analytics layer, and enterprise integration connectors. These modules extend the platform from a general PMS into a specialized real estate operations suite.
## 6.1 Shopping Mall Specific
## 6.2 Condo & Residential Specific
## 6.3 Advanced BI & AI Insights
## 6.4 Enterprise Integrations

# 7. Core Data Model Entities
Below are the primary database entities and their key relationships. All tables include standard audit columns: created_at, updated_at, created_by, updated_by, is_deleted (soft delete).

# 8. Non-Functional Requirements
## 8.1 Performance
API response time: p95 < 300ms for CRUD endpoints under 1,000 concurrent users.
Dashboard load time: < 2 seconds with full KPI data for up to 500 properties.
Billing engine: Generate 10,000 invoices in < 5 minutes via Bull queue workers.
Mobile apps: First Contentful Paint < 1.5 seconds on 4G network.
## 8.2 Scalability
Horizontal scaling via Kubernetes HPA (CPU/memory threshold-based autoscaling).
PostgreSQL read replicas for reporting queries; write on primary only.
Redis Cluster for distributed caching and session storage.
S3-backed document storage with CloudFront CDN for global distribution.
## 8.3 Security
OWASP Top 10 compliance verified per phase via automated SAST (Snyk / SonarQube).
All data encrypted at rest (AES-256) and in transit (TLS 1.3+).
PII data masked in logs and analytics pipelines.
Annual penetration testing by certified third party.
GDPR / PDPA compliance: data retention policies, right-to-erasure workflow.
## 8.4 Availability & Reliability
Target SLA: 99.9% uptime (< 8.7 hours downtime/year) per environment.
Zero-downtime deployments via rolling update strategy in Kubernetes.
Automated daily database backups with 30-day retention; PITR (Point-in-Time Recovery) enabled.
Multi-AZ deployment for production; DR environment in separate region with 15-minute RTO.

# 9. Testing Strategy

# 10. Suggested Team Structure

Total estimated team size: 14–16 people. Phases 1–2 can be delivered with a core team of 10; scaling to full team for Phases 3–6.

# 11. Risk Register

# 12. Milestones & Delivery Schedule

— End of Product Development Specification —
Version 1.0 • Confidential • Property Management System

| Layer | Technology | Package / Tool | Purpose |
|---|---|---|---|
| Frontend | React 18+ | Vite, TypeScript, Tailwind CSS | Main web portal & dashboards |
| Frontend | React Native | Expo, React Navigation | Resident, Technician & Security apps |
| State Mgmt | Redux Toolkit | RTK Query, Zustand | Global state, API caching |
| Backend | Node.js 20+ | Express framework, Prisma ORM, TypeScript | REST APIs |
| API Gateway | Kong / NGINX | Rate limiting, JWT validation | Routing, load balancing |
| Database | PostgreSQL 15+ | Prisma ORM | Primary relational data store |
| Cache | Redis 7+ | ioredis, Bull queues | Session, caching, job queues |
| Search | Elasticsearch | Kibana, elastic-builder | Full-text search, audit logs |
| File Storage | AWS S3 / MinIO | multer, sharp, pdf-lib | Documents, images, media |
| Auth | Passport.js / Keycloak | JWT, OAuth2, TOTP (MFA) | Authentication & SSO |
| Email/SMS | SendGrid / Twilio | Nodemailer, WhatsApp Business API | Notifications & alerts |
| Payments | Stripe / PayTabs | Webhooks, reconciliation | Online payment gateway |
| DevOps | Docker + Kubernetes | Helm, ArgoCD, Terraform | CI/CD, IaC |
| Monitoring | Prometheus + Grafana | ELK Stack, Sentry | Observability & error tracking |
| Testing | Jest + Cypress | Supertest, Playwright | Unit, integration, E2E |

| Phase | Name | Timeline | Modules | Key Deliverables |
|---|---|---|---|---|
| Phase 1 | Core Platform Foundation | Months 1–3 | 7 Modules | Auth, Users, Org, Workflow, Notifications, Documents, Dashboard |
| Phase 2 | Property & Leasing | Months 4–6 | 5 Modules | Property structure, Units, Lease management, CRM, Parking |
| Phase 3 | Billing & Finance | Months 7–9 | 6 Modules | Billing engine, AR/AP, General Ledger, Budgeting, Assets, Banking |
| Phase 4 | Maintenance & Facility | Months 10–12 | 6 Modules | Ticketing, Preventive Maint., Facility Mgmt, Inventory, Housekeeping, Security |
| Phase 5 | Tenant Experience & Mobile | Months 13–15 | 5 Modules | Tenant/Resident Portal, Visitor Mgmt, Facility Booking, Community, Mobile Apps |
| Phase 6 | Vertical Specializations & BI | Months 16–18+ | 8 Modules | Mall-specific, Condo-specific, Advanced BI, AI Insights, Integrations |

| Phase 1: Core Platform Foundation Authentication • Users & Roles • Organization • Workflow Engine • Notifications • Documents • Dashboard | Timeline Months 1 – 3 |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Login / Logout | Email+password, remember-me, session invalidation, concurrent session limits | POST /auth/login, POST /auth/logout, POST /auth/refresh |
| SSO & OAuth2 | SAML 2.0, Google OAuth, Azure AD, JWT issuance | GET /auth/sso/:provider, POST /auth/sso/callback |
| MFA / 2FA | TOTP (Google Authenticator), SMS OTP, backup codes | POST /auth/mfa/enable, POST /auth/mfa/verify |
| Device Management | Registered devices, trusted devices, revocation | GET /auth/devices, DELETE /auth/devices/:id |
| IP Restrictions | Whitelist/blacklist CIDRs per organization | POST /admin/ip-policy, GET /admin/ip-policy |
| Audit Login History | Full login/logout audit with IP, device, geo | GET /auth/audit-logs |
| Password Policy | Min length, complexity, expiry, breach detection (HaveIBeenPwned) | PUT /auth/password-policy |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| User Management | CRUD, invite by email, bulk import CSV, photo upload, deactivation | GET /users, POST /users, PUT /users/:id |
| RBAC | Role creation, permission matrix, role assignment to users/groups | GET /roles, POST /roles, PUT /roles/:id/permissions |
| Dynamic Permissions | Override role permission per user, time-bound access | POST /users/:id/permissions/override |
| Department Structure | Org chart tree, department CRUD, employee assignment | GET /departments, POST /departments |
| Position Hierarchy | Position levels, reporting line, approval authority tiers | GET /positions, POST /positions |
| Role Templates | Pre-built templates: Admin, Finance, Maintenance, Security, Tenant | GET /role-templates, POST /roles/from-template |
| Access Policies | IP-based, time-based, property-scoped access rules | POST /access-policies |
| Approval Permissions | Define who can approve what (linked to Workflow Engine) | GET /approval-permissions |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Multi-Company | Company CRUD, parent-child company hierarchy, tax IDs, logos | GET /companies, POST /companies |
| Multi-Branch | Branch offices, address, contact, branch manager | GET /branches, POST /companies/:id/branches |
| Multi-Property | Property entities linked to company, property-level settings | GET /properties, POST /properties |
| Business Units | P&L-level units within a company | GET /business-units, POST /business-units |
| Region Management | Geographic groupings (City, Zone, Region) for reporting | GET /regions, POST /regions |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| BPMN Workflow Designer | Drag-and-drop flow builder (React Flow), step types: approval, notification, condition, delay | GET /workflows, POST /workflows, PUT /workflows/:id |
| Approval Routing | Sequential/parallel approvers, delegate on absence, skip rules | POST /workflows/:id/instances, PUT /workflow-instances/:id/approve |
| Conditional Approval | Dynamic condition builder (e.g., Amount > 50,000 → CFO required) | POST /workflows/:id/conditions |
| SLA Management | SLA per step (hours/days), SLA breach alerts | GET /workflows/:id/sla, PUT /workflows/:id/sla |
| Escalation | Auto-escalate on SLA breach, escalation chains | POST /workflows/:id/escalation-rules |
| Form Designer | Custom form fields per workflow step, field validation rules | GET /forms, POST /forms, PUT /forms/:id |
| State Machine | Entity lifecycle states (Draft→Submitted→Approved→Active→Closed) | GET /state-machines, POST /state-machines |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Email Notifications | SendGrid/SES, HTML templates, attachment support, open tracking | POST /notifications/email |
| SMS Notifications | Twilio, template library, character counting, delivery status | POST /notifications/sms |
| Push Notifications | Firebase FCM for Android/iOS mobile apps | POST /notifications/push |
| In-App Notifications | Real-time via WebSocket (Socket.IO), notification bell, read/unread | GET /notifications, PUT /notifications/:id/read |
| WhatsApp/Telegram/Viber | Business API integration, media messages, quick reply buttons | POST /notifications/whatsapp, POST /notifications/telegram |
| Reminder Engine | Cron-based scheduled reminders (rent due, contract expiry, inspection) | POST /reminders, GET /reminders |
| Scheduled Notifications | Future-dated bulk notifications, recurring schedules | POST /notifications/schedule |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| File Upload | Multi-file upload, drag-drop, S3/MinIO backend, 500MB limit, virus scan | POST /documents/upload, GET /documents/:id |
| OCR & Full-Text Search | Tesseract OCR pipeline, Elasticsearch indexing, search API | POST /documents/:id/ocr, GET /documents/search |
| Versioning | Auto-versioning on re-upload, version history, rollback | GET /documents/:id/versions |
| Tagging & Metadata | Custom tags, categories, linked entity (lease, tenant, vendor) | PUT /documents/:id/tags |
| Folder Structure | Nested folders per property/entity, access control per folder | GET /folders, POST /folders |
| PDF Preview | In-browser PDF rendering (PDF.js), no download required | GET /documents/:id/preview |
| Document Approval | Approval workflow integration, electronic approval stamp | POST /documents/:id/submit-for-approval |
| Expiration Tracking | Expiry date field, auto-alerts 30/60/90 days before expiry | GET /documents/expiring |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| KPI Dashboard | Drag-drop layout (per user), real-time database queries via realProvider, drill-down capabilities from widgets | GET /dashboard/widgets, GET /dashboard/widget-data/:code/drilldown, POST /dashboard/layout |
| BI Widget Framework | Recharts-based chart widgets: bar, line, pie, gauge, heatmap | GET /widgets/:type/data |
| Export to Excel/PDF | Server-side Excel (ExcelJS) and PDF (Puppeteer) export for all reports | POST /reports/:id/export |

| Phase 2: Property Structure & Leasing Property Mgmt • Units • Lease & Contracts • Tenant Mgmt • CRM • Parking | Timeline Months 4 – 6 |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Property Profile | Property name, type (Commercial/Residential/Mixed), address, registration, geo-location | GET /properties/:id, PUT /properties/:id |
| Building Structure | Multi-tower, floors per tower, unit count per floor, common areas | GET /properties/:id/structure |
| Facilities & Amenities | Facility catalog (Pool, Gym, Parking, etc.), property-level assignments | GET /properties/:id/amenities |
| Map Integration | Google Maps embed, geo-fencing for mobile staff, property pin | GET /properties/:id/map |
| Property Status | Active, Under Construction, Decommissioned — status change workflow | PUT /properties/:id/status |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Tower/Block Structure | Tower CRUD, section grouping, floor plan attachment | GET /towers, POST /properties/:id/towers |
| Unit Profile | Unit number, type (Studio/1BR/Office/Retail), area (sqft/sqm), floor plan | GET /units/:id, POST /towers/:id/units |
| Unit Availability | Available/Occupied/Reserved/Maintenance — with history log | GET /units?status=available |
| Ownership Tracking | Owner name, ownership type (Freehold/Leasehold), purchase date | PUT /units/:id/ownership |
| Utility Meter Assignment | Link water/electricity meters to units, meter serial numbers | POST /units/:id/meters |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Tenant Profile | Individual/company tenant, contact info, identification docs, photo | GET /tenants/:id, POST /tenants |
| KYC | Document checklist (ID, trade license, bank statement), verification status, expiry alerts | POST /tenants/:id/kyc, GET /tenants/:id/kyc/status |
| Emergency Contacts | Multiple emergency contacts per tenant, relationship, priority order | POST /tenants/:id/emergency-contacts |
| Blacklist Management | Blacklist reason, date, global/property-scoped, re-inquiry block | POST /tenants/:id/blacklist, GET /tenants/blacklisted |
| Document Attachments | Tenant document vault, linked to Document Management module | POST /tenants/:id/documents |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Lease Contract | Full lease data model: unit, tenant, dates, rent, escalation, clauses | GET /leases/:id, POST /leases |
| Lease Templates | Configurable templates per property type (Residential, Commercial, Retail) | GET /lease-templates, POST /leases/from-template |
| Renewal Workflow | Auto-alert 90/60/30 days before expiry, renewal offer, counter-offer, acceptance | POST /leases/:id/renewal |
| Amendment | Rent revision, unit change, term extension — amendment log with document | POST /leases/:id/amendment |
| Termination | Early termination request, penalty calculation, deposit refund trigger | POST /leases/:id/terminate |
| Rent Escalation | Fixed %, CPI-linked, or fixed-amount annual escalation rules on lease | PUT /leases/:id/escalation |
| E-Signature | DocuSign / HelloSign integration, signature request, status tracking | POST /leases/:id/esign/send, GET /leases/:id/esign/status |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Lead Management | Inquiry capture (web form, phone, walk-in), lead source, status pipeline | GET /leads, POST /leads |
| Viewing Appointments | Schedule unit viewing, Google Calendar sync, follow-up reminders | POST /leads/:id/viewings |
| Leasing Agent Assignment | Round-robin or manual assignment, conversion tracking per agent | PUT /leads/:id/assign |
| Lead Pipeline | Kanban view: New → Contacted → Viewing → Offer → Signed → Lost | GET /leads/pipeline |
| Marketing Campaigns | Vacancy listings syndication, campaign ROI, cost-per-lead | GET /campaigns, POST /campaigns |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Parking Slot Management | Slot catalog: covered/uncovered, level, type (Car/Bike/EV), status | GET /parking/slots, POST /parking/slots |
| Parking Allocation | Allocate slots to tenants/residents, allocation period, linked to lease | POST /parking/allocations |
| Visitor Parking | Temporary allocation, visitor registration, duration limit, QR pass | POST /parking/visitor |
| Parking Billing | Monthly billing, hourly/daily rate, overstay penalties, invoice generation | GET /parking/invoices |
| Vehicle Registration | Vehicle make, model, plate, tenant linkage, vehicle stickers | POST /tenants/:id/vehicles |
| RFID Integration | RFID tag assignment to vehicles, gate access control API | POST /parking/rfid/register |

| Phase 3: Billing & Financial Management Billing Engine • AR • AP • General Ledger • Budgeting • Fixed Assets • Banking | Timeline Months 7 – 9 |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Rent Billing | Auto-generation from lease terms on billing date, prorated billing for partial periods | POST /billing/rent/generate, GET /billing/rent |
| Utility Billing | Consumption-based billing from meter readings, tariff configuration | POST /billing/utilities/generate |
| Service Charges | Recurring monthly service/maintenance charges per unit type | GET /billing/service-charges |
| Recurring Billing | Bull queue–based scheduled invoice jobs, retry on failure, audit log | GET /billing/schedules, POST /billing/schedules |
| Penalty Calculation | Late payment penalty: fixed amount or % per day, grace period, compound/simple | POST /billing/penalties/calculate |
| Credit Notes & Adjustments | Manual adjustments, credit note issuance, write-off approval workflow | POST /invoices/:id/credit-note |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Invoice Generation | PDF invoices (Puppeteer), branded template, auto-email to tenant | GET /invoices/:id, POST /invoices/:id/send |
| Collection Tracking | Collection dashboard: paid, overdue, partially paid, disputed | GET /ar/collection-summary |
| Aging Report | AR aging buckets: Current, 1–30, 31–60, 61–90, 90+ days | GET /reports/ar-aging |
| Receipt Management | Payment receipt, multi-payment method (bank transfer, cash, online), reconciliation | POST /receipts, GET /receipts/:id |
| Refunds | Refund request, approval workflow, bank transfer trigger, refund receipt | POST /invoices/:id/refund |
| Statements | Tenant account statement (period-based), emailed on request | GET /tenants/:id/statement |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Vendor Invoices | Manual or auto-matched (from PO), 3-way match: PO × GRN × Invoice | POST /ap/invoices, GET /ap/invoices/:id |
| Payment Vouchers | Voucher creation, approval workflow, bank payment scheduling | POST /ap/payment-vouchers |
| Approval Workflow | Multi-tier approval by amount threshold, integration with Workflow Engine | POST /ap/invoices/:id/submit |
| Expense Tracking | Department expense allocation, cost center coding, budget vs actual | GET /expenses, POST /expenses |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Chart of Accounts | COA hierarchy (Assets, Liabilities, Equity, Income, Expense), property-scoped | GET /gl/accounts, POST /gl/accounts |
| Journal Entries | Manual JE, auto-posting from AR/AP, double-entry validation, reversal | POST /gl/journal-entries, PUT /gl/journal-entries/:id/post |
| Trial Balance | Real-time trial balance by fiscal period, drill-down to JE | GET /reports/trial-balance |
| Financial Statements | P&L, Balance Sheet, Cash Flow Statement (direct & indirect method) | GET /reports/pnl, GET /reports/balance-sheet |
| Fiscal Periods | Month/quarter/year close, re-open with authorization, period locking | POST /gl/fiscal-periods/:id/close |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Property Budgets | Annual budget entry per property/department, monthly breakdown | GET /budgets/:year, POST /budgets |
| Budget Variance | Actuals vs budget by period, variance % alert thresholds | GET /reports/budget-variance |
| Asset Registry | Asset catalog, acquisition date, cost, location, responsible person | GET /assets, POST /assets |
| Depreciation | SL / Declining Balance methods, auto monthly depreciation posting to GL | POST /assets/:id/depreciation/run |
| Asset Transfer | Inter-property transfer, transfer document, asset history | POST /assets/:id/transfer |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Bank Accounts | Multiple bank accounts per property, opening balance, currency | GET /bank-accounts, POST /bank-accounts |
| Bank Reconciliation | Import bank statement (CSV/OFX/MT940), auto-match vs receipts/vouchers | POST /bank-accounts/:id/reconcile |
| Online Payment Gateway | Stripe / PayTabs integration, tenant self-pay portal, webhook reconciliation | POST /payments/gateway/initiate, POST /payments/gateway/webhook |
| Cash Flow Report | Operating/investing/financing cash flows by period | GET /reports/cash-flow |

| Phase 4: Maintenance & Facility Operations Maintenance • Preventive Maint. • Facility Mgmt • Inventory • Housekeeping • Security | Timeline Months 10 – 12 |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Ticketing System | Tenant/staff-created tickets, category, priority (P1–P4), photo upload | POST /maintenance/tickets, GET /maintenance/tickets/:id |
| Work Orders | Auto-generated from tickets, labor/material estimation, technician assignment | POST /maintenance/work-orders, PUT /work-orders/:id/assign |
| SLA Tracking | Response & resolution SLA per category/priority, SLA breach alerts | GET /maintenance/sla-report |
| Technician Scheduling | Calendar view, skill-based assignment, workload balancing | GET /technicians/:id/schedule |
| Priority Handling | Priority escalation rules, emergency work order fast-track flow | PUT /maintenance/tickets/:id/escalate |
| Completion & Feedback | Technician sign-off with photo, tenant satisfaction rating (1–5 stars) | PUT /work-orders/:id/complete |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Maintenance Schedules | Asset-linked schedules: monthly AC servicing, annual fire system inspection | GET /pm/schedules, POST /pm/schedules |
| Checklist Management | Inspection checklists per asset type, pass/fail/NA per item | GET /pm/checklists, POST /pm/checklists |
| Recurring Job Generation | Auto-create work orders from PM schedules via Bull scheduler | POST /pm/schedules/:id/generate |
| Asset Servicing History | Full service history per asset, next service due date calculation | GET /assets/:id/service-history |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Facility Inventory | Equipment catalog, serial numbers, warranty dates, location assignment | GET /facility/equipment, POST /facility/equipment |
| Common Area Maintenance | CAM task scheduling, cost tracking, report for CAM billing (Phase 6) | GET /facility/common-areas, POST /cam/tasks |
| Spare Parts Inventory | Parts catalog, bin locations, current stock, unit of measure | GET /inventory/parts, POST /inventory/parts |
| Stock Movement | Goods receipt, issue to work order, transfer, write-off, movement log | POST /inventory/movements |
| Reorder Levels | Min/max stock levels, auto-generate purchase requisition on reorder breach | PUT /inventory/parts/:id/reorder-levels |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Cleaning Schedules | Zone-based schedules, staff assignment, frequency (daily/weekly/monthly) | GET /housekeeping/schedules, POST /housekeeping/schedules |
| Inspection | Supervisor inspection forms, photo evidence, issue tagging | POST /housekeeping/inspections |
| Incident Reporting | Security incident type, severity, involved parties, photos, police report ref | POST /security/incidents |
| Patrol Logs | Checkpoint scanning (QR/NFC), guard tour schedule, missed checkpoint alerts | POST /security/patrol-logs, GET /security/patrol-logs |
| Access Control Integration | API hooks for HID/Suprema/Dahua ACU, entry/exit log sync | POST /security/access-events (webhook) |
| CCTV Integration | Camera inventory, NVR/DVR API integration, incident-linked clip request | GET /security/cameras, POST /security/incidents/:id/clip-request |

| Phase 5: Tenant Experience & Mobile Applications Tenant Portal • Resident Portal • Visitor Mgmt • Facility Booking • Community • 4 Mobile Apps | Timeline Months 13 – 15 |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Tenant Portal | Profile management, outstanding invoices, payment history, lease documents, maintenance requests | GET /portal/tenant/dashboard |
| Online Payment | Pay rent/utilities via Stripe integration, auto-receipt download | POST /portal/payments |
| Resident Management | Family member / occupant registration, resident directory, resident card issuance | GET /portal/residents, POST /portal/residents |
| Resident Directory | Opt-in directory by unit number, contact sharing controls | GET /portal/directory |
| Move-In / Move-Out | Move-in date scheduling, deposit confirmation, elevator booking, inspection checklist sign-off | POST /portal/move-requests |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Visitor Pre-Registration | Tenant pre-registers guest with name, photo, expected date/time, host unit | POST /visitors/pre-register |
| QR Pass Generation | One-time QR code emailed/WhatsApp'd to visitor, valid for time window | GET /visitors/:id/qr-pass |
| Check-In / Check-Out | Security scans QR at gate, photo capture, auto log time | POST /visitors/:id/checkin, POST /visitors/:id/checkout |
| Security Approval | Walk-in visitors require security to call tenant for verbal approval | POST /visitors/walkin/request-approval |
| Visitor Logs | Full visitor history per unit, export to Excel, overstay alerts | GET /visitors/logs |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Facility Booking | Book amenities (gym, pool, BBQ, meeting room) with availability calendar, capacity limits | GET /bookings/availability, POST /bookings |
| Booking Rules | Max hours per day/week, advance booking window, cancellation policy | GET /booking-rules, PUT /booking-rules/:facilityId |
| Announcements | Management-to-resident broadcast, pinned notices, read receipts | POST /community/announcements |
| Polls & Surveys | Community polls with result analytics, survey distribution via notification | POST /community/polls |
| Complaints & Feedback | Resident complaints with status tracking, management response, satisfaction score | POST /community/complaints, PUT /community/complaints/:id/respond |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Resident App | Bill payments, maintenance requests, facility booking, visitor pass issuance, community feed | Consumes /portal/*, /bookings/*, /visitors/* APIs |
| Technician App | Assigned work orders, update status, photo upload, checklist completion, GPS location sharing | Consumes /work-orders/*, /pm/* APIs |
| Security App | QR visitor scan, walk-in approval, incident reporting, patrol checkpoint scan with NFC | Consumes /visitors/*, /security/* APIs |
| Manager App | KPI dashboard, pending approvals, maintenance status map, push notification alerts, reports | Consumes /dashboard/*, /approvals/*, /reports/* APIs |

| Phase 6: Vertical Specializations, BI & Integrations Shopping Mall • Condo-Specific • Advanced BI & AI • ERP Integrations • Smart Building | Timeline Months 16 – 18+ |
|---|---|

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Commercial Lease (Mall) | Percentage rent clauses, Gross Turnover (GTO) based rent, fit-out period management, anchor tenant controls | GET /commercial-leases/:id, POST /commercial-leases |
| Shop Management | Shop profiles, brand/category assignment, tenant mix analysis, layout map | GET /shops, POST /shops |
| Retail Sales Reporting | Daily sales submission portal for tenants, POS API integration (Square, Lightspeed), variance alerts | POST /shops/:id/sales-reports, GET /shops/:id/sales-summary |
| CAM Management | Common area cost pool definition, cost allocation rules (GLA basis), monthly CAM billing, year-end reconciliation | GET /cam/cost-pools, POST /cam/billing/generate |
| Promotion/Event Management | Mall event calendar, campaign setup, booth/kiosk rental, marketing collateral uploads | GET /events, POST /events, POST /events/:id/booths |
| Footfall Analytics | People counter sensor integration (AXIS, Xovis), hourly/daily visitor counts, heatmap visualization, peak hour analysis | GET /footfall/daily, GET /footfall/heatmap |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Utility Meter Management | Smart meter integration (Modbus TCP/MQTT), automated readings, consumption billing auto-trigger | GET /meters/:id/readings, POST /meters/:id/readings/sync |
| Sinking Fund / Management Fund | Fund ledger, contribution collection, expenditure approval, fund balance reporting | GET /funds/sinking-fund/balance |
| AGM / EGM Management | Meeting notice distribution, proxy form management, resolution voting, minutes publishing | POST /meetings/agm, GET /meetings/agm/:id/results |
| By-Laws Management | By-law document repository, violation ticketing, fine issuance, appeal workflow | GET /bylaws, POST /violations |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| Executive BI Dashboard | Multi-property KPI consolidation, drill-down from portfolio → property → unit, custom date ranges | GET /bi/executive-summary |
| Occupancy & Revenue Forecasting | Time-series ML model (Prophet / LSTM), occupancy rate forecast 6/12 months ahead | GET /bi/forecasts/occupancy, GET /bi/forecasts/revenue |
| AI Lease Recommendations | GPT-4 API integration for lease clause analysis, rent benchmarking vs market data | POST /ai/lease-review |
| Anomaly Detection | Unusual billing patterns, maintenance spike alerts, late payment prediction scoring | GET /ai/anomalies |
| Natural Language Reports | Ask-in-English query interface ("What is Q2 revenue for Tower A?"), powered by LLM + SQL agent | POST /ai/query |

| Module | Key Features | API Endpoints (Sample) |
|---|---|---|
| ERP Integration | SAP / Oracle NetSuite / Microsoft Dynamics connector — sync GL entries, vendor invoices, assets | POST /integrations/erp/sync |
| Accounting Software | QuickBooks / Xero sync via OAuth2, real-time journal push | GET /integrations/accounting/status, POST /integrations/accounting/sync |
| Smart Building / BMS | BACnet/IP & Modbus gateway for BMS — HVAC, elevators, energy meters, fault alerts | GET /bms/devices, GET /bms/devices/:id/readings |
| eSign Providers | DocuSign & Adobe Sign — contract send, envelope status webhook, completed PDF storage | POST /integrations/esign/send, POST /integrations/esign/webhook |
| Open API & Webhooks | Public REST API with developer portal, API key management, outbound webhooks for all entity events | GET /developer/api-keys, POST /developer/webhooks |

| Entity | Key Fields | Relationships |
|---|---|---|
| Company | id, name, parent_company_id, tax_id, type | Has many: Properties, Users, BankAccounts |
| Property | id, company_id, name, type, address, geo_lat, geo_lng | Has many: Towers, Units, Leases |
| Unit | id, property_id, tower_id, floor, unit_number, type, area_sqft, status | Belongs to: Property, Tower; Has many: Leases, Meters |
| Tenant | id, company_id, type (individual/company), name, kyc_status, blacklisted | Has many: Leases, Documents, Vehicles |
| Lease | id, unit_id, tenant_id, start_date, end_date, rent_amount, status, escalation_rule | Belongs to: Unit, Tenant; Has many: Invoices, Amendments |
| Invoice | id, tenant_id, lease_id, invoice_date, due_date, total_amount, status | Has many: InvoiceLines, Receipts |
| MaintenanceTicket | id, unit_id, category, priority, status, assigned_to, sla_due_at | Has many: WorkOrders, Attachments |
| WorkOrder | id, ticket_id, technician_id, scheduled_at, status, materials_used | Belongs to: Ticket, Technician |
| Asset | id, property_id, name, category, serial_no, purchase_date, current_value | Has many: ServiceHistory, PMSchedules |
| User | id, company_id, email, role_id, department_id, is_active, mfa_enabled | Belongs to: Company, Role, Department |
| Visitor | id, host_unit_id, name, qr_token, valid_from, valid_to, status | Belongs to: Unit; Has many: VisitorLogs |
| Booking | id, facility_id, resident_id, start_time, end_time, status, payment_status | Belongs to: Facility, Resident |

| Test Type | Tool | Coverage Target | When |
|---|---|---|---|
| Unit Tests | Jest | > 80% code coverage | Every PR / CI |
| Integration Tests | Supertest + Test DB | All API endpoints | Every PR / CI |
| E2E Tests | Cypress / Playwright | Critical user flows | Pre-deployment |
| Performance Tests | k6 / Artillery | Load: 1,000 VUs | Pre-release |
| Security Scan | Snyk, OWASP ZAP | Zero High findings | Weekly + Pre-release |
| Mobile Tests | Detox (E2E) | Core app flows | Pre-store submission |
| UAT | Manual + stakeholder | 100% acceptance criteria | End of each Phase |

| Role | Headcount | Responsibilities |
|---|---|---|
| Product Manager | 1 | Roadmap, stakeholder management, sprint planning, UAT coordination |
| Technical Lead / Architect | 1 | System design, code review, API contracts, DevOps oversight |
| Backend Developers (Node.js) | 3–4 | Express services, Prisma schema, API development, cron jobs |
| Frontend Developers (React) | 2–3 | Web portal, component library, dashboard, Tailwind UI |
| Mobile Developers (React Native) | 2 | 4 mobile apps, push notifications, offline sync |
| QA Engineers | 2 | Test plan authorship, Jest/Cypress automation, UAT facilitation |
| DevOps / Cloud Engineer | 1 | Kubernetes, CI/CD pipelines, monitoring, security patching |
| UI/UX Designer | 1 | Design system, Figma prototypes, usability testing, accessibility |
| Business Analyst | 1 | Requirements elicitation, workflow documentation, data migration planning |

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Scope creep from stakeholder change requests | High | High | Lock scope per phase. Use change request form with cost/time impact assessment. |
| Data migration complexity from legacy systems | Medium | High | Dedicate BA + developer for data mapping. Build ETL scripts with validation reports. |
| Third-party API changes (payment gateway, e-sign) | Medium | Medium | Abstraction layer (adapter pattern) for all third-party integrations. Monitor changelogs. |
| Performance degradation at scale | Low | High | Load testing from Phase 3 onwards. Introduce caching and query optimization proactively. |
| Key developer attrition | Medium | High | Knowledge base (Confluence), pair programming, avoid single points of knowledge. |
| Mobile app store review delays | Low | Medium | Submit to stores 2 weeks before target release. Maintain TestFlight/internal track. |

| Phase | Milestone | Target Month | Exit Criteria |
|---|---|---|---|
| Phase 1 | Core Platform Live | Month 3 | Auth, Users, Org, Workflow, Notifications, Documents deployed to staging. UAT signed off. |
| Phase 2 | Leasing Operations Live | Month 6 | Full lease lifecycle functional. CRM lead-to-contract flow tested. E-signature integrated. |
| Phase 3 | Finance Module Live | Month 9 | Rent billing auto-generated. AR aging report accurate. GL trial balance balanced. Payments gateway tested. |
| Phase 4 | Maintenance Ops Live | Month 12 | Maintenance ticket-to-completion flow live. PM schedules running. Inventory tracked. |
| Phase 5 | Tenant Apps Live | Month 15 | Resident & Tenant portals launched. All 4 mobile apps published to app stores. |
| Phase 6 | Full Platform Launch | Month 18+ | Mall + Condo modules live. BI dashboards operational. ERP integration tested and signed off. |
