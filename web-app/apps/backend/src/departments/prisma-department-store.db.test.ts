/**
 * The real database (run with `pnpm test:db` after `pnpm infra:up`): the
 * departments the migration inserts, and the delete protection, by the store
 * and by the foreign key itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { PrismaUserStore } from '../users/prisma-user-store.js';
import {
  DepartmentHasWorkersError,
  DepartmentNameTakenError,
  DepartmentNotFoundError,
} from './department-store.js';
import { PrismaDepartmentStore } from './prisma-department-store.js';

let db: TestDatabase;
let prisma: PrismaService;
let departments: PrismaDepartmentStore;
let users: PrismaUserStore;
/** The manager who makes the department changes (step 16: every change is recorded). */
let actor = '';

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = new PrismaService(db.url);
  departments = new PrismaDepartmentStore(prisma);
  users = new PrismaUserStore(prisma);
  actor = (
    await users.create(
      { email: 'boss@lab.sy', passwordHash: 'x', role: 'manager', locale: 'en' },
      { action: 'accountCreated', actorId: null },
    )
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await db.drop();
});

const idOf = async (nameEn: string) =>
  (await departments.list()).find((d) => d.nameEn === nameEn)?.id ?? '';

describe('PrismaDepartmentStore on the real database', () => {
  it('the migration inserted the three starting departments, once', async () => {
    expect((await departments.list()).map((d) => [d.nameEn, d.nameAr, d.workerCount])).toEqual([
      ['Maintenance', 'الصيانة', 0],
      ['Production', 'الإنتاج', 0],
      ['Quality', 'الجودة', 0],
    ]);
  });

  it('adds and renames; the database keeps names unique', async () => {
    const p = await departments.create({ nameEn: 'Packaging', nameAr: 'التغليف' }, actor);
    expect(await departments.findById(p.id)).toEqual(p);
    expect((await departments.rename(p.id, { nameAr: 'قسم التغليف' }, actor)).nameAr).toBe(
      'قسم التغليف',
    );
    await expect(departments.create({ nameEn: 'Packaging', nameAr: 'آخر' }, actor)).rejects.toThrow(
      DepartmentNameTakenError,
    );
    await expect(departments.rename(p.id, { nameAr: 'الجودة' }, actor)).rejects.toMatchObject({
      field: 'nameAr',
    });
  });

  it('refuses to delete a department with workers, giving the count', async () => {
    const quality = await idOf('Quality');
    for (const email of ['a@lab.sy', 'b@lab.sy', 'c@lab.sy']) {
      await users.create(
        {
          email,
          passwordHash: 'x',
          role: 'worker',
          locale: 'en',
          departmentId: quality,
        },
        { action: 'accountCreated', actorId: null },
      );
    }
    await expect(departments.delete(quality, actor)).rejects.toThrow(
      new DepartmentHasWorkersError(3).message,
    );
    expect((await departments.findById(quality))?.workerCount).toBe(3);
  });

  it('the foreign key refuses it too, even past the store (a worker added at the last moment)', async () => {
    const quality = await idOf('Quality');
    await expect(prisma.department.delete({ where: { id: quality } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('a worker cannot point at a missing department', async () => {
    await expect(
      users.create(
        {
          email: 'ghost@lab.sy',
          passwordHash: 'x',
          role: 'worker',
          locale: 'en',
          departmentId: '0b5e2c1a-8f4d-4c3b-9a2e-7d6f5e4c3b2a',
        },
        { action: 'accountCreated', actorId: null },
      ),
    ).rejects.toThrow(DepartmentNotFoundError);
  });

  it('deletes an empty department; deleted ones are not recreated', async () => {
    const maintenance = await idOf('Maintenance');
    await departments.delete(maintenance, actor);
    expect(await departments.findById(maintenance)).toBeUndefined();
    await expect(departments.delete(maintenance, actor)).rejects.toThrow(DepartmentNotFoundError);
    await expect(departments.delete('not-an-id', actor)).rejects.toThrow(DepartmentNotFoundError);
  });
});
