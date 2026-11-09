/**
 * Staff account management over HTTP (owner, step 16): the list, a worker's department, a new
 * temporary password, disable and re-enable, the lockout rules and the audit log. Memory stores
 * (no Docker); the database versions of these rules are in prisma-user-store.db.test.ts.
 */
import { ACCOUNT_CODES, type StaffMember } from '@mixline/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { ActorNotActiveError } from './user-store.js';

describe('staff accounts over HTTP (owner, step 16)', () => {
  let t: TestApp;
  let manager: string;
  let managerId = '';

  /** A staff account that has already replaced its temporary password; returns its id and cookie. */
  async function staff(role: 'manager' | 'worker', password = 'own-pass-123') {
    const email = `${role}-${String(Math.random()).slice(2, 10)}@lab.sy`;
    const created = await t.call(
      'POST',
      '/users',
      {
        fullName: `A ${role}`,
        email,
        password: 'temporary-1',
        role,
        departmentId: role === 'worker' ? t.departments.idOf('Production') : undefined,
      },
      manager,
    );
    expect(created.status).toBe(201);
    const first = await t.login(email, 'temporary-1');
    const changed = await t.call(
      'POST',
      '/auth/change-password',
      { currentPassword: 'temporary-1', newPassword: password },
      first,
    );
    expect(changed.status).toBe(200);
    const id = (created.body as { id: string }).id;
    return { id, email, password, cookie: await t.login(email, password) };
  }

  const code = (body: unknown) => (body as { code?: string }).code;
  const entriesAbout = (id: string) => t.audit.about(id).map((e) => e.action);

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    managerId = ((await t.call('GET', '/auth/me', undefined, manager)).body as { id: string }).id;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('the staff list', () => {
    it('lists managers and workers only, managers first; managers only', async () => {
      const worker = await staff('worker');
      await t.call('POST', '/auth/signup', {
        email: 'client@example.com',
        password: 'long enough',
        fullName: 'Client',
        mobile: '+963911111111',
        dateOfBirth: '1990-01-01',
        governorate: 'homs',
        cityArea: 'Inshaat',
      });
      const r = await t.call('GET', '/users', undefined, manager);
      expect(r.status).toBe(200);
      const list = r.body as StaffMember[];
      expect(list.some((u) => u.email === 'client@example.com')).toBe(false);
      expect(list[0]?.role).toBe('manager');
      expect(list.find((u) => u.id === worker.id)).toMatchObject({
        role: 'worker',
        departmentId: t.departments.idOf('Production'),
        mustChangePassword: false,
        disabledAt: null,
      });
      expect(JSON.stringify(list)).not.toMatch(/passwordHash|password_hash/);
      expect((await t.call('GET', '/users', undefined, worker.cookie)).status).toBe(403);
      expect((await t.call('GET', '/users')).status).toBe(401);
    });
  });

  describe("a worker's department", () => {
    it('moves the worker, keeps their sessions, and records before and after', async () => {
      const worker = await staff('worker');
      const quality = t.departments.idOf('Quality');
      const r = await t.call(
        'PATCH',
        `/users/${worker.id}/department`,
        { departmentId: quality },
        manager,
      );
      expect(r.status).toBe(200);
      expect((r.body as StaffMember).departmentId).toBe(quality);
      // Owner, step 16: no session ends (doc 05: until department-based permissions arrive).
      expect((await t.call('GET', '/auth/me', undefined, worker.cookie)).status).toBe(200);
      expect(t.audit.about(worker.id).at(-1)).toEqual({
        actorId: managerId,
        action: 'departmentChanged',
        targetType: 'user',
        targetId: worker.id,
        before: { departmentId: t.departments.idOf('Production'), departmentName: 'Production' },
        after: { departmentId: quality, departmentName: 'Quality' },
      });
      // The same department again changes nothing and records nothing.
      const count = t.audit.entries.length;
      await t.call('PATCH', `/users/${worker.id}/department`, { departmentId: quality }, manager);
      expect(t.audit.entries.length).toBe(count);
    });

    it('refuses managers, customers, unknown accounts and unknown departments', async () => {
      const other = await staff('manager');
      const production = t.departments.idOf('Production');
      const onManager = await t.call(
        'PATCH',
        `/users/${other.id}/department`,
        { departmentId: production },
        manager,
      );
      expect(onManager.status).toBe(400);
      expect(code(onManager.body)).toBe(ACCOUNT_CODES.notAWorker);
      const unknown = '0b5e2c1a-8f4d-4c3b-9a2e-7d6f5e4c3b2a';
      expect(
        (
          await t.call(
            'PATCH',
            `/users/${unknown}/department`,
            { departmentId: production },
            manager,
          )
        ).status,
      ).toBe(404);
      const worker = await staff('worker');
      const noDept = await t.call(
        'PATCH',
        `/users/${worker.id}/department`,
        { departmentId: unknown },
        manager,
      );
      expect(noDept.status).toBe(400);
      expect(JSON.stringify(noDept.body)).toMatch(/unknown department/);
    });
  });

  describe('a new temporary password', () => {
    it('ends every session at once, forces a change at the next login, records no password', async () => {
      const worker = await staff('worker');
      const secondDevice = await t.login(worker.email, worker.password);
      const r = await t.call(
        'POST',
        `/users/${worker.id}/temporary-password`,
        { password: 'new-temp-pass-1' },
        manager,
      );
      expect(r.status).toBe(200);
      expect((r.body as StaffMember).mustChangePassword).toBe(true);
      expect((await t.call('GET', '/auth/me', undefined, worker.cookie)).status).toBe(401);
      expect((await t.call('GET', '/auth/me', undefined, secondDevice)).status).toBe(401);
      expect(
        (await t.call('POST', '/auth/login', { email: worker.email, password: worker.password }))
          .status,
      ).toBe(401);
      const again = await t.login(worker.email, 'new-temp-pass-1');
      expect((await t.call('GET', '/users', undefined, again)).body).toMatchObject({
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      const entry = t.audit.about(worker.id).at(-1);
      expect(entry).toMatchObject({ action: 'temporaryPasswordIssued', actorId: managerId });
      expect(JSON.stringify(t.audit.entries)).not.toContain('new-temp-pass-1');
    });

    it('needs a password that follows the usual rules', async () => {
      const worker = await staff('worker');
      expect(
        (
          await t.call(
            'POST',
            `/users/${worker.id}/temporary-password`,
            { password: 'short' },
            manager,
          )
        ).status,
      ).toBe(400);
    });
  });

  describe('disable and re-enable', () => {
    it('ends every session at once; login says "disabled" only after the right password', async () => {
      const worker = await staff('worker');
      const r = await t.call('POST', `/users/${worker.id}/disable`, undefined, manager);
      expect(r.status).toBe(200);
      expect((r.body as StaffMember).disabledAt).toEqual(expect.any(String));
      expect((await t.call('GET', '/auth/me', undefined, worker.cookie)).status).toBe(401);

      const right = await t.call('POST', '/auth/login', {
        email: worker.email,
        password: worker.password,
      });
      expect(right.status).toBe(403);
      expect(code(right.body)).toBe(ACCOUNT_CODES.disabled);
      // A wrong password learns nothing: the same answer as for any wrong login.
      const wrong = await t.call('POST', '/auth/login', {
        email: worker.email,
        password: 'guess-guess',
      });
      expect(wrong.status).toBe(401);
      expect(JSON.stringify(wrong.body)).not.toMatch(/disabled/i);

      expect((await t.call('POST', `/users/${worker.id}/enable`, undefined, manager)).status).toBe(
        200,
      );
      expect((await t.login(worker.email, worker.password)).length).toBeGreaterThan(0);
      expect(entriesAbout(worker.id).slice(-2)).toEqual(['accountDisabled', 'accountEnabled']);
    });

    it('doing what is already so records nothing', async () => {
      const worker = await staff('worker');
      await t.call('POST', `/users/${worker.id}/disable`, undefined, manager);
      const count = t.audit.entries.length;
      expect((await t.call('POST', `/users/${worker.id}/disable`, undefined, manager)).status).toBe(
        200,
      );
      await t.call('POST', `/users/${worker.id}/enable`, undefined, manager);
      await t.call('POST', `/users/${worker.id}/enable`, undefined, manager);
      expect(t.audit.entries.length).toBe(count + 1);
    });
  });

  describe('lockout protection (owner, step 16)', () => {
    it('a manager can never disable themselves, even with other managers left', async () => {
      await staff('manager');
      const r = await t.call('POST', `/users/${managerId}/disable`, undefined, manager);
      expect(r.status).toBe(409);
      expect(code(r.body)).toBe(ACCOUNT_CODES.cannotDisableSelf);
      expect((await t.call('GET', '/auth/me', undefined, manager)).status).toBe(200);
    });

    it('a manager disabled by another cannot act any more', async () => {
      const a = await staff('manager');
      const b = await staff('manager');
      expect((await t.call('POST', `/users/${a.id}/disable`, undefined, b.cookie)).status).toBe(
        200,
      );
      // Their sessions ended, so they cannot reach the API at all.
      expect((await t.call('POST', `/users/${b.id}/disable`, undefined, a.cookie)).status).toBe(
        401,
      );
      // And the store refuses a disabled actor even past the session check.
      await expect(t.store.setDisabled(a.id, b.id, true)).rejects.toBeInstanceOf(
        ActorNotActiveError,
      );
      expect(t.store.rows.get(b.id)?.disabledAt).toBeNull();
    });

    it('managers and workers are refused on customers', async () => {
      const signup = await t.call('POST', '/auth/signup', {
        email: 'another-client@example.com',
        password: 'long enough',
        fullName: 'Client Two',
        mobile: '+963911111112',
        dateOfBirth: '1990-01-01',
        governorate: 'hama',
        cityArea: 'Centre',
      });
      const id = (signup.body as { id: string }).id;
      expect((await t.call('POST', `/users/${id}/disable`, undefined, manager)).status).toBe(404);
      expect(
        (
          await t.call(
            'POST',
            `/users/${id}/temporary-password`,
            { password: 'temporary-22' },
            manager,
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('the audit log records every account and department change', () => {
    it('sign-ups (the customer is the actor; no profile), staff creation, own password changes', async () => {
      const signup = await t.call('POST', '/auth/signup', {
        email: 'third-client@example.com',
        password: 'long enough',
        fullName: 'Client Three',
        mobile: '+963911111113',
        dateOfBirth: '1991-02-03',
        governorate: 'homs',
        cityArea: 'Waer',
      });
      const id = (signup.body as { id: string }).id;
      expect(t.audit.about(id)).toEqual([
        {
          actorId: id,
          action: 'signedUp',
          targetType: 'user',
          targetId: id,
          before: null,
          after: {
            email: 'third-client@example.com',
            role: 'customer',
            fullName: null,
            departmentId: null,
            mustChangePassword: false,
          },
        },
      ]);
      expect(JSON.stringify(t.audit.entries)).not.toMatch(/\+963911111113|1991-02-03|Waer/);

      const worker = await staff('worker');
      expect(t.audit.about(worker.id).map((e) => [e.action, e.actorId])).toEqual([
        ['accountCreated', managerId],
        ['passwordChanged', worker.id],
      ]);
    });

    it('the first manager from .env is created by the system (no actor)', () => {
      expect(t.audit.about(managerId)[0]).toMatchObject({
        action: 'accountCreated',
        actorId: null,
      });
    });

    it('language and theme changes are not recorded (owner)', async () => {
      const count = t.audit.entries.length;
      expect(
        (await t.call('PATCH', '/auth/me', { locale: 'ar', theme: 'light' }, manager)).status,
      ).toBe(200);
      expect(t.audit.entries.length).toBe(count);
    });

    it('departments: added, renamed, deleted, each by the manager who did it', async () => {
      const added = await t.call(
        'POST',
        '/departments',
        { nameEn: 'Packing', nameAr: 'التعبئة' },
        manager,
      );
      const id = (added.body as { id: string }).id;
      await t.call('PATCH', `/departments/${id}`, { nameEn: 'Packaging' }, manager);
      await t.call('DELETE', `/departments/${id}`, undefined, manager);
      expect(
        t.audit
          .about(id)
          .map(({ action, actorId, before, after }) => ({ action, actorId, before, after })),
      ).toEqual([
        {
          action: 'departmentCreated',
          actorId: managerId,
          before: null,
          after: { nameEn: 'Packing', nameAr: 'التعبئة' },
        },
        {
          action: 'departmentRenamed',
          actorId: managerId,
          before: { nameEn: 'Packing' },
          after: { nameEn: 'Packaging' },
        },
        {
          action: 'departmentDeleted',
          actorId: managerId,
          before: { nameEn: 'Packaging', nameAr: 'التعبئة' },
          after: null,
        },
      ]);
    });

    it('the entries cannot be changed afterwards', () => {
      const [first] = t.audit.entries;
      expect(Object.isFrozen(first)).toBe(true);
    });
  });
});
