/**
 * The real database (run with `pnpm test:db` after `pnpm infra:up`): one
 * session row per login, deleted on logout, on a password change (the others),
 * when expired, and with its user.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { PrismaUserStore } from '../users/prisma-user-store.js';
import { PrismaSessionStore } from './prisma-session-store.js';

let db: TestDatabase;
let prisma: PrismaService;
let sessions: PrismaSessionStore;
let users: PrismaUserStore;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = new PrismaService(db.url);
  sessions = new PrismaSessionStore(prisma);
  users = new PrismaUserStore(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await db.drop();
});

let n = 0;
const newUser = async () => {
  n++;
  return users.create({
    email: `user${String(n)}@lab.sy`,
    passwordHash: 'not used',
    role: 'manager',
    locale: 'en',
  });
};
const inAnHour = () => new Date(Date.now() + 3_600_000);

describe('PrismaSessionStore on the real database', () => {
  it('creates, finds and deletes one session', async () => {
    const u = await newUser();
    const s = await sessions.create(u.id, inAnHour());
    expect(await sessions.find(s.id)).toEqual(s);
    expect(await sessions.delete(s.id)).toBe(true);
    expect(await sessions.find(s.id)).toBeUndefined();
    expect(await sessions.delete(s.id)).toBe(false);
  });

  it('answers "not found" for ids that are not UUIDs', async () => {
    expect(await sessions.find('not-a-uuid')).toBeUndefined();
    expect(await sessions.delete('not-a-uuid')).toBe(false);
  });

  it('deletes the user’s other sessions only, and returns their ids', async () => {
    const u = await newUser();
    const someoneElse = await newUser();
    const keep = await sessions.create(u.id, inAnHour());
    const a = await sessions.create(u.id, inAnHour());
    const b = await sessions.create(u.id, inAnHour());
    const theirs = await sessions.create(someoneElse.id, inAnHour());

    expect((await sessions.deleteOthers(u.id, keep.id)).sort()).toEqual([a.id, b.id].sort());
    expect(await sessions.find(keep.id)).toBeDefined();
    expect(await sessions.find(a.id)).toBeUndefined();
    expect(await sessions.find(theirs.id)).toBeDefined();
  });

  it('deletes expired sessions', async () => {
    const u = await newUser();
    const old = await sessions.create(u.id, new Date(Date.now() - 1000));
    const current = await sessions.create(u.id, inAnHour());
    await sessions.deleteExpired(new Date());
    expect(await sessions.find(old.id)).toBeUndefined();
    expect(await sessions.find(current.id)).toBeDefined();
  });

  it('a deleted user takes its sessions along (ON DELETE CASCADE)', async () => {
    const u = await newUser();
    const s = await sessions.create(u.id, inAnHour());
    await prisma.user.delete({ where: { id: u.id } });
    expect(await sessions.find(s.id)).toBeUndefined();
  });
});
