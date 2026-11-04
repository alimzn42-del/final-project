/**
 * The automated checks' own account (owner, step 16): `pnpm live:check`, `telemetry:check` and
 * `web:check` log in with it, never with a person's account.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { AuthService, CHECK_ACCOUNT_NAME } from './auth.service.js';

const CHECK = { email: 'checks@mixline.local', password: 'checks-pass-123' };

describe('the checks account (owner, step 16)', () => {
  let t: TestApp;
  let auth: AuthService;
  let manager: string;

  beforeAll(async () => {
    t = await startTestApp({
      env: { ...TEST_ENV, CHECK_EMAIL: CHECK.email, CHECK_PASSWORD: CHECK.password },
    });
    auth = t.app.get(AuthService);
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
  });

  afterAll(async () => {
    await t.close();
  });

  const row = () => [...t.store.rows.values()].find((u) => u.email === CHECK.email);

  it('is created at start: a worker in the first department, made by the system', () => {
    expect(row()).toMatchObject({
      role: 'worker',
      fullName: CHECK_ACCOUNT_NAME,
      departmentId: t.departments.idOf('Maintenance'),
      mustChangePassword: false,
      createdById: null,
    });
    expect(t.audit.about(row()?.id ?? '')[0]).toMatchObject({
      action: 'accountCreated',
      actorId: null,
    });
  });

  it('can read the line like a worker, but not manage accounts', async () => {
    const cookie = await t.login(CHECK.email, CHECK.password);
    expect((await t.call('GET', '/state', undefined, cookie)).status).toBe(200);
    expect((await t.call('GET', '/users', undefined, cookie)).status).toBe(403);
  });

  it('follows CHECK_PASSWORD: a new value replaces the password, recorded with no actor', async () => {
    expect(await auth.seedCheckAccount(CHECK)).toBe('ok');
    const next = { ...CHECK, password: 'checks-pass-456' };
    expect(await auth.seedCheckAccount(next)).toBe('updated');
    expect((await t.call('POST', '/auth/login', CHECK)).status).toBe(401);
    expect((await t.call('POST', '/auth/login', next)).status).toBe(200);
    expect(t.audit.about(row()?.id ?? '').at(-1)).toMatchObject({
      action: 'passwordChanged',
      actorId: null,
    });
    await auth.seedCheckAccount(CHECK);
  });

  it('stays disabled when a manager disabled it', async () => {
    const id = row()?.id ?? '';
    expect((await t.call('POST', `/users/${id}/disable`, undefined, manager)).status).toBe(200);
    expect(await auth.seedCheckAccount(CHECK)).toBe('disabled');
    expect(row()?.disabledAt).not.toBeNull();
    await t.call('POST', `/users/${id}/enable`, undefined, manager);
  });

  it("never touches an account it did not create (a manager's, or one a manager made)", async () => {
    expect(
      await auth.seedCheckAccount({ email: TEST_ENV.MANAGER_EMAIL, password: 'whatever-123' }),
    ).toBe('refused');
    const made = await t.call(
      'POST',
      '/users',
      {
        fullName: 'Real worker',
        email: 'real@lab.sy',
        password: 'temporary-1',
        role: 'worker',
        departmentId: t.departments.idOf('Production'),
      },
      manager,
    );
    expect(made.status).toBe(201);
    expect(await auth.seedCheckAccount({ email: 'real@lab.sy', password: 'other-pass-1' })).toBe(
      'refused',
    );
    expect(
      (await t.call('POST', '/auth/login', { email: 'real@lab.sy', password: 'temporary-1' }))
        .status,
    ).toBe(200);
  });

  it('needs CHECK_EMAIL and CHECK_PASSWORD together', () => {
    expect(() => loadConfig({ ...TEST_ENV, CHECK_EMAIL: CHECK.email })).toThrow(/CHECK_PASSWORD/);
    expect(loadConfig(TEST_ENV).checkAccount).toBeUndefined();
  });
});
