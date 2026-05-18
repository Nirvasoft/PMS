-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "company_type" VARCHAR(30) NOT NULL DEFAULT 'standalone',
    "registration_no" VARCHAR(100),
    "tax_id" VARCHAR(100),
    "industry" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "country" VARCHAR(2) NOT NULL DEFAULT 'US',
    "timezone" VARCHAR(60) DEFAULT 'UTC',
    "currency" VARCHAR(3) DEFAULT 'USD',
    "logo_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ,
    "locked_reason" VARCHAR(255),
    "failed_attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "mfa_backup_codes" TEXT[],
    "password_changed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "family" VARCHAR(255) NOT NULL,
    "device_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoke_reason" VARCHAR(100),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_name" VARCHAR(255),
    "device_type" VARCHAR(50),
    "os" VARCHAR(100),
    "browser" VARCHAR(100),
    "fingerprint" VARCHAR(255) NOT NULL,
    "is_trusted" BOOLEAN NOT NULL DEFAULT false,
    "trusted_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "last_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "policy_type" VARCHAR(10) NOT NULL,
    "cidr" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "min_length" SMALLINT NOT NULL DEFAULT 8,
    "require_uppercase" BOOLEAN NOT NULL DEFAULT true,
    "require_lowercase" BOOLEAN NOT NULL DEFAULT true,
    "require_number" BOOLEAN NOT NULL DEFAULT true,
    "require_special" BOOLEAN NOT NULL DEFAULT true,
    "max_age_days" SMALLINT DEFAULT 90,
    "history_count" SMALLINT NOT NULL DEFAULT 5,
    "max_failed_attempts" SMALLINT NOT NULL DEFAULT 5,
    "lockout_duration_mins" SMALLINT NOT NULL DEFAULT 30,
    "session_timeout_mins" SMALLINT NOT NULL DEFAULT 480,
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "password_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(255),
    "company_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "device_id" UUID,
    "geo_country" VARCHAR(100),
    "geo_city" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "ip_address" VARCHAR(45),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_parent_id_idx" ON "companies"("parent_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_company_id_key" ON "users"("email", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_fingerprint_user_id_key" ON "user_devices"("fingerprint", "user_id");

-- CreateIndex
CREATE INDEX "ip_policies_company_id_idx" ON "ip_policies"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_policies_company_id_key" ON "password_policies"("company_id");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auth_audit_logs_user_id_created_at_idx" ON "auth_audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auth_audit_logs_company_id_created_at_idx" ON "auth_audit_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auth_audit_logs_event_type_created_at_idx" ON "auth_audit_logs"("event_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_policies" ADD CONSTRAINT "ip_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_policies" ADD CONSTRAINT "ip_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_policies" ADD CONSTRAINT "ip_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_policies" ADD CONSTRAINT "password_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_logs" ADD CONSTRAINT "auth_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_logs" ADD CONSTRAINT "auth_audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
