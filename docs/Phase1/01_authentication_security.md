# Module 1.1 — Authentication & Security

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · React 18 · Redux Toolkit  
**Status:** ✅ Implemented  
**Depends On:** —

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)
8. [Security Considerations](#security-considerations)
9. [Environment Variables](#environment-variables)
10. [SSO — Single Sign-On (Future-Ready)](#sso--single-sign-on)

---

## Overview

Handles all authentication flows, session lifecycle, MFA, device tracking, IP restriction policies, and audit logging. This module is a hard dependency for every other module — no request reaches any other controller without passing through the Auth guard.

**Key flows:**
- Company code + email + password login → JWT issuance (multi-company isolation via PostgreSQL RLS)
- Company code validation (pre-login check, auto-skip when single company)
- SSO via OIDC (Azure AD, Okta, Google Workspace) — **future-ready scaffolding implemented**
- SAML 2.0 — schema ready, service placeholder
- TOTP-based MFA (Google Authenticator)
- Refresh token rotation (DB-backed)
- Per-device session management
- IP allowlist/blocklist enforcement
- Full audit log of all auth events (including SSO events)
- JIT (Just-In-Time) user provisioning for SSO users
- Admin provisioning of new companies (system admin only)

---

## DB Schema

### SQL DDL

```sql
-- ─────────────────────────────────────────────
-- AUTH SCHEMA
-- ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (core identity — extended by user_profiles in module 1.2)
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  email             VARCHAR(255) NOT NULL,
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash     VARCHAR(255),                        -- NULL for SSO-only users
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at         TIMESTAMPTZ,
  locked_reason     VARCHAR(255),
  failed_attempts   SMALLINT NOT NULL DEFAULT 0,
  last_login_at     TIMESTAMPTZ,
  mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret        VARCHAR(255),                        -- TOTP secret (encrypted)
  mfa_backup_codes  TEXT[],                              -- bcrypt-hashed backup codes
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,                         -- soft delete
  CONSTRAINT uq_users_email_company UNIQUE (email, company_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- Refresh tokens (Redis is primary; DB is audit backup)
CREATE TABLE refresh_tokens (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     VARCHAR(255) NOT NULL,                  -- SHA-256 hash of the raw token
  device_id      UUID,
  ip_address     INET,
  user_agent     TEXT,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  revoke_reason  VARCHAR(100),
  CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Registered devices
CREATE TABLE user_devices (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name    VARCHAR(255),
  device_type    VARCHAR(50),                            -- 'browser' | 'mobile' | 'desktop'
  os             VARCHAR(100),
  browser        VARCHAR(100),
  fingerprint    VARCHAR(255) NOT NULL,                  -- hashed device fingerprint
  is_trusted     BOOLEAN NOT NULL DEFAULT FALSE,
  trusted_at     TIMESTAMPTZ,
  last_seen_at   TIMESTAMPTZ,
  last_ip        INET,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ,
  CONSTRAINT uq_device_fingerprint_user UNIQUE (fingerprint, user_id)
);

-- SSO provider links
CREATE TABLE sso_identities (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         VARCHAR(50) NOT NULL,                 -- 'google' | 'azure' | 'saml'
  provider_user_id VARCHAR(255) NOT NULL,
  email            VARCHAR(255),
  access_token     TEXT,                                 -- encrypted
  refresh_token    TEXT,                                 -- encrypted
  token_expires_at TIMESTAMPTZ,
  raw_profile      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sso_provider_uid UNIQUE (provider, provider_user_id)
);

-- IP restriction policies (per company or per user)
CREATE TABLE ip_policies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = company-wide
  policy_type   VARCHAR(10) NOT NULL CHECK (policy_type IN ('allow', 'deny')),
  cidr          CIDR NOT NULL,
  description   VARCHAR(255),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ip_policies_company ON ip_policies(company_id) WHERE is_active = TRUE;

-- Password policy (per company)
CREATE TABLE password_policies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  min_length              SMALLINT NOT NULL DEFAULT 8,
  require_uppercase       BOOLEAN NOT NULL DEFAULT TRUE,
  require_lowercase       BOOLEAN NOT NULL DEFAULT TRUE,
  require_number          BOOLEAN NOT NULL DEFAULT TRUE,
  require_special         BOOLEAN NOT NULL DEFAULT TRUE,
  max_age_days            SMALLINT DEFAULT 90,           -- NULL = never expires
  history_count           SMALLINT NOT NULL DEFAULT 5,   -- prevent reuse of last N passwords
  max_failed_attempts     SMALLINT NOT NULL DEFAULT 5,
  lockout_duration_mins   SMALLINT NOT NULL DEFAULT 30,
  session_timeout_mins    SMALLINT NOT NULL DEFAULT 480, -- 8 hours
  mfa_required            BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_password_policy_company UNIQUE (company_id)
);

-- Password history (prevent reuse)
CREATE TABLE password_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_history_user ON password_history(user_id, created_at DESC);

-- Audit log for all auth events
CREATE TABLE auth_audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  email         VARCHAR(255),                            -- capture even if user deleted
  company_id    UUID REFERENCES companies(id),
  event_type    VARCHAR(50) NOT NULL,                   -- see EventType enum
  status        VARCHAR(10) NOT NULL CHECK (status IN ('success', 'failure')),
  ip_address    INET,
  user_agent    TEXT,
  device_id     UUID REFERENCES user_devices(id),
  geo_country   VARCHAR(100),
  geo_city      VARCHAR(100),
  metadata      JSONB,                                  -- additional context
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_logs(user_id, created_at DESC);
CREATE INDEX idx_auth_audit_company ON auth_audit_logs(company_id, created_at DESC);
CREATE INDEX idx_auth_audit_event ON auth_audit_logs(event_type, created_at DESC);

-- Email verification tokens
CREATE TABLE email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  ip_address  INET
);

-- SSO provider configuration (per-company)
CREATE TABLE sso_configs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,                  -- "Acme Azure AD"
  provider            VARCHAR(50) NOT NULL,                   -- oidc | saml | azure_ad | okta | google
  protocol            VARCHAR(10) NOT NULL DEFAULT 'oidc',    -- oidc | saml
  is_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  -- OIDC fields
  client_id           VARCHAR(255),
  client_secret       VARCHAR(500),                           -- encrypted at rest
  issuer_url          VARCHAR(500),                           -- e.g. https://login.microsoftonline.com/{tenant}/v2.0
  authorization_url   VARCHAR(500),
  token_url           VARCHAR(500),
  userinfo_url        VARCHAR(500),
  scopes              VARCHAR(500) DEFAULT 'openid profile email',
  -- SAML fields (future)
  entity_id           VARCHAR(500),
  sso_url             VARCHAR(500),
  certificate         TEXT,
  -- Mapping & provisioning
  auto_provision      BOOLEAN NOT NULL DEFAULT FALSE,         -- JIT user creation
  default_role_id     UUID,                                   -- Role for JIT-provisioned users
  domain_restriction  VARCHAR(255),                           -- e.g. "acme.com"
  attribute_mapping   JSONB NOT NULL DEFAULT '{}',            -- Map IdP claims → PMS fields
  settings            JSONB NOT NULL DEFAULT '{}',            -- Extra config
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sso_company_provider UNIQUE (company_id, provider)
);

-- Links external IdP identities to PMS users
CREATE TABLE sso_identities (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sso_config_id     UUID NOT NULL REFERENCES sso_configs(id) ON DELETE CASCADE,
  external_id       VARCHAR(255) NOT NULL,                    -- sub / nameId from IdP
  external_email    VARCHAR(255),
  external_username VARCHAR(255),
  raw_attributes    JSONB NOT NULL DEFAULT '{}',              -- Full IdP profile snapshot
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sso_identity UNIQUE (sso_config_id, external_id)
);
CREATE INDEX idx_sso_identity_user ON sso_identities(user_id);
```

### TypeORM Entities

```typescript
// src/modules/auth/entities/user.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { Company } from '../../organization/entities/company.entity';

@Entity('users')
@Index(['email', 'companyId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ name: 'locked_at', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'locked_reason', nullable: true, length: 255 })
  lockedReason: string | null;

  @Column({ name: 'failed_attempts', default: 0 })
  failedAttempts: number;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret', nullable: true, length: 255 })
  mfaSecret: string | null;  // encrypted at app layer

  @Column({ name: 'mfa_backup_codes', type: 'text', array: true, nullable: true })
  mfaBackupCodes: string[] | null;

  @Column({ name: 'password_changed_at', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

// src/modules/auth/entities/refresh-token.entity.ts
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'token_hash', length: 255, unique: true })
  tokenHash: string;

  @Column({ name: 'device_id', nullable: true })
  deviceId: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoke_reason', nullable: true, length: 100 })
  revokeReason: string | null;
}

// src/modules/auth/entities/auth-audit-log.entity.ts
export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  MFA_VERIFY_SUCCESS = 'mfa_verify_success',
  MFA_VERIFY_FAILURE = 'mfa_verify_failure',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_COMPLETE = 'password_reset_complete',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  DEVICE_TRUSTED = 'device_trusted',
  DEVICE_REVOKED = 'device_revoked',
  SSO_LOGIN = 'sso_login',
  IP_BLOCKED = 'ip_blocked',
}

@Entity('auth_audit_logs')
export class AuthAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ nullable: true, length: 255 })
  email: string | null;

  @Column({ name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ name: 'event_type', length: 50 })
  eventType: AuthEventType;

  @Column({ length: 10 })
  status: 'success' | 'failure';

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'device_id', nullable: true })
  deviceId: string | null;

  @Column({ name: 'geo_country', nullable: true, length: 100 })
  geoCountry: string | null;

  @Column({ name: 'geo_city', nullable: true, length: 100 })
  geoCity: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

---

## Server-Side Architecture

### Directory Structure

```
src/modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── token.service.ts
├── mfa.service.ts
├── password.service.ts
├── ip-policy.service.ts
├── audit.service.ts
├── guards/
│   ├── jwt-auth.guard.ts          # global guard applied via APP_GUARD
│   ├── local-auth.guard.ts        # email+password strategy
│   ├── refresh-token.guard.ts
│   └── roles.guard.ts
├── strategies/
│   ├── jwt.strategy.ts
│   ├── local.strategy.ts
│   ├── google-oauth.strategy.ts
│   └── saml.strategy.ts
├── decorators/
│   ├── current-user.decorator.ts
│   ├── public.decorator.ts        # @Public() skips JWT guard
│   └── roles.decorator.ts
├── dto/
│   ├── login.dto.ts
│   ├── refresh-token.dto.ts
│   ├── mfa-enable.dto.ts
│   ├── mfa-verify.dto.ts
│   ├── change-password.dto.ts
│   ├── reset-password-request.dto.ts
│   ├── reset-password.dto.ts
│   ├── ip-policy.dto.ts
│   └── password-policy.dto.ts
├── entities/
│   ├── user.entity.ts
│   ├── refresh-token.entity.ts
│   ├── user-device.entity.ts
│   ├── sso-identity.entity.ts
│   ├── ip-policy.entity.ts
│   ├── password-policy.entity.ts
│   ├── password-history.entity.ts
│   └── auth-audit-log.entity.ts
└── interfaces/
    ├── jwt-payload.interface.ts
    └── auth-tokens.interface.ts
```

### DTOs

```typescript
// src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @IsString()
  @Transform(({ value }) => value?.toUpperCase().trim())
  companyCode: string;  // Company code for multi-tenant isolation (e.g. 'ACME')

  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;  // extends refresh token TTL from 1d to 30d

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

// src/modules/auth/dto/mfa-verify.dto.ts
export class MfaVerifyDto {
  @IsString()
  @Length(6, 8)
  code: string;  // 6-digit TOTP or 8-char backup code

  @IsString()
  mfaToken: string;  // short-lived token from initial login response
}

// src/modules/auth/dto/change-password.dto.ts
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsString()
  confirmPassword: string;
}

// src/modules/auth/dto/ip-policy.dto.ts
export class CreateIpPolicyDto {
  @IsEnum(['allow', 'deny'])
  policyType: 'allow' | 'deny';

  @IsString()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/, { message: 'Invalid CIDR notation' })
  cidr: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;  // NULL = company-wide
}

// src/modules/auth/interfaces/jwt-payload.interface.ts
export interface JwtPayload {
  sub: string;         // user UUID
  email: string;
  companyId: string;
  sessionId: string;   // refresh token family ID
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}
```

### Services

```typescript
// src/modules/auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private tokenService: TokenService,
    private mfaService: MfaService,
    private passwordService: PasswordService,
    private ipPolicyService: IpPolicyService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {}

  /**
   * Validates credentials. Returns user or throws.
   * Called by LocalStrategy before JWT issuance.
   */
  async validateCredentials(email: string, password: string, companyId: string): Promise<User> { ... }

  /**
   * Full login flow: IP check → credential validation →
   * failed attempt tracking → lockout → MFA challenge or token issuance.
   * Returns AuthTokens | MfaChallengeResponse
   */
  async login(dto: LoginDto, context: RequestContext): Promise<AuthTokens | MfaChallengeResponse> { ... }

  /**
   * Completes MFA step. Validates TOTP/backup code, issues final tokens.
   */
  async completeMfaLogin(dto: MfaVerifyDto, context: RequestContext): Promise<AuthTokens> { ... }

  /**
   * Validates refresh token, rotates (old revoked, new issued).
   * Detects token reuse — revokes entire token family on detection.
   */
  async refreshTokens(refreshToken: string, context: RequestContext): Promise<AuthTokens> { ... }

  /**
   * Revokes refresh token for this device. Optionally revokes all sessions.
   */
  async logout(userId: string, refreshToken: string, allDevices: boolean): Promise<void> { ... }

  /**
   * Handles OAuth2 callback. Creates user if first SSO login (auto-provision).
   */
  async handleSsoCallback(provider: string, profile: OAuthProfile, context: RequestContext): Promise<AuthTokens> { ... }
}

// src/modules/auth/services/sso.service.ts
export class SsoService {
  /**
   * Generates the IdP authorization URL for OIDC redirect.
   * Creates a CSRF state token stored in a short-lived cookie.
   */
  async initiateLogin(companyId: string, provider: string, redirectUri: string): Promise<{ authorizationUrl: string; state: string }> { ... }

  /**
   * Handles the IdP callback:
   * 1. Exchange auth code for IdP tokens
   * 2. Fetch user info from IdP userinfo endpoint
   * 3. Check domain restriction
   * 4. Find existing user by SSO identity or email, or JIT-provision
   * 5. Upsert SSO identity link
   * 6. Issue PMS JWT tokens
   * 7. Audit log
   */
  async handleCallback(companyId: string, provider: string, code: string, state: string, redirectUri: string, context: RequestContext): Promise<{ tokens: AuthTokens; user: Record<string, unknown>; isNewUser: boolean }> { ... }

  // ─── Admin CRUD ───
  async getConfigs(companyId: string): Promise<SsoConfig[]> { ... }
  async getConfig(id: string, companyId: string): Promise<SsoConfig> { ... }  // clientSecret masked
  async createConfig(companyId: string, data: CreateSsoConfigDto): Promise<SsoConfig> { ... }
  async updateConfig(id: string, companyId: string, data: Partial<SsoConfig>): Promise<SsoConfig> { ... }
  async deleteConfig(id: string, companyId: string): Promise<void> { ... }
  async toggleConfig(id: string, companyId: string, enabled: boolean): Promise<SsoConfig> { ... }

  // ─── Private Helpers ───
  private async getEnabledConfig(companyId: string, provider: string): Promise<SsoConfig> { ... }
  private async exchangeCodeForTokens(config: SsoConfig, code: string, redirectUri: string): Promise<{ accessToken: string; idToken?: string }> { ... }
  private async fetchUserInfo(config: SsoConfig, accessToken: string): Promise<IdpUserProfile> { ... }
  private async resolveUser(config: SsoConfig, idpUser: IdpUserProfile, companyId: string): Promise<{ user: User; isNewUser: boolean }> { ... }
  private async upsertSsoIdentity(ssoConfigId: string, userId: string, idpUser: IdpUserProfile): Promise<void> { ... }
}

// src/modules/auth/token.service.ts
@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    @InjectRedis() private redis: Redis,
    @InjectRepository(RefreshToken) private refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async issueTokens(user: User, deviceId?: string, rememberMe = false): Promise<AuthTokens> { ... }

  /**
   * Stores refresh token in Redis (primary) + DB (audit).
   * Redis key: refresh:{userId}:{tokenFamily}
   * TTL: 1 day (default) or 30 days (rememberMe)
   */
  async storeRefreshToken(userId: string, token: string, family: string, ttl: number): Promise<void> { ... }

  /**
   * Verifies refresh token exists in Redis.
   * If not in Redis but in DB (revoked): REUSE DETECTED → revoke family.
   */
  async validateRefreshToken(token: string): Promise<RefreshToken> { ... }

  async revokeTokenFamily(family: string): Promise<void> { ... }

  async revokeAllUserTokens(userId: string): Promise<void> { ... }

  /**
   * Blacklists access token in Redis until its natural expiry.
   * Redis key: blacklist:at:{jti}
   */
  async blacklistAccessToken(jti: string, expiresIn: number): Promise<void> { ... }

  async isAccessTokenBlacklisted(jti: string): Promise<boolean> { ... }
}

// src/modules/auth/mfa.service.ts
@Injectable()
export class MfaService {
  /**
   * Generates TOTP secret + QR code URI for enrollment.
   * Secret is NOT saved to DB until verified.
   */
  async generateMfaSetup(user: User): Promise<{ secret: string; qrCodeUrl: string; backupCodes: string[] }> { ... }

  /**
   * Verifies TOTP code against provided secret. If valid, saves encrypted secret to user.
   */
  async enableMfa(user: User, secret: string, code: string): Promise<void> { ... }

  /**
   * Validates TOTP code or backup code against stored secret.
   * Backup codes are single-use; invalidated on use.
   */
  async verifyCode(user: User, code: string): Promise<boolean> { ... }

  async disableMfa(user: User, code: string): Promise<void> { ... }

  async regenerateBackupCodes(user: User): Promise<string[]> { ... }

  private encryptSecret(secret: string): string { ... }
  private decryptSecret(encrypted: string): string { ... }
}

// src/modules/auth/password.service.ts
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates against company password policy:
   * - complexity rules
   * - not in history (last N hashes)
   * - not in HaveIBeenPwned breach database
   */
  async validateNewPassword(password: string, userId: string, companyId: string): Promise<void> { ... }

  async checkBreachDatabase(password: string): Promise<boolean> {
    // Uses k-Anonymity API: https://api.pwnedpasswords.com/range/{first5}
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    // fetch + check suffix in response
  }

  async addToHistory(userId: string, passwordHash: string): Promise<void> { ... }
}
```

### Guards & Strategies

```typescript
// src/modules/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private redis: Redis) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    // 1. Check token blacklist in Redis
    const jti = payload['jti'];
    const blacklisted = await this.redis.get(`blacklist:at:${jti}`);
    if (blacklisted) throw new UnauthorizedException('Token revoked');
    // 2. Attach to request
    return payload;
  }
}

// src/modules/auth/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext) {
    // Skip guard for @Public() decorated routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

---

## API Contract

### Base URL: `/api/v1/auth`

---

### `GET /auth/company/info`
**Access:** Public

Returns the number of active companies and auto-fills the single company if only one exists. The login page uses this to hide the company code field when there's only one company.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "count": 1,
    "singleCompany": { "code": "ACME", "name": "ACME Property Group", "logoUrl": null }
  }
}
```

When multiple companies exist, `singleCompany` is `null` and the login page shows the company code input.

---

### `GET /auth/company/validate?code=ACME`
**Access:** Public

Validates a company code in real-time as the user types.

**Response 200 — Valid:**
```json
{ "success": true, "data": { "name": "ACME Property Group", "logoUrl": null } }
```

**Response 200 — Not found:**
```json
{ "success": true, "data": null }
```

---

### `POST /auth/login`
**Access:** Public

**Request Body:**
```json
{
  "companyCode": "ACME",
  "email": "admin@acmecorp.com",
  "password": "SecurePass@123",
  "rememberMe": false,
  "deviceFingerprint": "a3f4b2c1...",
  "deviceName": "Chrome on MacOS"
}
```

**Login flow:**
1. Resolve company by `companyCode` → get `companyId`
2. Set PostgreSQL RLS context: `SET app.current_company_id = '<companyId>'`
3. Find user by email scoped to that company
4. Validate password, check lockout, IP policy
5. Issue JWT with `companyId` claim

**Response 200 — No MFA:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiJ9...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "user": {
      "id": "uuid",
      "email": "admin@acmecorp.com",
      "companyId": "uuid",
      "companyCode": "ACME",
      "companyName": "ACME Property Group",
      "roles": ["Super Admin"],
      "permissions": ["users.read", "users.create", "..."],
      "mustChangePassword": false
    }
  }
}
```

**Response 200 — MFA Required:**
```json
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "mfaToken": "eyJ...",
    "mfaTokenExpiresIn": 300
  }
}
```

**Response 401:**
```json
{
  "success": false,
  "errors": [{ "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" }]
}
```

**Response 423 — Account Locked:**
```json
{
  "success": false,
  "errors": [{
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked after 5 failed attempts. Try again in 28 minutes.",
    "meta": { "unlockAt": "2025-01-15T10:30:00Z" }
  }]
}
```

---

### `POST /auth/mfa/verify`
**Access:** Public (requires mfaToken)

**Request Body:**
```json
{
  "mfaToken": "eyJ...",
  "code": "123456"
}
```

**Response 200:** Same as login success (accessToken + refreshToken)

**Response 401:**
```json
{
  "success": false,
  "errors": [{ "code": "INVALID_MFA_CODE", "message": "Invalid or expired MFA code" }]
}
```

---

### `POST /auth/refresh`
**Access:** Public

**Request Body:**
```json
{ "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g..." }
```

**Response 200:** New accessToken + refreshToken pair

**Response 401 — Reuse detected:**
```json
{
  "success": false,
  "errors": [{ "code": "TOKEN_REUSE_DETECTED", "message": "Security violation. All sessions terminated." }]
}
```

---

### `POST /auth/logout`
**Access:** Authenticated

**Request Body:**
```json
{ "allDevices": false }
```

**Response 204:** No content

---

### `POST /auth/mfa/setup`
**Access:** Authenticated

**Response 200:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "otpauth://totp/PMS:admin@acmecorp.com?secret=...",
    "backupCodes": ["ABCD-1234", "EFGH-5678", "..."]
  }
}
```

---

### `POST /auth/mfa/enable`
**Access:** Authenticated

**Request Body:**
```json
{ "secret": "JBSWY3DPEHPK3PXP", "code": "123456" }
```

**Response 200:** `{ "success": true, "data": { "mfaEnabled": true } }`

---

### `POST /auth/mfa/disable`
**Access:** Authenticated

**Request Body:**
```json
{ "code": "123456" }
```

---

### `POST /auth/password/change`
**Access:** Authenticated

**Request Body:**
```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewPass@456",
  "confirmPassword": "NewPass@456"
}
```

**Response 200:** `{ "success": true }`

**Response 422:**
```json
{
  "success": false,
  "errors": [
    { "code": "PASSWORD_IN_HISTORY", "message": "Cannot reuse your last 5 passwords" },
    { "code": "PASSWORD_BREACHED", "message": "This password has been found in a data breach" }
  ]
}
```

---

### `POST /auth/password/reset-request`
**Access:** Public

**Request Body:** `{ "email": "admin@acmecorp.com" }`

**Response 200:** Always returns success (prevents email enumeration)
```json
{ "success": true, "data": { "message": "If that email exists, a reset link has been sent." } }
```

---

### `POST /auth/password/reset`
**Access:** Public

**Request Body:**
```json
{
  "token": "raw-reset-token-from-email",
  "newPassword": "NewPass@456",
  "confirmPassword": "NewPass@456"
}
```

---

### `GET /auth/devices`
**Access:** Authenticated

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "deviceName": "Chrome on MacOS",
      "deviceType": "browser",
      "os": "macOS 14",
      "browser": "Chrome 120",
      "isTrusted": true,
      "lastSeenAt": "2025-01-14T08:00:00Z",
      "lastIp": "203.0.113.42",
      "isCurrent": true
    }
  ]
}
```

---

### `DELETE /auth/devices/:deviceId`
**Access:** Authenticated

**Response 204:** No content

---

### `GET /auth/audit-logs`
**Access:** Authenticated (own logs) | Admin (any user)

**Query Params:** `?userId=&eventType=&status=&from=&to=&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": [...],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

### `GET /auth/sso/initiate`
**Access:** Public  
**Query Params:** `provider` (`azure_ad` | `okta` | `google` | `oidc`), `companyId` (UUID)  
Returns the IdP authorization URL. Frontend redirects user to this URL.

**Response:**
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?client_id=...&scope=openid+profile+email&state=..."
  }
}
```

A `sso_state` cookie is set (httpOnly, 10-minute TTL) for CSRF protection.

---

### `GET /auth/sso/callback`
**Access:** Public (IdP callback)  
**Query Params:** `code`, `state`, `error`, `error_description`  

Called by the IdP after user authenticates. On success:
1. Validates CSRF state cookie
2. Exchanges authorization code for IdP tokens
3. Fetches user info from IdP
4. Finds or JIT-provisions the PMS user
5. Issues PMS JWT tokens
6. Sets `refreshToken` cookie
7. Redirects to `{FRONTEND_URL}/sso/complete#token={accessToken}&new={isNewUser}`

On error: redirects to `{FRONTEND_URL}/login?sso_error={error_description}`

---

### `GET /auth/sso/configs`
**Access:** Authenticated (Admin)  
Returns all SSO configurations for the company (secrets excluded).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Acme Azure AD",
      "provider": "azure_ad",
      "protocol": "oidc",
      "isEnabled": true,
      "isDefault": true,
      "domainRestriction": "acme.com",
      "autoProvision": true,
      "scopes": "openid profile email"
    }
  ]
}
```

---

### `GET /auth/sso/configs/:id`
**Access:** Authenticated (Admin)  
Returns full config detail. `clientSecret` is masked as `••••••••`.

---

### `POST /auth/sso/configs`
**Access:** Authenticated (Admin)  
Creates a new SSO provider config.

**Request Body:**
```json
{
  "name": "Acme Azure AD",
  "provider": "azure_ad",
  "protocol": "oidc",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "issuerUrl": "https://login.microsoftonline.com/{tenant}/v2.0",
  "authorizationUrl": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
  "tokenUrl": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
  "userInfoUrl": "https://graph.microsoft.com/oidc/userinfo",
  "scopes": "openid profile email",
  "autoProvision": true,
  "defaultRoleId": "uuid-of-default-role",
  "domainRestriction": "acme.com",
  "attributeMapping": { "given_name": "firstName", "family_name": "lastName" }
}
```

---

### `PUT /auth/sso/configs/:id`
**Access:** Authenticated (Admin)  
Updates an existing SSO config. If `clientSecret` is sent as `••••••••`, it is not overwritten.

---

### `DELETE /auth/sso/configs/:id`
**Access:** Authenticated (Admin)  
Deletes an SSO config and all linked identities. Returns `204 No Content`.

---

### `PATCH /auth/sso/configs/:id/toggle`
**Access:** Authenticated (Admin)  
Enables or disables an SSO provider.

**Request Body:**
```json
{ "enabled": true }
```

---

### `GET /admin/ip-policy`  
### `POST /admin/ip-policy`  
### `DELETE /admin/ip-policy/:id`
**Access:** Admin role

**POST Request Body:**
```json
{
  "policyType": "allow",
  "cidr": "192.168.1.0/24",
  "description": "Office network",
  "userId": null
}
```

---

### `GET /admin/password-policy`
### `PUT /admin/password-policy`
**Access:** Admin role

**PUT Request Body:**
```json
{
  "minLength": 10,
  "requireUppercase": true,
  "requireLowercase": true,
  "requireNumber": true,
  "requireSpecial": true,
  "maxAgeDays": 90,
  "historyCount": 5,
  "maxFailedAttempts": 5,
  "lockoutDurationMins": 30,
  "sessionTimeoutMins": 480,
  "mfaRequired": false
}
```

---

## Business Logic & Validation Rules

### Login Flow

```
1. Normalize email (lowercase, trim)
2. Look up user by (email, companyId) → 404 maps to generic "invalid credentials"
3. Check user.isActive → 401 if false
4. Check IP policy:
   a. Load company + user-specific IP rules
   b. Evaluate deny rules first; if match → 403 + audit log IP_BLOCKED
   c. If allow rules exist and IP doesn't match any → 403
5. Check user.isLocked:
   a. If locked, check lockout expiry (lockedAt + lockoutDurationMins)
   b. If expiry passed → auto-unlock, reset failedAttempts
   c. If still locked → 423 with unlockAt timestamp
6. Verify password (bcrypt.compare)
   a. Mismatch → increment failedAttempts
   b. failedAttempts >= maxFailedAttempts → lock account → emit audit ACCOUNT_LOCKED
   c. Match → reset failedAttempts to 0
7. Check mustChangePassword → include flag in response; enforce on next request
8. If mfaEnabled:
   a. Issue short-lived mfaToken (JWT, 5 min TTL, signed with MFA_SECRET)
   b. Return { mfaRequired: true, mfaToken }
9. Issue accessToken + refreshToken
10. Record device (upsert by fingerprint)
11. Write audit log LOGIN_SUCCESS
12. Update user.lastLoginAt
```

### Refresh Token Rotation

```
1. Hash incoming refresh token (SHA-256)
2. Look up in Redis → not found: check DB
   a. Found in DB but revoked → TOKEN REUSE DETECTED
      → Revoke entire token family (all sessions for user)
      → Audit log SECURITY_VIOLATION
      → Return 401
   b. Not in Redis or DB → 401 invalid token
3. Validate token expiry
4. Issue new token pair (new family if rememberMe changed)
5. Revoke old refresh token in Redis + DB
6. Store new refresh token
7. Audit log TOKEN_REFRESH
```

### Password Policy Validation

```
Rules evaluated in order (all must pass):
1. Length >= minLength
2. Has uppercase (if required): /[A-Z]/
3. Has lowercase (if required): /[a-z]/
4. Has number (if required): /[0-9]/
5. Has special char (if required): /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
6. Not in password history (bcrypt compare last N hashes)
7. Not in HaveIBeenPwned (k-Anonymity SHA1 prefix API call)
   → Failure here is a WARNING, not a hard block (configurable)
```

### IP Policy Evaluation

```
Algorithm (evaluated per request at auth time):
1. Load active policies for (companyId, userId=NULL) + (companyId, userId=currentUser)
2. Separate into deny_rules[] and allow_rules[]
3. For each deny rule: if requestIp in CIDR range → block (deny takes priority)
4. If allow_rules is not empty:
   for each allow rule: if requestIp in CIDR range → pass
   if no match in allow rules → block
5. If deny_rules is empty AND allow_rules is empty → pass (no restrictions)
```

### Account Lockout

```
On each failed login:
  failedAttempts++
  IF failedAttempts >= policy.maxFailedAttempts:
    isLocked = TRUE
    lockedAt = NOW()
    lockedReason = 'Too many failed login attempts'
    emit notification to user email (if emailVerified)
    write audit ACCOUNT_LOCKED

Auto-unlock check on next login attempt:
  IF isLocked AND (NOW() - lockedAt) > lockoutDurationMins:
    isLocked = FALSE, lockedAt = NULL, failedAttempts = 0
```

---

## UI Screens & Component Breakdown

### Screens

| Screen | Route | Access |
|--------|-------|--------|
| Login | `/login` | Public |
| MFA Verify | `/login/mfa` | Semi-auth (mfaToken) |
| Forgot Password | `/forgot-password` | Public |
| Reset Password | `/reset-password?token=` | Public |
| MFA Setup Wizard | `/settings/security/mfa` | Authenticated |
| Active Devices | `/settings/security/devices` | Authenticated |
| Audit Log | `/settings/security/audit` | Authenticated + Admin |
| IP Policy Admin | `/admin/security/ip-policy` | Admin |
| Password Policy Admin | `/admin/security/password-policy` | Admin |

---

### Component Tree

```
pages/
├── LoginPage/
│   ├── LoginPage.tsx                   # route wrapper, handles redirect if authed
│   ├── components/
│   │   ├── LoginForm.tsx               # email + password fields, rememberMe checkbox
│   │   │   ├── EmailField.tsx
│   │   │   ├── PasswordField.tsx       # show/hide toggle
│   │   │   ├── RememberMeCheckbox.tsx
│   │   │   └── SsoButtons.tsx          # Google / Azure AD buttons
│   │   ├── LoginErrorBanner.tsx        # shows error code → human message mapping
│   │   └── AccountLockedAlert.tsx      # shows countdown timer to unlock
│   └── hooks/
│       └── useLogin.ts                 # RTK Query mutation + redirect logic

├── MfaVerifyPage/
│   ├── MfaVerifyPage.tsx
│   └── components/
│       ├── TotpInput.tsx               # 6-digit segmented input (auto-focus next)
│       └── BackupCodeInput.tsx         # toggle to enter 8-char backup code

├── ForgotPasswordPage/
│   └── components/
│       ├── ForgotPasswordForm.tsx
│       └── SuccessMessage.tsx

├── ResetPasswordPage/
│   └── components/
│       ├── ResetPasswordForm.tsx       # newPassword + confirmPassword
│       ├── PasswordStrengthMeter.tsx   # visual strength indicator
│       └── TokenExpiredAlert.tsx

settings/security/
├── MfaSetupPage/
│   └── components/
│       ├── MfaSetupStepper.tsx         # Step 1: Download app, Step 2: Scan QR, Step 3: Verify
│       ├── QrCodeDisplay.tsx           # renders QR + manual secret text
│       ├── BackupCodesDisplay.tsx      # shows 10 codes, copy-all + download button
│       └── MfaVerifyStep.tsx

├── DevicesPage/
│   └── components/
│       ├── DeviceCard.tsx              # device info + "Current" badge + Revoke button
│       ├── DeviceList.tsx
│       └── RevokeAllButton.tsx

├── AuditLogPage/
│   └── components/
│       ├── AuditLogTable.tsx           # paginated table with filters
│       ├── AuditLogFilters.tsx         # event type, date range, status
│       ├── AuditEventBadge.tsx         # color-coded event type chip
│       └── AuditLogRow.tsx

admin/security/
├── IpPolicyPage/
│   └── components/
│       ├── IpPolicyTable.tsx
│       ├── AddIpPolicyModal.tsx        # CIDR input with validation
│       └── IpPolicyToggle.tsx

└── PasswordPolicyPage/
    └── components/
        ├── PasswordPolicyForm.tsx      # all policy sliders/toggles
        └── PolicyPreviewPanel.tsx      # shows current effective rules
```

### Key UI Behaviors

```
LoginForm:
- Email field: type=email, autocomplete=email
- Password field: type=password, autocomplete=current-password
- On submit: disable button, show spinner
- On INVALID_CREDENTIALS (attempts 1–3): show error banner
- On INVALID_CREDENTIALS (attempts 4): warn "1 attempt remaining before lockout"
- On ACCOUNT_LOCKED: switch to AccountLockedAlert with live countdown
- On mfaRequired: push to /login/mfa, pass mfaToken via location.state

TotpInput:
- 6 individual <input type="text" maxLength={1}> cells
- Auto-focus next cell on keypress
- Auto-submit when 6th digit entered
- Paste handler: distribute digits across cells

PasswordStrengthMeter:
- Score 0–4 (zxcvbn library)
- Color: red (0-1) | orange (2) | yellow (3) | green (4)
- Show which rules are still unmet as checklist

MfaSetupStepper:
- Step 1: Download authenticator app (Google/Microsoft/Authy)
- Step 2: Show QR code + manual entry option
- Step 3: Enter 6-digit code to confirm setup
- Step 4: Show backup codes (MUST acknowledge download/copy before proceeding)
```

---

## State Management

### Redux Slice

```typescript
// src/store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  companyId: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaPending: boolean;
  mfaToken: string | null;
  sessionExpiresAt: number | null;  // unix timestamp
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,   // true on app boot until token checked
  mfaPending: false,
  mfaToken: null,
  sessionExpiresAt: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: AuthUser; accessToken: string; expiresIn: number }>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      state.mfaPending = false;
      state.mfaToken = null;
      state.sessionExpiresAt = Date.now() + action.payload.expiresIn * 1000;
    },
    setMfaPending: (state, action: PayloadAction<{ mfaToken: string }>) => {
      state.mfaPending = true;
      state.mfaToken = action.payload.mfaToken;
    },
    clearAuth: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.mfaPending = false;
      state.mfaToken = null;
      state.sessionExpiresAt = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const { setCredentials, setMfaPending, clearAuth, setLoading } = authSlice.actions;
```

### RTK Query API

```typescript
// src/store/api/authApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginDto>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        if (data.data.mfaRequired) {
          dispatch(setMfaPending({ mfaToken: data.data.mfaToken }));
        } else {
          dispatch(setCredentials(data.data));
          // Store refresh token in httpOnly cookie via Set-Cookie header
        }
      },
    }),

    verifyMfa: builder.mutation<LoginResponse, MfaVerifyDto>({
      query: (body) => ({ url: '/auth/mfa/verify', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(setCredentials(data.data));
      },
    }),

    logout: builder.mutation<void, { allDevices: boolean }>({
      query: (body) => ({ url: '/auth/logout', method: 'POST', body }),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(clearAuth());
        dispatch(authApi.util.resetApiState());
      },
    }),

    refreshTokens: builder.mutation<LoginResponse, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
    }),

    setupMfa: builder.mutation<MfaSetupResponse, void>({
      query: () => ({ url: '/auth/mfa/setup', method: 'POST' }),
    }),

    enableMfa: builder.mutation<void, { secret: string; code: string }>({
      query: (body) => ({ url: '/auth/mfa/enable', method: 'POST', body }),
    }),

    getDevices: builder.query<DeviceListResponse, void>({
      query: () => '/auth/devices',
      providesTags: ['Devices'],
    }),

    revokeDevice: builder.mutation<void, string>({
      query: (deviceId) => ({ url: `/auth/devices/${deviceId}`, method: 'DELETE' }),
      invalidatesTags: ['Devices'],
    }),

    getAuditLogs: builder.query<AuditLogResponse, AuditLogQuery>({
      query: (params) => ({ url: '/auth/audit-logs', params }),
    }),

    getIpPolicies: builder.query<IpPolicyListResponse, void>({
      query: () => '/admin/ip-policy',
      providesTags: ['IpPolicies'],
    }),

    createIpPolicy: builder.mutation<void, CreateIpPolicyDto>({
      query: (body) => ({ url: '/admin/ip-policy', method: 'POST', body }),
      invalidatesTags: ['IpPolicies'],
    }),

    deleteIpPolicy: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/ip-policy/${id}`, method: 'DELETE' }),
      invalidatesTags: ['IpPolicies'],
    }),

    getPasswordPolicy: builder.query<PasswordPolicyResponse, void>({
      query: () => '/admin/password-policy',
    }),

    updatePasswordPolicy: builder.mutation<void, UpdatePasswordPolicyDto>({
      query: (body) => ({ url: '/admin/password-policy', method: 'PUT', body }),
    }),
  }),
});
```

### Token Refresh Middleware

```typescript
// src/store/middleware/tokenRefreshMiddleware.ts
// Intercepts 401 responses, attempts silent token refresh, retries original request.
export const tokenRefreshMiddleware = (api: MiddlewareAPI) => (next: Dispatch) => async (action: Action) => {
  if (isRejectedWithValue(action) && action.payload?.status === 401) {
    const refreshResult = await api.dispatch(authApi.endpoints.refreshTokens.initiate());
    if ('data' in refreshResult) {
      api.dispatch(setCredentials(refreshResult.data.data));
      // Retry original action
      return next(action.meta.baseQueryMeta?.retryCount ? action : retryAction(action));
    } else {
      api.dispatch(clearAuth());
      window.location.href = '/login';
    }
  }
  return next(action);
};
```

---

## Security Considerations

| Concern | Implementation |
|---------|---------------|
| Refresh token storage | httpOnly, Secure, SameSite=Strict cookie — never in localStorage |
| Access token storage | Redux in-memory only — lost on page refresh (re-fetched via refresh cookie) |
| CSRF protection | Custom request header `X-Requested-With: XMLHttpRequest` checked on cookie endpoints |
| Token reuse detection | Refresh token rotation with family revocation (see TokenService) |
| MFA secret storage | AES-256-GCM encrypted in DB (key from KMS / env secret) |
| Password storage | bcrypt with work factor 12 |
| Timing attack prevention | `bcrypt.compare` used even for non-existent users (dummy compare) |
| Rate limiting | 10 login attempts/min per IP via NestJS throttler + Redis |
| Audit completeness | Every auth event → audit log regardless of success/failure |
| SQL injection | TypeORM parameterized queries; no raw SQL with user input |

---

## Environment Variables

```env
# JWT
JWT_SECRET=<256-bit-random-hex>
JWT_ACCESS_EXPIRY=900          # 15 minutes (seconds)
JWT_REFRESH_EXPIRY=86400       # 1 day (seconds)
JWT_REFRESH_EXPIRY_LONG=2592000 # 30 days (rememberMe)
JWT_MFA_SECRET=<separate-256-bit-secret>
JWT_MFA_EXPIRY=300             # 5 minutes

# Encryption (MFA secrets, SSO tokens)
ENCRYPTION_KEY=<32-byte-hex>
ENCRYPTION_IV_LENGTH=16

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=pms:

# OAuth2 / SSO (now configured via database — see SSO section)
# Legacy env vars kept for reference; new approach uses sso_configs table
BACKEND_URL=http://localhost:4000

# HaveIBeenPwned
HIBP_API_URL=https://api.pwnedpasswords.com
HIBP_CHECK_ENABLED=true

# Rate Limiting
AUTH_RATE_LIMIT_TTL=60         # seconds
AUTH_RATE_LIMIT_MAX=10         # max login attempts per TTL
```

---

## SSO — Single Sign-On

**Status:** ✅ Future-Ready Scaffolding Implemented  
**Protocol Support:** OIDC (implemented), SAML 2.0 (schema ready)

### Architecture

```
┌──────────┐     1. GET /auth/sso/initiate     ┌──────────────┐
│  Browser  │──────────────────────────────────▶│  PMS Server   │
│  (SPA)    │◀─────── authorizationUrl ─────────│  (sso.service)│
└─────┬─────┘                                   └───────┬───────┘
      │                                                 │
      │ 2. Redirect to IdP                              │
      ▼                                                 │
┌───────────┐                                           │
│   IdP      │ (Azure AD / Okta / Google)               │
│   Login    │                                          │
└─────┬──────┘                                          │
      │                                                 │
      │ 3. Redirect to /auth/sso/callback?code=...      │
      ▼                                                 │
┌──────────┐     4. Exchange code → tokens     ┌────────┴───────┐
│  Browser  │──────────────────────────────────▶│  PMS Server     │
│           │◀── redirect /sso/complete#token ──│  Issues PMS JWT │
└──────────┘                                   └────────────────┘
```

### Supported Providers

| Provider | Protocol | Status |
|----------|----------|--------|
| Azure AD | OIDC | ✅ Ready (configure via API) |
| Okta | OIDC | ✅ Ready (configure via API) |
| Google Workspace | OIDC | ✅ Ready (configure via API) |
| Generic OIDC | OIDC | ✅ Ready (configure via API) |
| SAML 2.0 | SAML | 📋 Schema ready, service returns 501 |

### Features

| Feature | Description |
|---------|-------------|
| **Multi-provider** | Each company can configure multiple SSO providers |
| **JIT Provisioning** | Auto-create PMS users on first SSO login |
| **Default Role** | Assign a role to JIT-provisioned users |
| **Domain Restriction** | Only allow emails from a specific domain |
| **Attribute Mapping** | Map IdP claims to PMS user fields |
| **Identity Linking** | Track which IdP identity maps to which PMS user |
| **Secret Masking** | Client secrets are masked in API responses |
| **CSRF Protection** | State tokens in cookies prevent CSRF attacks |
| **Audit Logging** | All SSO logins are recorded with `sso_login` event type |

### Configuration via API

SSO is configured per-company through the admin API (`POST /auth/sso/configs`), not via environment variables. This allows:
- Runtime configuration without server restarts
- Multi-tenant support (each company has its own IdP)
- Easy enable/disable toggling

### Database Tables

- **`sso_configs`** — Per-company IdP configuration (OIDC endpoints, client credentials, provisioning rules)
- **`sso_identities`** — Links external IdP identities (`sub`/`nameId`) to PMS users

### How to Activate

1. **Register your app** with the IdP (Azure AD, Okta, etc.) and get `clientId` + `clientSecret`
2. **Create an SSO config** via `POST /auth/sso/configs` with the IdP endpoints
3. **Enable it** via `PATCH /auth/sso/configs/:id/toggle` with `{ "enabled": true }`
4. **Add a "Sign in with SSO" button** on the login page that calls `GET /auth/sso/initiate?provider=azure_ad&companyId=...`
5. The user is redirected to the IdP, authenticates, and is redirected back with a PMS JWT
