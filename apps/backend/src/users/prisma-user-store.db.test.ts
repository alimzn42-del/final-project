/**
 * The real database (run with `pnpm test:db` after `pnpm infra:up`): the
 * Prisma user store, the database rules, and the whole app wired to it.
 */
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { PrismaService } from '../database/prisma.service.js';
import { TEST_ENV } from '../testing/http.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { PrismaUserStore } from './prisma-user-store.js';
import { EmailTakenError } from './user-store.js';

let db: TestDatabase;
let prisma: PrismaService;
let store: PrismaUserStore;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = new PrismaService(db.url);
  store = new PrismaUserStore(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await db.drop();
});

const base = { passwordHash: 'x', locale: 'en' as const };

describe('PrismaUserStore on the real database', () => {
  it('creates and finds a customer with the full sign-up profile', async () => {
    const created = await store.create({
      ...base,
      email: 'rana@example.com',
      role: 'customer',
      fullName: 'Rana Haddad',
      mobile: '+963912345678',
      dateOfBirth: '1995-04-12',
      governorate: 'outside',
      country: 'Lebanon',
      cityArea: 'Beirut',
      paintPurpose: 'café walls',
    });
    expect(await store.findByEmail('rana@example.com')).toEqual(created);
    expect(await store.findById(created.id)).toEqual(created);

    const [row] = await prisma.$queryRaw<{ dob: string; governorate: string }[]>`
      SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob, governorate::text AS governorate
      FROM users WHERE id = ${created.id}::uuid`;
    expect(row).toEqual({ dob: '1995-04-12', governorate: 'outside' });
  });

  it('reports a duplicate email as EmailTakenError', async () => {
    await expect(
      store.create({ ...base, email: 'rana@example.com', role: 'customer' }),
    ).rejects.toThrow(EmailTakenError);
  });

  it('the database itself refuses an email with capitals', async () => {
    await expect(
      store.create({ ...base, email: 'Upper@Example.com', role: 'customer' }),
    ).rejects.toThrow(/users_email_lowercase/);
  });

  it('counts by role, remembers the language, links the creator', async () => {
    const boss = await store.create({ ...base, email: 'boss@lab.sy', role: 'manager' });
    const worker = await store.create({
      ...base,
      email: 'sami@lab.sy',
      role: 'worker',
      department: 'production',
      mustChangePassword: true,
      createdById: boss.id,
    });
    expect(await store.countByRole('manager')).toBe(1);
    expect((await store.setLocale(worker.id, 'ar')).locale).toBe('ar');
    const [row] = await prisma.$queryRaw<{ created_by: string }[]>`
      SELECT created_by::text FROM users WHERE id = ${worker.id}::uuid`;
    expect(row?.created_by).toBe(boss.id);
  });

  it('stores the department and the temporary-password flag; setPassword clears it', async () => {
    const sami = await store.findByEmail('sami@lab.sy');
    expect(sami).toMatchObject({ department: 'production', mustChangePassword: true });
    const changed = await store.setPassword(sami?.id ?? '', 'new-hash');
    expect(changed).toMatchObject({ passwordHash: 'new-hash', mustChangePassword: false });
  });

  it('the database itself refuses a worker without a department, and a manager with one', async () => {
    await expect(store.create({ ...base, email: 'w2@lab.sy', role: 'worker' })).rejects.toThrow(
      /users_department_only_for_workers/,
    );
    await expect(
      store.create({ ...base, email: 'm2@lab.sy', role: 'manager', department: 'quality' }),
    ).rejects.toThrow(/users_department_only_for_workers/);
  });

  it('treats a malformed id as "no user" instead of a database error', async () => {
    expect(await store.findById('not-a-uuid')).toBeUndefined();
  });
});

describe('the whole app on the real database', () => {
  let app: INestApplication;
  let api: string;

  beforeAll(async () => {
    await prisma.user.deleteMany();
    ({ app } = await createApp({ ...TEST_ENV, DATABASE_URL: db.url }, { logs: false }));
    await app.listen(0, '127.0.0.1');
    api = `${await app.getUrl()}/api`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds the first manager with a temporary password; after the change it can read the machine', async () => {
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: TEST_ENV.MANAGER_EMAIL, password: TEST_ENV.MANAGER_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await fetch(`${api}/machine`, { headers: { cookie } })).status).toBe(403);
    const changed = await fetch(`${api}/auth/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        currentPassword: TEST_ENV.MANAGER_PASSWORD,
        newPassword: 'boss-own-pass',
      }),
    });
    expect(changed.status).toBe(200);
    expect((await fetch(`${api}/machine`, { headers: { cookie } })).status).toBe(200);
    const row = await prisma.user.findUnique({ where: { email: TEST_ENV.MANAGER_EMAIL } });
    expect(row?.mustChangePassword).toBe(false);
  });

  it('signs up a customer into the users table, as a customer', async () => {
    const res = await fetch(`${api}/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'Nour@Example.com',
        password: 'long enough',
        fullName: 'Nour',
        mobile: '+963933333333',
        dateOfBirth: '2000-01-31',
        governorate: 'aleppo',
        cityArea: 'Aziziyeh',
        role: 'manager',
      }),
    });
    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: 'nour@example.com' } });
    expect(row?.role).toBe('customer');
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});
