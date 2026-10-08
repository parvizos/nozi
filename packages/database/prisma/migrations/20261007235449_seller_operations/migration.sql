-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "refunded_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "store_opening_hours" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" VARCHAR(5),
    "closes_at" VARCHAR(5),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_opening_hours_store_id_idx" ON "store_opening_hours"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_opening_hours_store_id_day_of_week_key" ON "store_opening_hours"("store_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "store_opening_hours" ADD CONSTRAINT "store_opening_hours_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
