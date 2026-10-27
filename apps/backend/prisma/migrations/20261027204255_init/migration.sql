-- CreateEnum
CREATE TYPE "Role" AS ENUM ('manager', 'worker', 'customer');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'ar');

-- CreateEnum
CREATE TYPE "Governorate" AS ENUM ('damascus', 'rifDimashq', 'aleppo', 'homs', 'hama', 'latakia', 'tartus', 'idlib', 'daraa', 'asSuwayda', 'quneitra', 'deirEzZor', 'raqqa', 'hasakah', 'outside');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('sim', 'hw');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "full_name" TEXT,
    "mobile" TEXT,
    "date_of_birth" DATE,
    "governorate" "Governorate",
    "country" TEXT,
    "city_area" TEXT,
    "occupation" TEXT,
    "paint_purpose" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "device_ts" TIMESTAMPTZ(3) NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "Source" NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "telemetry_sensor_time_idx" ON "telemetry"("sensor_id", "received_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
