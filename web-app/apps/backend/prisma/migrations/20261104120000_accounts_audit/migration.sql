-- Step 16 (owner): disabled staff accounts, and the append-only audit log.

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('accountCreated', 'signedUp', 'temporaryPasswordIssued', 'passwordChanged', 'accountDisabled', 'accountEnabled', 'departmentChanged', 'departmentCreated', 'departmentRenamed', 'departmentDeleted');

-- CreateEnum
CREATE TYPE "AuditTarget" AS ENUM ('user', 'department');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled_at" TIMESTAMPTZ(3);

-- Only staff accounts are ever disabled (customers get their own section later).
ALTER TABLE "users" ADD CONSTRAINT "users_disabled_staff_only"
  CHECK ("disabled_at" IS NULL OR "role" IN ('manager', 'worker'));

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" "AuditAction" NOT NULL,
    "target_type" "AuditTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_at_idx" ON "audit_log"("target_type", "target_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only, second layer (owner, step 16). The first layer is the backend's own database
-- role, which may only INSERT and SELECT on this table (src/database/app-role.ts). This trigger
-- also refuses changes from roles that do have the privilege, such as the database owner that
-- runs the migrations. It is not absolute: a full database administrator can drop or disable the
-- trigger (docs/04-architecture.md, "Audit log").
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
