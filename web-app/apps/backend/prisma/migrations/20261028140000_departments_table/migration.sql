-- Departments move from config/departments.json into the database (owner, step 9):
-- managers add, rename and delete them; a department that still has workers
-- cannot be deleted (foreign key, ON DELETE RESTRICT).
-- The DDL is what `prisma migrate diff` generates; the order is changed so that
-- existing workers keep their department.

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_en_key" ON "departments"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_ar_key" ON "departments"("name_ar");

-- The starting departments. A migration runs once per database, so they are
-- inserted on first start only: deleting them later never brings them back.
INSERT INTO "departments" ("name_en", "name_ar") VALUES
  ('Maintenance', 'الصيانة'),
  ('Production', 'الإنتاج'),
  ('Quality', 'الجودة');

-- Move existing workers from the old text column to the new id.
ALTER TABLE "users" ADD COLUMN "department_id" UUID;
UPDATE "users" AS u SET "department_id" = d."id"
FROM "departments" AS d
WHERE lower(d."name_en") = u."department";

ALTER TABLE "users" DROP CONSTRAINT "users_department_only_for_workers";
ALTER TABLE "users" DROP COLUMN "department";

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A worker always has a department, and only workers have one.
ALTER TABLE "users" ADD CONSTRAINT "users_department_only_for_workers"
  CHECK (("role" = 'worker') = ("department_id" IS NOT NULL));
