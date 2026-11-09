/**
 * The audit log's two layers of protection and the backend's role (owner, step 16), on a real
 * database (`pnpm test:db`).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { grantAppRole } from './app-role.js';

let db: TestDatabase;
let app: pg.Client;
let owner: pg.Client;

beforeAll(async () => {
  db = await createTestDatabase();
  app = new pg.Client({ connectionString: db.url });
  owner = new pg.Client({ connectionString: db.ownerUrl });
  await Promise.all([app.connect(), owner.connect()]);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
  await db.drop();
});

const addEntry = (client: pg.Client) =>
  client.query(
    `INSERT INTO audit_log (action, target_type, target_id, after)
     VALUES ('departmentCreated', 'department', gen_random_uuid(), '{"nameEn":"Packing"}')`,
  );

/** The error message, or "" if the query worked. */
async function refusal(client: pg.Client, sql: string): Promise<string> {
  try {
    await client.query(sql);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('the audit log is append-only', () => {
  it('the backend role adds and reads rows', async () => {
    await addEntry(app);
    const { rows } = await app.query<{ n: string }>('SELECT count(*) AS n FROM audit_log');
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
  });

  it('layer 1: the backend role may not change, delete or empty it', async () => {
    expect(await refusal(app, `UPDATE audit_log SET after = '{}'`)).toMatch(/permission denied/);
    expect(await refusal(app, 'DELETE FROM audit_log')).toMatch(/permission denied/);
    expect(await refusal(app, 'TRUNCATE audit_log')).toMatch(/permission denied/);
  });

  it('layer 2: even the database owner is refused by the rule', async () => {
    await addEntry(owner);
    expect(await refusal(owner, `UPDATE audit_log SET after = '{}'`)).toMatch(
      /append-only: UPDATE is not allowed/,
    );
    expect(await refusal(owner, 'DELETE FROM audit_log')).toMatch(/append-only: DELETE/);
    expect(await refusal(owner, 'TRUNCATE audit_log')).toMatch(/append-only: TRUNCATE/);
    const { rows } = await owner.query<{ n: string }>('SELECT count(*) AS n FROM audit_log');
    expect(Number(rows[0]?.n)).toBe(2);
  });
});

describe("the backend's role", () => {
  it("reads and changes the app's tables", async () => {
    await app.query(
      `INSERT INTO users (email, password_hash, role) VALUES ('role@test.sy', 'x', 'customer')`,
    );
    await app.query(`UPDATE users SET locale = 'ar' WHERE email = 'role@test.sy'`);
    await app.query(`DELETE FROM users WHERE email = 'role@test.sy'`);
    const { rows } = await app.query<{ n: string }>('SELECT count(*) AS n FROM departments');
    expect(Number(rows[0]?.n)).toBe(3);
  });

  it('has no other powers: no migrations table, no new tables, no new roles', async () => {
    expect(await refusal(app, 'SELECT * FROM _prisma_migrations')).toMatch(/permission denied/);
    expect(await refusal(app, 'CREATE TABLE sneaky (id int)')).toMatch(/permission denied/);
    expect(await refusal(app, 'CREATE ROLE sneaky')).toMatch(/permission denied/);
    const { rows } = await owner.query<{ rolsuper: boolean }>(
      'SELECT rolsuper FROM pg_roles WHERE rolname = $1',
      [db.role],
    );
    expect(rows[0]?.rolsuper).toBe(false);
  });

  it('can be granted again (after a new migration), and takes the new password', async () => {
    const password = 'a-new-password-for-the-test';
    await grantAppRole(owner, { name: db.role, password });
    const fresh = new pg.Client({
      connectionString: db.url.replace(/:[^:@]+@/, `:${password}@`),
    });
    await fresh.connect();
    await addEntry(fresh);
    expect(await refusal(fresh, 'DELETE FROM audit_log')).toMatch(/permission denied/);
    await fresh.end();
  });

  it('refuses a role name that would need quoting', async () => {
    await expect(
      grantAppRole(owner, { name: 'Bad"Name', password: 'x'.repeat(12) }),
    ).rejects.toThrow(/lower-case letters/);
  });
});

describe('disabled accounts', () => {
  it('only staff accounts can be disabled', async () => {
    expect(
      await refusal(
        app,
        `INSERT INTO users (email, password_hash, role, disabled_at) VALUES ('c@test.sy', 'x', 'customer', now())`,
      ),
    ).toMatch(/users_disabled_staff_only/);
    await app.query(
      `INSERT INTO users (email, password_hash, role, disabled_at) VALUES ('m@test.sy', 'x', 'manager', now())`,
    );
  });
});
