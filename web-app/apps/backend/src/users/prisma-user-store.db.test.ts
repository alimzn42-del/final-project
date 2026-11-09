/**
 * The real database (run with `pnpm test:db` after `pnpm infra:up`): the
 * Prisma user store, the database rules, and the whole app wired to it.
 */
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
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

/** The id of a starting department (inserted by the migration). */
async function departmentId(nameEn: string): Promise<string> {
  const row = await prisma.department.findUnique({ where: { nameEn } });
  if (!row) throw new Error(`no department ${nameEn}`);
  return row.id;
}

describe('PrismaUserStore on the real database', () => {
  it('creates and finds a customer with the full sign-up profile', async () => {
    const created = await store.create(
      {
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
      },
      { action: 'accountCreated', actorId: null },
    );
    expect(await store.findByEmail('rana@example.com')).toEqual(created);
    expect(await store.findById(created.id)).toEqual(created);

    const [row] = await prisma.$queryRaw<{ dob: string; governorate: string }[]>`
      SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob, governorate::text AS governorate
      FROM users WHERE id = ${created.id}::uuid`;
    expect(row).toEqual({ dob: '1995-04-12', governorate: 'outside' });
  });

  it('reports a duplicate email as EmailTakenError', async () => {
    await expect(
      store.create(
        { ...base, email: 'rana@example.com', role: 'customer' },
        { action: 'accountCreated', actorId: null },
      ),
    ).rejects.toThrow(EmailTakenError);
  });

  it('the database itself refuses an email with capitals', async () => {
    await expect(
      store.create(
        { ...base, email: 'Upper@Example.com', role: 'customer' },
        { action: 'accountCreated', actorId: null },
      ),
    ).rejects.toThrow(/users_email_lowercase/);
  });

  it('counts by role, remembers the language, links the creator', async () => {
    const boss = await store.create(
      { ...base, email: 'boss@lab.sy', role: 'manager' },
      { action: 'accountCreated', actorId: null },
    );
    const worker = await store.create(
      {
        ...base,
        email: 'sami@lab.sy',
        role: 'worker',
        departmentId: await departmentId('Production'),
        mustChangePassword: true,
        createdById: boss.id,
      },
      { action: 'accountCreated', actorId: null },
    );
    expect(await store.countByRole('manager')).toBe(1);
    expect((await store.setPreferences(worker.id, { locale: 'ar' })).locale).toBe('ar');
    const dark = await store.setPreferences(worker.id, { theme: 'dark' });
    expect([dark.locale, dark.theme]).toEqual(['ar', 'dark']); // the language is kept
    expect((await store.setPreferences(worker.id, { theme: null })).theme).toBeNull();
    const [row] = await prisma.$queryRaw<{ created_by: string }[]>`
      SELECT created_by::text FROM users WHERE id = ${worker.id}::uuid`;
    expect(row?.created_by).toBe(boss.id);
  });

  it('stores the department and the temporary-password flag; setPassword clears it', async () => {
    const sami = await store.findByEmail('sami@lab.sy');
    expect(sami).toMatchObject({
      departmentId: await departmentId('Production'),
      mustChangePassword: true,
    });
    const changed = await store.setPassword(sami?.id ?? '', 'new-hash');
    expect(changed).toMatchObject({ passwordHash: 'new-hash', mustChangePassword: false });
  });

  it('the database itself refuses a worker without a department, and a manager with one', async () => {
    await expect(
      store.create(
        { ...base, email: 'w2@lab.sy', role: 'worker' },
        { action: 'accountCreated', actorId: null },
      ),
    ).rejects.toThrow(/users_department_only_for_workers/);
    await expect(
      store.create(
        {
          ...base,
          email: 'm2@lab.sy',
          role: 'manager',
          departmentId: await departmentId('Quality'),
        },
        { action: 'accountCreated', actorId: null },
      ),
    ).rejects.toThrow(/users_department_only_for_workers/);
  });

  it('treats a malformed id as "no user" instead of a database error', async () => {
    expect(await store.findById('not-a-uuid')).toBeUndefined();
  });
});

describe('the whole app on the real database', () => {
  let app: INestApplication;
  let api: string;
  // Its own empty database, so no manager exists yet. (Accounts the audit log names cannot be
  // deleted any more, step 16, so the shared database cannot be emptied first.)
  let appDb: TestDatabase;
  let appPrisma: PrismaService;

  beforeAll(async () => {
    appDb = await createTestDatabase('app');
    appPrisma = new PrismaService(appDb.url);
    ({ app } = await createApp({ ...TEST_ENV, DATABASE_URL: appDb.url }, { logs: false }));
    await app.listen(0, '127.0.0.1');
    api = `${await app.getUrl()}/api`;
  });

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await appDb.drop();
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
    const row = await appPrisma.user.findUnique({ where: { email: TEST_ENV.MANAGER_EMAIL } });
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
    const row = await appPrisma.user.findUnique({ where: { email: 'nour@example.com' } });
    expect(row?.role).toBe('customer');
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe('staff actions on the real database (owner, step 16)', () => {
  /** A staff account straight in the store; `managerOf` = who created it. */
  async function staffRow(role: 'manager' | 'worker') {
    const email = `${role}-${String(Math.random()).slice(2, 10)}@lab.sy`;
    return store.create(
      {
        ...base,
        email,
        role,
        fullName: `A ${role}`,
        departmentId: role === 'worker' ? await departmentId('Production') : undefined,
      },
      { action: 'accountCreated', actorId: null },
    );
  }

  it('two managers disabling each other at the same moment: only one succeeds', async () => {
    // Only these two managers are active, so both changes together would leave none.
    await prisma.user.updateMany({ where: { role: 'manager' }, data: { disabledAt: new Date() } });
    const a = await staffRow('manager');
    const b = await staffRow('manager');
    const results = await Promise.allSettled([
      store.setDisabled(a.id, b.id, true),
      store.setDisabled(b.id, a.id, true),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const active = await prisma.user.count({ where: { role: 'manager', disabledAt: null } });
    expect(active).toBe(1);
    const disabledEntries = await prisma.auditEntry.count({
      where: { action: 'accountDisabled', targetId: { in: [a.id, b.id] } },
    });
    expect(disabledEntries).toBe(1);
  });

  it('no audit entry, no change: the change is undone when the entry cannot be written', async () => {
    const actor = await staffRow('manager');
    const worker = await staffRow('worker');
    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    try {
      await owner.query(`REVOKE INSERT ON audit_log FROM ${db.role}`);
      await expect(store.setDisabled(actor.id, worker.id, true)).rejects.toThrow(
        /permission denied/,
      );
      expect((await store.findById(worker.id))?.disabledAt).toBeNull();
    } finally {
      await owner.query(`GRANT INSERT ON audit_log TO ${db.role}`);
      await owner.end();
    }
    await store.setDisabled(actor.id, worker.id, true);
    expect((await store.findById(worker.id))?.disabledAt).toBeInstanceOf(Date);
  });

  it('records each action with who, on whom, before and after; never a password', async () => {
    const actor = await staffRow('manager');
    const worker = await staffRow('worker');
    const quality = await departmentId('Quality');
    await store.setDepartment(actor.id, worker.id, quality);
    await store.issueTemporaryPassword(actor.id, worker.id, '$argon2id$hash-of-a-secret');
    await store.setDisabled(actor.id, worker.id, true);
    await store.setDisabled(actor.id, worker.id, false);
    const rows = await prisma.auditEntry.findMany({
      where: { targetId: worker.id },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => [r.action, r.actorId])).toEqual([
      ['accountCreated', null],
      ['departmentChanged', actor.id],
      ['temporaryPasswordIssued', actor.id],
      ['accountDisabled', actor.id],
      ['accountEnabled', actor.id],
    ]);
    expect(rows[1]?.after).toEqual({ departmentId: quality, departmentName: 'Quality' });
    const text = JSON.stringify(rows.map((r) => [r.before, r.after]));
    expect(text).not.toContain('argon2');
  });

  it('lists staff only, managers first; refuses customers as targets', async () => {
    const actor = await staffRow('manager');
    const customer = await store.create(
      { ...base, email: `c-${String(Math.random()).slice(2, 8)}@example.com`, role: 'customer' },
      { action: 'signedUp' },
    );
    const list = await store.listStaff();
    expect(list.some((u) => u.id === customer.id)).toBe(false);
    expect(list[0]?.role).toBe('manager');
    await expect(store.setDisabled(actor.id, customer.id, true)).rejects.toThrow(
      /no staff account/,
    );
  });
});
