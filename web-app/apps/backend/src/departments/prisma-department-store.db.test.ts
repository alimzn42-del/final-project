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

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = new PrismaService(db.url);
  departments = new PrismaDepartmentStore(prisma);
  users = new PrismaUserStore(prisma);
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
    const p = await departments.create({ nameEn: 'Packaging', nameAr: 'التغليف' });
    expect(await departments.findById(p.id)).toEqual(p);
    expect((await departments.rename(p.id, { nameAr: 'قسم التغليف' })).nameAr).toBe('قسم التغليف');
    await expect(departments.create({ nameEn: 'Packaging', nameAr: 'آخر' })).rejects.toThrow(
      DepartmentNameTakenError,
    );
    await expect(departments.rename(p.id, { nameAr: 'الجودة' })).rejects.toMatchObject({
      field: 'nameAr',
    });
  });

  it('refuses to delete a department with workers, giving the count', async () => {
    const quality = await idOf('Quality');
    for (const email of ['a@lab.sy', 'b@lab.sy', 'c@lab.sy']) {
      await users.create({
        email,
        passwordHash: 'x',
        role: 'worker',
        locale: 'en',
        departmentId: quality,
      });
    }
    await expect(departments.delete(quality)).rejects.toThrow(
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
      users.create({
        email: 'ghost@lab.sy',
        passwordHash: 'x',
        role: 'worker',
        locale: 'en',
        departmentId: '0b5e2c1a-8f4d-4c3b-9a2e-7d6f5e4c3b2a',
      }),
    ).rejects.toThrow(DepartmentNotFoundError);
  });

  it('deletes an empty department; deleted ones are not recreated', async () => {
    const maintenance = await idOf('Maintenance');
    await departments.delete(maintenance);
    expect(await departments.findById(maintenance)).toBeUndefined();
    await expect(departments.delete(maintenance)).rejects.toThrow(DepartmentNotFoundError);
    await expect(departments.delete('not-an-id')).rejects.toThrow(DepartmentNotFoundError);
  });
});
