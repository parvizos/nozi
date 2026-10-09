-- Phase 7 identity, transactional outbox, notifications and worker health.
CREATE TYPE "OtpPurpose" AS ENUM ('AUTH', 'COURIER_ACTIVATION', 'ACCOUNT_RECOVERY');
CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'BLOCKED', 'SUPERSEDED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'IN_APP', 'WHATSAPP', 'TELEGRAM');

ALTER TABLE "users"
  ADD COLUMN "phone_number_verified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "phone_number_verified" = true
WHERE "phone_verified_at" IS NOT NULL;

CREATE TABLE "otp_challenges" (
  "id" UUID NOT NULL,
  "phone_e164" VARCHAR(20) NOT NULL,
  "purpose" "OtpPurpose" NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "encrypted_code" TEXT NOT NULL,
  "status" "OtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "resend_available_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "request_ip_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "otp_challenges_attempt_count_check" CHECK ("attempt_count" >= 0 AND "attempt_count" <= "max_attempts"),
  CONSTRAINT "otp_challenges_max_attempts_check" CHECK ("max_attempts" > 0)
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(3),
  "locked_by" VARCHAR(120),
  "processed_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(500),
  "dedupe_key" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "outbox_events_max_attempts_check" CHECK ("max_attempts" > 0)
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "resource_type" VARCHAR(80),
  "resource_id" VARCHAR(100),
  "dedupe_key" VARCHAR(200) NOT NULL,
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_delivery_attempts" (
  "id" UUID NOT NULL,
  "outbox_event_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "provider" VARCHAR(60) NOT NULL,
  "recipient_hash" CHAR(64),
  "attempt_number" INTEGER NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "provider_message_id" VARCHAR(160),
  "error_safe" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_delivery_attempts_attempt_number_check" CHECK ("attempt_number" > 0)
);

CREATE TABLE "worker_heartbeats" (
  "worker_id" VARCHAR(120) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("worker_id")
);

CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE UNIQUE INDEX "notification_delivery_attempts_outbox_channel_recipient_attempt_key"
  ON "notification_delivery_attempts"("outbox_event_id", "channel", "recipient_hash", "attempt_number");
CREATE INDEX "otp_challenges_phone_purpose_status_created_idx"
  ON "otp_challenges"("phone_e164", "purpose", "status", "created_at" DESC);
CREATE INDEX "otp_challenges_status_expires_idx" ON "otp_challenges"("status", "expires_at");
CREATE INDEX "outbox_events_status_available_created_idx"
  ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_aggregate_created_idx"
  ON "outbox_events"("aggregate_type", "aggregate_id", "created_at");
CREATE INDEX "notifications_user_read_created_idx"
  ON "notifications"("user_id", "read_at", "created_at" DESC);
CREATE INDEX "notification_delivery_attempts_event_created_idx"
  ON "notification_delivery_attempts"("outbox_event_id", "created_at");
CREATE INDEX "worker_heartbeats_last_seen_idx" ON "worker_heartbeats"("last_seen_at");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts"
  ADD CONSTRAINT "notification_delivery_attempts_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
