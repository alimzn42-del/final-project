import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FirstManagerSeed } from '../auth/first-manager.js';
import { Sessions } from '../auth/session.js';
import { DEFAULT_RATE_LIMITS, startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';

const customer = {
  email: 'Rana.Haddad@Example.com',
  password: 'correct horse',
  fullName: 'Rana Haddad',
  mobile: '+963912345678',
  dateOfBirth: '1995-04-12',
  governorate: 'damascus',
  cityArea: 'Mezzeh',
};

describe('auth over HTTP (in-memory users)', () => {
  let t: TestApp;
  let manager: string;

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('sign-up', () => {
    it('creates a customer, logs them in, and never returns the password hash', async () => {
      const r = await t.call('POST', '/auth/signup', customer);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({
        id: expect.any(String) as string,
        email: 'rana.haddad@example.com',
        role: 'customer',
        locale: 'en',
        fullName: 'Rana Haddad',
      });
      expect(JSON.stringify(r.body)).not.toMatch(/hash|password/i);
      const me = await t.call('GET', '/auth/me', undefined, r.cookie);
      expect(me.status).toBe(200);
    });

    it('sets the session cookie httpOnly, SameSite=Strict, on /api only', async () => {
      const r = await t.call('POST', '/auth/signup', { ...customer, email: 'cookie@example.com' });
      expect(r.setCookie).toMatch(/^mixline_session=/);
      expect(r.setCookie).toMatch(/HttpOnly/);
      expect(r.setCookie).toMatch(/SameSite=Strict/);
      expect(r.setCookie).toMatch(/Path=\/api/);
      expect(r.setCookie).not.toMatch(/Secure/); // lab network is plain HTTP (COOKIE_SECURE=false)
    });

    it('creates a customer even when the request asks for manager', async () => {
      const r = await t.call('POST', '/auth/signup', {
        ...customer,
        email: 'sneaky@example.com',
        role: 'manager',
      });
      expect(r.status).toBe(201);
      expect((r.body as { role: string }).role).toBe('customer');
      const stored = await t.store.findByEmail('sneaky@example.com');
      expect(stored?.role).toBe('customer');
    });

    it('refuses an email that is already registered, in any letter case', async () => {
      const r = await t.call('POST', '/auth/signup', {
        ...customer,
        email: 'RANA.HADDAD@example.com',
      });
      expect(r.status).toBe(409);
    });

    it('lists every invalid field', async () => {
      const r = await t.call('POST', '/auth/signup', {
        ...customer,
        email: 'other@example.com',
        mobile: '0912345678',
        governorate: 'outside',
      });
      expect(r.status).toBe(400);
      const paths = (r.body as { issues: { path: string }[] }).issues.map((i) => i.path);
      expect(paths.sort()).toEqual(['country', 'mobile']);
    });
  });

  describe('login and logout', () => {
    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrong = await t.call('POST', '/auth/login', {
        email: TEST_ENV.MANAGER_EMAIL,
        password: 'not-the-password',
      });
      const unknown = await t.call('POST', '/auth/login', {
        email: 'nobody@lab.sy',
        password: 'not-the-password',
      });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.setCookie).toBeNull();
    });

    it('accepts the email in any letter case', async () => {
      const r = await t.call('POST', '/auth/login', {
        email: 'BOSS@LAB.SY',
        password: TEST_ENV.MANAGER_PASSWORD,
      });
      expect(r.status).toBe(200);
      expect((r.body as { role: string }).role).toBe('manager');
    });

    it('logout clears the cookie', async () => {
      const r = await t.call('POST', '/auth/logout');
      expect(r.status).toBe(204);
      expect(r.setCookie).toMatch(/^mixline_session=;/);
      expect(r.setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('sessions', () => {
    it('refuses a forged token', async () => {
      const forged = await new Sessions({
        secret: 'another-secret-that-is-long-enough-0000',
        hours: 8,
        secureCookie: false,
      }).sign([...t.store.rows.keys()][0] ?? '');
      const r = await t.call('GET', '/auth/me', undefined, `mixline_session=${forged}`);
      expect(r.status).toBe(401);
    });

    it('refuses an expired token', async () => {
      const sessions = new Sessions({
        secret: TEST_ENV.JWT_SECRET,
        hours: -1,
        secureCookie: false,
      });
      const token = await sessions.sign([...t.store.rows.keys()][0] ?? '');
      expect((await t.call('GET', '/auth/me', undefined, `mixline_session=${token}`)).status).toBe(
        401,
      );
    });

    it('locks out a deleted user at once, even with a valid cookie', async () => {
      const signup = await t.call('POST', '/auth/signup', {
        ...customer,
        email: 'gone@example.com',
      });
      const id = (signup.body as { id: string }).id;
      t.store.rows.delete(id);
      expect((await t.call('GET', '/auth/me', undefined, signup.cookie)).status).toBe(401);
    });

    it('remembers the language per user', async () => {
      const cookie = await t.login('rana.haddad@example.com', customer.password);
      const r = await t.call('PATCH', '/auth/me', { locale: 'ar' }, cookie);
      expect(r.status).toBe(200);
      expect(
        ((await t.call('GET', '/auth/me', undefined, cookie)).body as { locale: string }).locale,
      ).toBe('ar');
      expect((await t.call('PATCH', '/auth/me', { locale: 'fr' }, cookie)).status).toBe(400);
    });
  });

  describe('access by role (default deny)', () => {
    let worker: string;
    let client: string;

    beforeAll(async () => {
      const created = await t.call(
        'POST',
        '/users',
        { email: 'Worker@Lab.sy', password: 'worker-pass-1', role: 'worker', fullName: 'Sami' },
        manager,
      );
      expect(created.status).toBe(201);
      worker = await t.login('worker@lab.sy', 'worker-pass-1');
      client = await t.login('rana.haddad@example.com', customer.password);
    });

    it('line data (/api/machine): staff yes, customer no, anonymous no', async () => {
      expect((await t.call('GET', '/machine', undefined, manager)).status).toBe(200);
      expect((await t.call('GET', '/machine', undefined, worker)).status).toBe(200);
      expect((await t.call('GET', '/machine', undefined, client)).status).toBe(403);
      expect((await t.call('GET', '/machine')).status).toBe(401);
    });

    it('only a manager creates accounts, and only managers and workers', async () => {
      const staff = { email: 'new@lab.sy', password: 'long enough', role: 'worker' };
      expect((await t.call('POST', '/users', staff, worker)).status).toBe(403);
      expect((await t.call('POST', '/users', staff, client)).status).toBe(403);
      expect((await t.call('POST', '/users', staff)).status).toBe(401);
      expect((await t.call('POST', '/users', { ...staff, role: 'customer' }, manager)).status).toBe(
        400,
      );
      const made = await t.call('POST', '/users', { ...staff, role: 'manager' }, manager);
      expect(made.status).toBe(201);
      expect((await t.call('POST', '/users', staff, manager)).status).toBe(409);
    });

    it('records which manager created an account', () => {
      const row = [...t.store.rows.values()].find((u) => u.email === 'worker@lab.sy');
      const boss = [...t.store.rows.values()].find((u) => u.email === TEST_ENV.MANAGER_EMAIL);
      expect(row?.createdById).toBe(boss?.id);
    });
  });
});

describe('first manager from .env', () => {
  it('is created once, and an existing manager is never changed', async () => {
    const t = await startTestApp();
    const managers = () => [...t.store.rows.values()].filter((u) => u.role === 'manager');
    expect(managers()).toHaveLength(1);
    const seed = t.app.get(FirstManagerSeed);
    await seed.onApplicationBootstrap(); // as if the backend restarted
    expect(managers()).toHaveLength(1);
    await t.close();
  });

  it('is skipped (with a warning) when not configured', async () => {
    const t = await startTestApp({ env: { JWT_SECRET: TEST_ENV.JWT_SECRET } });
    expect(t.store.rows.size).toBe(0);
    await t.close();
  });
});

describe('rate limits (real values)', () => {
  it('login: the 11th attempt within a minute is refused with 429', async () => {
    const t = await startTestApp({ rateLimits: DEFAULT_RATE_LIMITS });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await t.call('POST', '/auth/login', { email: 'x@lab.sy', password: 'wrong-pass' })).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Sign-up has its own, separate limit.
    expect((await t.call('POST', '/auth/signup', customer)).status).toBe(201);
    await t.close();
  });

  it('sign-up: the 21st within an hour is refused with 429', async () => {
    const t = await startTestApp({ rateLimits: DEFAULT_RATE_LIMITS });
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (
        await t.call('POST', '/auth/signup', { ...customer, email: `c${String(i)}@example.com` })
      ).status;
      if (i < 20) expect(last).toBe(201);
    }
    expect(last).toBe(429);
    await t.close();
  });
});
