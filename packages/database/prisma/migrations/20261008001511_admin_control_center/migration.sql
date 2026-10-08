-- CreateEnum
CREATE TYPE "CourierStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CourierAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone_e164" VARCHAR(20) NOT NULL,
    "status" "CourierStatus" NOT NULL DEFAULT 'OFFLINE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "transport_type" VARCHAR(50),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location_updated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_assignments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "courier_id" UUID NOT NULL,
    "assigned_by_admin_user_id" UUID NOT NULL,
    "status" "CourierAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courier_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "order_id" UUID,
    "seller_id" UUID,
    "customer_user_id" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "couriers_user_id_key" ON "couriers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "couriers_phone_e164_key" ON "couriers"("phone_e164");

-- CreateIndex
CREATE INDEX "couriers_status_is_active_idx" ON "couriers"("status", "is_active");

-- CreateIndex
CREATE INDEX "courier_assignments_order_id_status_idx" ON "courier_assignments"("order_id", "status");

-- CreateIndex
CREATE INDEX "courier_assignments_courier_id_status_assigned_at_idx" ON "courier_assignments"("courier_id", "status", "assigned_at" DESC);

-- One non-terminal assignment per order protects concurrent assignment/reassignment.
CREATE UNIQUE INDEX "courier_assignments_one_active_per_order"
ON "courier_assignments"("order_id")
WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'PICKED_UP');

-- CreateIndex
CREATE INDEX "admin_notes_order_id_created_at_idx" ON "admin_notes"("order_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_notes_seller_id_created_at_idx" ON "admin_notes"("seller_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_notes_customer_user_id_created_at_idx" ON "admin_notes"("customer_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_assignments" ADD CONSTRAINT "courier_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_assignments" ADD CONSTRAINT "courier_assignments_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_assignments" ADD CONSTRAINT "courier_assignments_assigned_by_admin_user_id_fkey" FOREIGN KEY ("assigned_by_admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_exactly_one_subject_check"
CHECK (num_nonnulls("order_id", "seller_id", "customer_user_id") = 1);
