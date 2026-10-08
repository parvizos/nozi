-- CreateEnum
CREATE TYPE "DeliveryFailureReason" AS ENUM ('RECIPIENT_UNAVAILABLE', 'WRONG_ADDRESS', 'RECIPIENT_REFUSED', 'CANNOT_CONTACT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CourierAssignmentStatus" ADD VALUE 'ARRIVED_AT_STORE';
ALTER TYPE "CourierAssignmentStatus" ADD VALUE 'ON_THE_WAY';

-- Keep the Phase 5 concurrency invariant current as lifecycle states expand.
DROP INDEX "courier_assignments_one_active_per_order";
CREATE UNIQUE INDEX "courier_assignments_one_active_per_order"
ON "courier_assignments"("order_id")
WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'ON_THE_WAY');

-- AlterTable
ALTER TABLE "courier_assignments" ADD COLUMN     "arrived_at_store_at" TIMESTAMPTZ(3),
ADD COLUMN     "on_the_way_at" TIMESTAMPTZ(3),
ADD COLUMN     "requires_admin_attention" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "delivery_failures" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "reason" "DeliveryFailureReason" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_locations" (
    "id" UUID NOT NULL,
    "courier_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy" DECIMAL(8,2),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_failures_assignment_id_created_at_idx" ON "delivery_failures"("assignment_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "delivery_failures_resolved_at_created_at_idx" ON "delivery_failures"("resolved_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "courier_locations_courier_id_recorded_at_idx" ON "courier_locations"("courier_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "courier_locations_assignment_id_recorded_at_idx" ON "courier_locations"("assignment_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "delivery_failures" ADD CONSTRAINT "delivery_failures_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "courier_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_locations" ADD CONSTRAINT "courier_locations_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_locations" ADD CONSTRAINT "courier_locations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "courier_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
