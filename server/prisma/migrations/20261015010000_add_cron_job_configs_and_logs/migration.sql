-- CreateTable (Idempotent)
CREATE TABLE IF NOT EXISTS "cron_job_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "cron_expression" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'Asia/Yangon',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ,
    "last_status" VARCHAR(30),
    "last_duration_ms" INTEGER,
    "last_error" TEXT,
    "updated_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_job_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Idempotent)
CREATE TABLE IF NOT EXISTS "cron_job_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_key" VARCHAR(100) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "duration_ms" INTEGER,
    "status" VARCHAR(30) NOT NULL,
    "triggered_by" VARCHAR(100) NOT NULL DEFAULT 'cron',
    "message" TEXT,
    "error" TEXT,

    CONSTRAINT "cron_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (Idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "cron_job_configs_job_key_key" ON "cron_job_configs"("job_key");

-- CreateIndex (Idempotent)
CREATE INDEX IF NOT EXISTS "cron_job_logs_job_key_started_at_idx" ON "cron_job_logs"("job_key", "started_at" DESC);
