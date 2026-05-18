# Module 1.2 — User & Role Management

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Status:** ✅ Implemented  
**Depends On:** Module 1.1 (Authentication)

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)

---

## Overview

Manages all platform users, their profiles, organizational roles, granular permissions, and the department/position hierarchy used for approval routing. Permissions are resolved at runtime by combining role-level permissions with any per-user overrides.

**Key capabilities:**
- User CRUD with invite-by-email onboarding flow
- Bulk user import via CSV
- Role-Based Access Control (RBAC) with a flat permission string model
- Per-user permission overrides (grant or revoke specific permissions, optionally time-bounded)
- Department tree (unlimited depth) and position hierarchy
- Role templates for quick setup (Admin, Finance, Maintenance, Security, Tenant)
- Permission cache per user in Redis (invalidated on role/permission change)

---

## DB Schema

### SQL DDL

```sql
-- User profiles (extends users table from Auth module)
CREATE TABLE user_profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(30),
  mobile          VARCHAR(30),
  avatar_url      VARCHAR(500),
  job_title       VARCHAR(150),
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  position_id     UUID REFERENCES positions(id) ON DELETE SET NULL,
  employee_id     VARCHAR(50),
  date_of_joining DATE,
  notes           TEXT,
  timezone        VARCHAR(60) DEFAULT 'UTC',
  locale          VARCHAR(10) DEFAULT 'en',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departments (self-referencing tree)
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(50),
  manager_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dept_code_company UNIQUE (code, company_id)
);

CREATE INDEX idx_departments_company ON departments(company_id);
CREATE INDEX idx_departments_parent ON departments(parent_id);

-- Positions
CREATE TABLE positions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name         VARCHAR(150) NOT NULL,
  level        SMALLINT NOT NULL DEFAULT 1,  -- 1=lowest, higher=more authority
  can_approve  BOOLEAN NOT NULL DEFAULT FALSE,
  approval_limit NUMERIC(15,2),              -- max amount this position can approve
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,  -- system roles cannot be deleted
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_role_name_company UNIQUE (name, company_id)
);

-- Permissions (system-defined catalog — seeded, not user-created)
CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'leases.create', 'billing.approve'
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  module      VARCHAR(50) NOT NULL,          -- e.g. 'leases', 'billing', 'maintenance'
  action      VARCHAR(50) NOT NULL,          -- 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_permissions_module ON permissions(module);

-- Role ↔ Permission junction
CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- User ↔ Role junction
CREATE TABLE user_roles (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id      UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,  -- NULL = all properties
  granted_by   UUID REFERENCES users(id),
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,   -- optional time-bounded role assignment
  PRIMARY KEY (user_id, role_id, COALESCE(property_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);

-- Per-user permission overrides
CREATE TABLE user_permission_overrides (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  override_type  VARCHAR(6) NOT NULL CHECK (override_type IN ('grant', 'revoke')),
  reason         TEXT,
  granted_by     UUID NOT NULL REFERENCES users(id),
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  CONSTRAINT uq_user_perm_override UNIQUE (user_id, permission_id)
);

-- Role templates (seeded)
CREATE TABLE role_templates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL UNIQUE,
  description  TEXT,
  permissions  TEXT[] NOT NULL  -- array of permission codes
);

-- User invitations
CREATE TABLE user_invitations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email        VARCHAR(255) NOT NULL,
  role_id      UUID REFERENCES roles(id),
  department_id UUID REFERENCES departments(id),
  invited_by   UUID NOT NULL REFERENCES users(id),
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_active_invite UNIQUE (company_id, email)
);
```

### TypeORM Entities

```typescript
// src/modules/users/entities/role.entity.ts
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @Column({ length: 100 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'is_system', default: false }) isSystem: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'created_by', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;

  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Permission[];
}

// src/modules/users/entities/permission.entity.ts
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 100, unique: true }) code: string;
  @Column({ length: 150 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ length: 50 }) module: string;
  @Column({ length: 50 }) action: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
}

// src/modules/users/entities/department.entity.ts
@Entity('departments')
@Tree('closure-table')
export class Department {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @Column({ length: 150 }) name: string;
  @Column({ nullable: true, length: 50 }) code: string | null;
  @Column({ name: 'manager_id', nullable: true }) managerId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'sort_order', default: 0 }) sortOrder: number;

  @TreeParent()
  parent: Department | null;

  @TreeChildren()
  children: Department[];
}
```

---

## Server-Side Architecture

### Directory Structure

```
src/modules/users/
├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── roles.controller.ts
├── roles.service.ts
├── permissions.service.ts
├── departments.controller.ts
├── departments.service.ts
├── positions.controller.ts
├── positions.service.ts
├── invitations.service.ts
├── dto/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   ├── invite-user.dto.ts
│   ├── bulk-import-user.dto.ts
│   ├── create-role.dto.ts
│   ├── update-role.dto.ts
│   ├── assign-role.dto.ts
│   ├── create-permission-override.dto.ts
│   ├── create-department.dto.ts
│   └── create-position.dto.ts
├── entities/
│   ├── user-profile.entity.ts
│   ├── role.entity.ts
│   ├── permission.entity.ts
│   ├── role-permission.entity.ts
│   ├── user-role.entity.ts
│   ├── user-permission-override.entity.ts
│   ├── department.entity.ts
│   ├── position.entity.ts
│   └── user-invitation.entity.ts
└── helpers/
    ├── permission-resolver.ts    # resolves effective permissions for a user
    └── csv-importer.ts           # parses and validates bulk import CSV
```

### Permission Resolver

```typescript
// src/modules/users/helpers/permission-resolver.ts

@Injectable()
export class PermissionResolver {
  constructor(
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserPermissionOverride) private overrideRepo: Repository<UserPermissionOverride>,
    @InjectRedis() private redis: Redis,
  ) {}

  /**
   * Returns the effective permission codes for a user.
   * Cache TTL: 5 minutes. Invalidated on role/permission change.
   * 
   * Resolution order:
   * 1. Collect all permissions from all active user roles (union)
   * 2. Apply user-level overrides:
   *    - 'grant' overrides: ADD permission even if not in any role
   *    - 'revoke' overrides: REMOVE permission even if granted by role
   * 3. Filter out expired overrides
   */
  async getEffectivePermissions(userId: string, propertyId?: string): Promise<string[]> {
    const cacheKey = `pms:perms:${userId}:${propertyId ?? 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Step 1: role permissions
    const userRoles = await this.userRoleRepo.find({
      where: [
        { userId, propertyId: IsNull() },
        ...(propertyId ? [{ userId, propertyId }] : []),
      ],
      relations: ['role', 'role.permissions'],
    });

    const now = new Date();
    const permSet = new Set<string>();
    for (const ur of userRoles) {
      if (ur.expiresAt && ur.expiresAt < now) continue;
      for (const perm of ur.role.permissions) {
        if (perm.isActive) permSet.add(perm.code);
      }
    }

    // Step 2: overrides
    const overrides = await this.overrideRepo.find({ where: { userId } });
    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt < now) continue;
      if (o.overrideType === 'grant') permSet.add(o.permission.code);
      if (o.overrideType === 'revoke') permSet.delete(o.permission.code);
    }

    const result = Array.from(permSet);
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }

  async invalidateCache(userId: string): Promise<void> {
    const keys = await this.redis.keys(`pms:perms:${userId}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}
```

### Services

```typescript
// src/modules/users/users.service.ts
@Injectable()
export class UsersService {
  async create(dto: CreateUserDto, createdBy: string, companyId: string): Promise<User> { ... }

  async invite(dto: InviteUserDto, invitedBy: string, companyId: string): Promise<UserInvitation> {
    // 1. Check no active invitation / existing user for email in company
    // 2. Generate invitation token (crypto.randomBytes(32))
    // 3. Hash token (SHA-256), store in user_invitations
    // 4. Send invitation email with link: /accept-invite?token=<rawToken>
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto): Promise<User> {
    // 1. Hash token, look up invitation
    // 2. Check not expired (72h default), not already accepted
    // 3. Create User + UserProfile
    // 4. Assign role from invitation
    // 5. Mark invitation accepted_at = NOW()
    // 6. Send welcome email
  }

  async bulkImport(file: Express.Multer.File, companyId: string): Promise<BulkImportResult> {
    // 1. Parse CSV (papaparse)
    // 2. Validate each row (email, name, role exists)
    // 3. Transaction: create users + profiles + send invites
    // 4. Return { success: N, failed: [{ row, errors }] }
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<UserProfile> { ... }

  async deactivate(userId: string, reason: string): Promise<void> {
    // 1. Set isActive = false
    // 2. Revoke all refresh tokens
    // 3. Invalidate permission cache
  }

  async assignRole(userId: string, dto: AssignRoleDto): Promise<void> {
    // 1. Verify role belongs to same company
    // 2. Upsert user_roles record
    // 3. Invalidate permission cache for user
  }

  async setPermissionOverride(userId: string, dto: CreatePermissionOverrideDto): Promise<void> {
    // 1. Upsert override
    // 2. Invalidate permission cache for user
  }

  async findAll(companyId: string, query: UserQueryDto): Promise<PaginatedResponse<UserListItem>> { ... }
}
```

---

## API Contract

### Base URL: `/api/v1`

---

### `GET /users`
**Access:** `users.read`  
**Query:** `?search=&departmentId=&roleId=&isActive=&page=1&limit=20&sort=fullName&order=asc`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "john@acme.com",
      "fullName": "John Smith",
      "jobTitle": "Property Manager",
      "department": { "id": "uuid", "name": "Operations" },
      "roles": [{ "id": "uuid", "name": "Manager" }],
      "isActive": true,
      "lastLoginAt": "2025-01-14T08:00:00Z",
      "avatarUrl": "https://cdn.pms.com/avatars/uuid.jpg"
    }
  ],
  "meta": { "total": 52, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

### `POST /users`
**Access:** `users.create`

**Request Body:**
```json
{
  "email": "jane@acme.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "jobTitle": "Finance Manager",
  "departmentId": "uuid",
  "positionId": "uuid",
  "roleIds": ["uuid"],
  "sendInvite": true
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "jane@acme.com",
    "invitationSent": true
  }
}
```

**Response 409:**
```json
{
  "success": false,
  "errors": [{ "code": "EMAIL_ALREADY_EXISTS", "message": "A user with this email already exists in your organization." }]
}
```

---

### `GET /users/:id`
**Access:** `users.read` or own profile

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "jane@acme.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+1-555-0100",
    "mobile": "+1-555-0101",
    "avatarUrl": "...",
    "jobTitle": "Finance Manager",
    "employeeId": "EMP-042",
    "dateOfJoining": "2024-03-01",
    "department": { "id": "uuid", "name": "Finance", "path": "Head Office > Finance" },
    "position": { "id": "uuid", "name": "Finance Manager", "level": 3 },
    "roles": [{ "id": "uuid", "name": "Finance", "propertyId": null }],
    "effectivePermissions": ["billing.read", "billing.approve", "reports.financial"],
    "isActive": true,
    "mfaEnabled": true,
    "lastLoginAt": "2025-01-14T08:00:00Z",
    "createdAt": "2024-03-01T00:00:00Z"
  }
}
```

---

### `PUT /users/:id`
**Access:** `users.update` or own profile (limited fields)

**Request Body:** (partial — any subset of profile fields)
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1-555-0102",
  "jobTitle": "Senior Finance Manager",
  "departmentId": "uuid",
  "positionId": "uuid",
  "timezone": "America/New_York",
  "locale": "en-US"
}
```

---

### `POST /users/:id/deactivate`
**Access:** `users.deactivate`

**Request Body:** `{ "reason": "Employee resignation" }`

**Response 200:** `{ "success": true }`

---

### `POST /users/invite`
**Access:** `users.invite`

**Request Body:**
```json
{
  "email": "newstaff@acme.com",
  "roleId": "uuid",
  "departmentId": "uuid",
  "message": "Welcome to our team!"
}
```

---

### `POST /users/bulk-import`
**Access:** `users.create`  
**Content-Type:** `multipart/form-data`  
**Body:** `file` (CSV), `roleId` (default role for all imported users)

**CSV Format:**
```
email,first_name,last_name,job_title,department_code,employee_id
john@acme.com,John,Smith,Tech Lead,IT,EMP-101
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalRows": 25,
    "imported": 23,
    "failed": [
      { "row": 5, "email": "bad@@email.com", "errors": ["Invalid email format"] },
      { "row": 12, "email": "dup@acme.com", "errors": ["Email already exists"] }
    ]
  }
}
```

---

### `PUT /users/:id/avatar`
**Access:** Own profile or `users.update`  
**Content-Type:** `multipart/form-data`  
**Body:** `avatar` (image file, max 2MB, JPEG/PNG/WebP)

---

### Roles

### `GET /roles`
**Access:** `roles.read`  
**Query:** `?isActive=true&includePermissions=false`

### `POST /roles`
**Access:** `roles.create`

```json
{
  "name": "Maintenance Supervisor",
  "description": "...",
  "permissionCodes": ["maintenance.read", "maintenance.update", "maintenance.assign"]
}
```

### `GET /roles/:id`
### `PUT /roles/:id`
### `DELETE /roles/:id`  (system roles return 403)

**Access:** `roles.manage`

### `POST /roles/from-template`
**Access:** `roles.create`

```json
{ "templateId": "uuid", "name": "My Custom Finance Role" }
```

### `GET /role-templates`
**Access:** `roles.read`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Finance",
      "description": "Full billing, AR/AP, reporting access",
      "permissionCount": 24,
      "permissions": ["billing.read", "billing.create", "ar.approve", "..."]
    }
  ]
}
```

---

### `GET /permissions`
**Access:** `roles.manage`  
**Query:** `?module=billing`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "billing": [
      { "code": "billing.read", "name": "View Billing", "action": "read" },
      { "code": "billing.create", "name": "Create Invoices", "action": "create" },
      { "code": "billing.approve", "name": "Approve Invoices", "action": "approve" }
    ],
    "maintenance": [ ... ]
  }
}
```

---

### `POST /users/:id/roles`
**Access:** `users.manage-roles`

```json
{
  "roleId": "uuid",
  "propertyId": "uuid",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

### `DELETE /users/:id/roles/:roleId`
**Access:** `users.manage-roles`

---

### `POST /users/:id/permission-overrides`
**Access:** `users.manage-permissions`

```json
{
  "permissionCode": "billing.approve",
  "overrideType": "grant",
  "reason": "Temporary cover for Finance Manager leave",
  "expiresAt": "2025-02-28T23:59:59Z"
}
```

### `GET /users/:id/permission-overrides`
### `DELETE /users/:id/permission-overrides/:overrideId`

---

### Departments

### `GET /departments`
**Access:** `departments.read`  
**Query:** `?tree=true` returns nested tree; `?flat=true` returns flat list

**Tree Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Head Office",
      "code": "HQ",
      "manager": { "id": "uuid", "fullName": "Alice Johnson" },
      "children": [
        {
          "id": "uuid",
          "name": "Finance",
          "code": "FIN",
          "children": []
        }
      ]
    }
  ]
}
```

### `POST /departments`
### `PUT /departments/:id`
### `DELETE /departments/:id`  (only if no users assigned)

### `POST /departments/:id/move`
```json
{ "newParentId": "uuid" }
```

---

### Positions

### `GET /positions`
### `POST /positions`
### `PUT /positions/:id`
### `DELETE /positions/:id`

**POST Request Body:**
```json
{
  "name": "Senior Property Manager",
  "departmentId": "uuid",
  "level": 4,
  "canApprove": true,
  "approvalLimit": 50000.00
}
```

---

## Business Logic & Validation Rules

### User Creation
```
1. Email must be unique within company (case-insensitive)
2. If sendInvite=true: create invitation record → send email
3. If sendInvite=false: create user with mustChangePassword=true + temp password
4. Role assignment: verify roleIds all belong to same companyId
5. Department/Position: verify belong to same companyId
6. Avatar upload: resize to 256×256 max, convert to WebP, strip EXIF
```

### Bulk Import Validation
```
Per row:
- email: valid format, not duplicate within file, not existing in company
- first_name + last_name: required, max 100 chars each
- department_code: must exist in company if provided
- employee_id: must be unique within company if provided

Batch behavior:
- Process valid rows, collect errors for invalid rows
- Use DB transaction per batch of 50 rows
- Return partial success report
```

### Role Deletion Guard
```
Cannot delete role if:
- role.isSystem = TRUE → 403
- Any active user has this role → 409 (return affected user count)

On delete:
- Remove all role_permissions
- Remove all user_roles for this role
- Invalidate permission cache for all affected users
```

### Permission Override Expiry
```
- Cron job runs every hour: SELECT expired overrides WHERE expires_at < NOW()
- Delete expired overrides
- Invalidate permission cache for affected users
- Write audit log entry: PERMISSION_OVERRIDE_EXPIRED
```

### Department Tree Constraints
```
- Max depth: 10 levels
- Cannot set parent to own child (circular check via closure table)
- Cannot delete department with active children or assigned users
- Moving department: updates all closure table paths
```

---

## UI Screens & Component Breakdown

### Screens

| Screen | Route | Permission |
|--------|-------|-----------|
| User List | `/admin/users` | `users.read` |
| User Detail / Edit | `/admin/users/:id` | `users.read` |
| Invite User | `/admin/users/invite` | `users.invite` |
| Bulk Import | `/admin/users/import` | `users.create` |
| Role List | `/admin/roles` | `roles.read` |
| Role Editor | `/admin/roles/:id` | `roles.manage` |
| Role Templates | `/admin/roles/templates` | `roles.read` |
| Departments | `/admin/departments` | `departments.read` |
| Positions | `/admin/positions` | `positions.read` |
| My Profile | `/settings/profile` | own |

---

### Component Tree

```
admin/users/
├── UserListPage/
│   ├── UserListPage.tsx
│   ├── components/
│   │   ├── UserTable.tsx                  # sortable/filterable data table
│   │   │   ├── UserTableRow.tsx           # avatar + name + role chips + status badge
│   │   │   └── UserStatusBadge.tsx        # Active | Inactive | Pending Invite
│   │   ├── UserFilters.tsx                # search, dept filter, role filter, status toggle
│   │   ├── InviteUserButton.tsx           # opens InviteUserModal
│   │   ├── ImportUsersButton.tsx          # opens BulkImportModal
│   │   └── UserTableActions.tsx           # edit / deactivate / resend invite
│   ├── modals/
│   │   ├── InviteUserModal.tsx
│   │   └── BulkImportModal/
│   │       ├── BulkImportModal.tsx
│   │       ├── CsvTemplateDownload.tsx
│   │       ├── FileUploadZone.tsx
│   │       └── ImportResultTable.tsx      # shows success/failure rows
│   └── hooks/
│       └── useUserList.ts

├── UserDetailPage/
│   ├── UserDetailPage.tsx                 # tabs: Profile | Roles | Permissions | Activity
│   ├── tabs/
│   │   ├── ProfileTab/
│   │   │   ├── ProfileTab.tsx
│   │   │   ├── AvatarUpload.tsx           # drag-drop + crop
│   │   │   └── ProfileForm.tsx
│   │   ├── RolesTab/
│   │   │   ├── RolesTab.tsx
│   │   │   ├── AssignedRoleCard.tsx       # role name + property scope + expiry + remove
│   │   │   └── AssignRoleModal.tsx        # role picker + property selector + expiry date
│   │   ├── PermissionsTab/
│   │   │   ├── PermissionsTab.tsx
│   │   │   ├── EffectivePermissionsList.tsx # grouped by module, shows source (role/override)
│   │   │   ├── PermissionOverrideCard.tsx
│   │   │   └── AddOverrideModal.tsx        # permission picker + grant/revoke + expiry
│   │   └── ActivityTab/
│   │       └── UserActivityFeed.tsx        # audit log events for this user

admin/roles/
├── RoleListPage/
│   ├── RoleListPage.tsx
│   └── components/
│       ├── RoleCard.tsx                   # name + permission count + user count
│       └── CreateRoleButton.tsx

├── RoleEditorPage/
│   ├── RoleEditorPage.tsx
│   └── components/
│       ├── RoleNameForm.tsx
│       └── PermissionMatrix/
│           ├── PermissionMatrix.tsx        # modules as rows, actions as columns, checkboxes
│           ├── PermissionModuleGroup.tsx   # expandable module section
│           └── SelectAllRow.tsx            # select all actions for a module

admin/departments/
├── DepartmentPage/
│   ├── DepartmentPage.tsx
│   └── components/
│       ├── DepartmentTree.tsx             # nested tree with expand/collapse
│       ├── DepartmentNode.tsx             # name + manager + user count + actions
│       ├── AddDepartmentModal.tsx
│       ├── MoveDepartmentModal.tsx        # parent picker dropdown
│       └── DepartmentBreadcrumb.tsx
```

### Key UI Behaviors

```
PermissionMatrix:
- Rows: modules (Auth, Users, Properties, Leasing, Billing, Maintenance, ...)
- Columns: actions (Read, Create, Update, Delete, Approve, Export)
- Cell: checkbox; disabled if action N/A for module
- "Select All" per row and per column
- Highlight changed cells in yellow (unsaved state indicator)
- Show permission count in header badge

EffectivePermissionsList:
- Grouped by module with expand/collapse
- Each permission chip shows source: "via Manager role" | "override (grant)" | "override (revoke)"
- Revoked permissions shown with strikethrough
- Expiring overrides shown with orange clock icon + tooltip showing expiry date

DepartmentTree:
- Drag-and-drop reordering within same parent
- Click node to expand; right-click for context menu (Add Child, Edit, Move, Delete)
- Manager avatar shown inline on each node
- Breadcrumb path on hover
```

---

## State Management

```typescript
// src/store/slices/usersSlice.ts
interface UsersState {
  selectedUserId: string | null;
  listFilters: {
    search: string;
    departmentId: string | null;
    roleId: string | null;
    isActive: boolean | null;
  };
}

export const usersSlice = createSlice({
  name: 'users',
  initialState: { selectedUserId: null, listFilters: { search: '', departmentId: null, roleId: null, isActive: true } } as UsersState,
  reducers: {
    setSelectedUser: (state, action: PayloadAction<string | null>) => { state.selectedUserId = action.payload; },
    setListFilter: (state, action: PayloadAction<Partial<UsersState['listFilters']>>) => {
      state.listFilters = { ...state.listFilters, ...action.payload };
    },
  },
});

// src/store/api/usersApi.ts
export const usersApi = createApi({
  reducerPath: 'usersApi',
  tagTypes: ['Users', 'Roles', 'Departments', 'Positions', 'Permissions'],
  endpoints: (builder) => ({
    getUsers: builder.query<PaginatedResponse<UserListItem>, UserQueryParams>({
      query: (params) => ({ url: '/users', params }),
      providesTags: (result) =>
        result ? [...result.data.map(({ id }) => ({ type: 'Users' as const, id })), 'Users'] : ['Users'],
    }),
    getUser: builder.query<UserDetail, string>({
      query: (id) => `/users/${id}`,
      providesTags: (_, __, id) => [{ type: 'Users', id }],
    }),
    createUser: builder.mutation<UserDetail, CreateUserDto>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    updateUser: builder.mutation<UserDetail, { id: string; data: UpdateUserDto }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Users', id }],
    }),
    deactivateUser: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/users/${id}/deactivate`, method: 'POST', body }),
      invalidatesTags: (_, __, { id }) => [{ type: 'Users', id }, 'Users'],
    }),
    inviteUser: builder.mutation<void, InviteUserDto>({
      query: (body) => ({ url: '/users/invite', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    bulkImportUsers: builder.mutation<BulkImportResult, FormData>({
      query: (body) => ({ url: '/users/bulk-import', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    getRoles: builder.query<Role[], void>({
      query: () => '/roles',
      providesTags: ['Roles'],
    }),
    createRole: builder.mutation<Role, CreateRoleDto>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Roles'],
    }),
    updateRole: builder.mutation<Role, { id: string; data: UpdateRoleDto }>({
      query: ({ id, data }) => ({ url: `/roles/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Roles'],
    }),
    deleteRole: builder.mutation<void, string>({
      query: (id) => ({ url: `/roles/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Roles'],
    }),
    getPermissions: builder.query<PermissionsByModule, void>({
      query: () => '/permissions',
      providesTags: ['Permissions'],
    }),
    getDepartmentTree: builder.query<DepartmentNode[], void>({
      query: () => '/departments?tree=true',
      providesTags: ['Departments'],
    }),
    createDepartment: builder.mutation<Department, CreateDepartmentDto>({
      query: (body) => ({ url: '/departments', method: 'POST', body }),
      invalidatesTags: ['Departments'],
    }),
    assignUserRole: builder.mutation<void, { userId: string; data: AssignRoleDto }>({
      query: ({ userId, data }) => ({ url: `/users/${userId}/roles`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { userId }) => [{ type: 'Users', id: userId }],
    }),
    addPermissionOverride: builder.mutation<void, { userId: string; data: CreatePermissionOverrideDto }>({
      query: ({ userId, data }) => ({ url: `/users/${userId}/permission-overrides`, method: 'POST', body: data }),
      invalidatesTags: (_, __, { userId }) => [{ type: 'Users', id: userId }],
    }),
  }),
});
```

### Permission Guard (React)

```typescript
// src/components/guards/PermissionGuard.tsx
interface PermissionGuardProps {
  permission: string | string[];  // 'billing.approve' or ['billing.approve', 'billing.read']
  requireAll?: boolean;            // default: false (any match)
  fallback?: ReactNode;
  children: ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission, requireAll = false, fallback = null, children,
}) => {
  const { permissions } = useSelector((state: RootState) => state.auth.user ?? { permissions: [] });
  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll
    ? perms.every(p => permissions.includes(p))
    : perms.some(p => permissions.includes(p));
  return hasAccess ? <>{children}</> : <>{fallback}</>;
};

// Usage:
// <PermissionGuard permission="users.create">
//   <CreateUserButton />
// </PermissionGuard>

// src/hooks/usePermission.ts
export const usePermission = (permission: string | string[], requireAll = false): boolean => {
  const permissions = useSelector((state: RootState) => state.auth.user?.permissions ?? []);
  const perms = Array.isArray(permission) ? permission : [permission];
  return requireAll ? perms.every(p => permissions.includes(p)) : perms.some(p => permissions.includes(p));
};
```
