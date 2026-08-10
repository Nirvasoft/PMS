# NirvaHub Property Management System (PMS)
# Comprehensive User Manual & Test Cases

**Version:** 1.0  
**Last Updated:** August 2026  
**Platform:** Web (React) + Mobile (Flutter)  
**System URL:** `https://your-domain.com/login`

---

## Table of Contents

| Document | Phase | Description |
|----------|-------|-------------|
| [Phase 1 — Core Platform](./phase1_core_platform.md) | Authentication, Users, Roles, Org, Workflows, Notifications, Documents, Dashboard | 20 test cases |
| [Phase 2 — Property & Leasing](./phase2_property_leasing.md) | Properties, Towers/Units, Tenants, Leases, CRM, Parking | 20 test cases |
| [Phase 3 — Billing & Finance](./phase3_billing_finance.md) | Billing Engine, AR, AP, GL, Budgeting, Fixed Assets, Banking | 20 test cases |
| [Phase 4 — Maintenance & Ops](./phase4_maintenance_ops.md) | Maintenance, Preventive Maintenance, Facility, Inventory, Housekeeping, Security | 20 test cases |
| [Phase 5 — Tenant Experience](./phase5_tenant_experience.md) | Tenant Portal, Visitor Management, Facility Booking, Community, Mobile Apps | 20 test cases |
| [Phase 6 — Verticals & Integrations](./phase6_verticals_integrations.md) | Mall, Condo, BI/AI, Enterprise Integrations, Webhooks, BMS | 20 test cases |

---

## System Overview

NirvaHub PMS is an enterprise-grade Property Management System designed for managing commercial real estate, residential condominiums, and mixed-use properties. It covers the full lifecycle from tenant acquisition through financial close.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React 18 SPA (Admin Dashboard)                          │
│  React 18 SPA (Tenant Portal)                            │
│  Flutter Apps (Resident · Technician · Security · Manager)│
├──────────────────────────────────────────────────────────┤
│  Express + Prisma API (Node.js 20)                       │
│  FastAPI AI Service (Python 3.11) — BI/AI module         │
├──────────────────────────────────────────────────────────┤
│  PostgreSQL 15+ (with PostGIS)  │  Redis 7+ (cache/pub)  │
└──────────────────────────────────────────────────────────┘
```

### User Roles Overview

| Role | Description | Access Level |
|------|-------------|-------------|
| **System Admin** | Multi-company super admin | Full system access |
| **Admin** | Company administrator | Full company access |
| **Property Manager** | Manages assigned properties | Property-scoped |
| **Finance Manager** | Billing, AR/AP, GL | Financial modules |
| **Maintenance Manager** | Work orders, PM, inventory | Maintenance modules |
| **Leasing Agent** | CRM, leases, tenant onboarding | Leasing modules |
| **Security Officer** | Incidents, patrols, access cards | Security modules |
| **Tenant / Resident** | Self-service portal & mobile | Own unit data only |
| **Custom Roles** | Configurable via role builder | Granular permissions |

---

## Getting Started

### First Login

1. Navigate to the system URL
2. Enter your **Company Code** (e.g., `NIRVA`)
3. Enter your **Email** and **Password**
4. If MFA is enabled, enter the 6-digit code from your authenticator app
5. You'll land on the **Dashboard**

### Navigation

The left sidebar contains all module links organized by category:
- **Dashboard** — KPIs, charts, quick actions
- **Properties** — Property, tower, unit management
- **Tenants** — Tenant directory, KYC, contacts
- **Leases** — Lease lifecycle, templates, clauses
- **Finance** — Billing, AR, AP, GL, Banking
- **Maintenance** — Tickets, work orders, PM schedules
- **Operations** — Housekeeping, security, facility booking
- **Mall** — Shops, GTO, CAM, events (if enabled)
- **Condo** — Meetings, bylaws, smart meters (if enabled)
- **Reports** — BI dashboards, saved reports, exports
- **Settings** — Users, roles, company, integrations

---

## Conventions Used in This Manual

| Symbol | Meaning |
|--------|---------|
| 🔐 | Requires specific permission |
| ⚡ | Real-time update via WebSocket |
| 📧 | Triggers email/notification |
| 🔄 | Triggers workflow/approval |
| ⚠️ | Important warning |
| 💡 | Helpful tip |

---

## Support

For technical support, contact your system administrator or reach out to Nirvasoft support.
