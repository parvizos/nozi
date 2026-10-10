-- Phase 7.5 is forward-only: published migrations remain immutable.
CREATE TYPE "ProductRevisionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "ReturnedInventoryDecision" AS ENUM ('RESTOCK', 'WRITE_OFF');

-- Phase 6.5 introduced the canonical active-assignment index. The older
-- Phase 6 index overlaps it and must be removed without touching history.
DROP INDEX IF EXISTS "courier_assignments_one_active_per_order";

CREATE TABLE "product_revisions" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(220) NOT NULL,
  "description" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "compare_at_price" DECIMAL(12,2),
  "images" JSONB NOT NULL,
  "variants" JSONB NOT NULL,
  "status" "ProductRevisionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "rejection_reason" VARCHAR(500),
  "submitted_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(3),
  CONSTRAINT "product_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_revisions_price_check" CHECK ("price" >= 0 AND ("compare_at_price" IS NULL OR "compare_at_price" > "price"))
);

CREATE INDEX "product_revisions_product_id_status_submitted_at_idx"
ON "product_revisions"("product_id", "status", "submitted_at" DESC);
CREATE INDEX "product_revisions_status_submitted_at_idx"
ON "product_revisions"("status", "submitted_at");

ALTER TABLE "product_revisions"
ADD CONSTRAINT "product_revisions_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_revisions"
ADD CONSTRAINT "product_revisions_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_revisions"
ADD CONSTRAINT "product_revisions_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_revisions"
ADD CONSTRAINT "product_revisions_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "returned_inventory_dispositions" (
  "id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "decision" "ReturnedInventoryDecision",
  "reason" VARCHAR(500),
  "decided_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(3),
  CONSTRAINT "returned_inventory_dispositions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "returned_inventory_dispositions_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "returned_inventory_dispositions_decision_check" CHECK (("decision" IS NULL AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL) OR ("decision" IS NOT NULL AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "returned_inventory_dispositions_reservation_id_key"
ON "returned_inventory_dispositions"("reservation_id");
CREATE INDEX "returned_inventory_dispositions_order_id_decision_idx"
ON "returned_inventory_dispositions"("order_id", "decision");
CREATE INDEX "returned_inventory_dispositions_decision_created_at_idx"
ON "returned_inventory_dispositions"("decision", "created_at");

ALTER TABLE "returned_inventory_dispositions"
ADD CONSTRAINT "returned_inventory_dispositions_reservation_id_fkey"
FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "returned_inventory_dispositions"
ADD CONSTRAINT "returned_inventory_dispositions_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "returned_inventory_dispositions"
ADD CONSTRAINT "returned_inventory_dispositions_decided_by_user_id_fkey"
FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
