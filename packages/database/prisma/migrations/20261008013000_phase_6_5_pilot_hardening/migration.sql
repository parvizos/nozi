-- Phase 6.5 adds only forward-compatible values and tables. The published
-- Phase 6 migration remains immutable because it deploys cleanly on PostgreSQL 17.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNING_TO_STORE';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_STORE';
ALTER TYPE "CourierAssignmentStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "CourierAssignmentStatus" ADD VALUE IF NOT EXISTS 'RETURNING_TO_STORE';
ALTER TYPE "CourierAssignmentStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_STORE';
ALTER TYPE "DeliveryFailureReason" ADD VALUE IF NOT EXISTS 'ACCESS_PROBLEM';

DROP INDEX IF EXISTS "courier_assignments_one_active_order";
CREATE UNIQUE INDEX "courier_assignments_one_active_order"
ON "courier_assignments"("order_id")
WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERY_FAILED', 'RETURNING_TO_STORE');

UPDATE "inventory_reservations"
SET "expires_at" = CASE
  WHEN "status" = 'ACTIVE' THEN "created_at" + INTERVAL '15 minutes'
  ELSE "updated_at"
END
WHERE "expires_at" IS NULL;

ALTER TABLE "inventory_reservations"
ALTER COLUMN "expires_at" SET NOT NULL;

DROP INDEX IF EXISTS "ledger_accounts_owner_type_owner_id_account_type_currency_c_idx";

-- Earlier releases only indexed the natural account key. In the unlikely
-- event that concurrent writers created duplicates, preserve every entry by
-- pointing it at the oldest canonical account before enforcing uniqueness.
WITH ranked_accounts AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "owner_type", "owner_id", "account_type", "currency_code"
      ORDER BY "created_at", "id"
    ) AS "canonical_id"
  FROM "ledger_accounts"
)
UPDATE "ledger_entries" AS entries
SET "ledger_account_id" = ranked."canonical_id"
FROM ranked_accounts AS ranked
WHERE entries."ledger_account_id" = ranked."id"
  AND ranked."id" <> ranked."canonical_id";

WITH ranked_accounts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "owner_type", "owner_id", "account_type", "currency_code"
      ORDER BY "created_at", "id"
    ) AS "position"
  FROM "ledger_accounts"
)
DELETE FROM "ledger_accounts" AS accounts
USING ranked_accounts AS ranked
WHERE accounts."id" = ranked."id"
  AND ranked."position" > 1;

CREATE UNIQUE INDEX "ledger_accounts_owner_type_owner_id_account_type_currency_code_key"
ON "ledger_accounts" ("owner_type", "owner_id", "account_type", "currency_code")
NULLS NOT DISTINCT;

CREATE TABLE "courier_invitations" (
  "id" UUID NOT NULL,
  "courier_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "invalidated_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "courier_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courier_invitations_token_hash_key" ON "courier_invitations"("token_hash");
CREATE INDEX "courier_invitations_courier_id_created_at_idx" ON "courier_invitations"("courier_id", "created_at" DESC);
CREATE INDEX "courier_invitations_expires_at_idx" ON "courier_invitations"("expires_at");

CREATE TABLE "delivery_proofs" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "nonce" VARCHAR(64) NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "verified_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_proofs_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX "delivery_proofs_order_id_key" ON "delivery_proofs"("order_id");
CREATE INDEX "delivery_proofs_expires_at_idx" ON "delivery_proofs"("expires_at");

CREATE TABLE "commission_rate_history" (
  "id" UUID NOT NULL,
  "seller_id" UUID NOT NULL,
  "old_rate" DECIMAL(5,2) NOT NULL,
  "new_rate" DECIMAL(5,2) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "changed_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_rate_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_rate_history_rates_check" CHECK ("old_rate" BETWEEN 0 AND 100 AND "new_rate" BETWEEN 0 AND 100)
);

CREATE INDEX "commission_rate_history_seller_id_created_at_idx" ON "commission_rate_history"("seller_id", "created_at" DESC);

CREATE TABLE "courier_cash_settlements" (
  "id" UUID NOT NULL,
  "courier_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "reference" VARCHAR(160),
  "reason" VARCHAR(500) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "courier_cash_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "courier_cash_settlements_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "courier_cash_settlements_idempotency_key_key" ON "courier_cash_settlements"("idempotency_key");
CREATE INDEX "courier_cash_settlements_courier_id_created_at_idx" ON "courier_cash_settlements"("courier_id", "created_at" DESC);

ALTER TABLE "courier_invitations" ADD CONSTRAINT "courier_invitations_courier_id_fkey"
FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_invitations" ADD CONSTRAINT "courier_invitations_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rate_history" ADD CONSTRAINT "commission_rate_history_seller_id_fkey"
FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rate_history" ADD CONSTRAINT "commission_rate_history_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_cash_settlements" ADD CONSTRAINT "courier_cash_settlements_courier_id_fkey"
FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_cash_settlements" ADD CONSTRAINT "courier_cash_settlements_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
