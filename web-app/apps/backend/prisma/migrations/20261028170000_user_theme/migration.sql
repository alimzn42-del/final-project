-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('dark', 'light');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme" "Theme";
