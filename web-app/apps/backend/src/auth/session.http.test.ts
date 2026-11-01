import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { readCookie, SESSION_COOKIE } from './session.js';

/** Sessions on the server, one per login (owner, step 11). */
describe('sessions', () => {
  let t: TestApp;
  let n = 0;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const me = async (cookie: string | undefined) =>
    (await t.call('GET', '/auth/me', undefined, cookie)).status;

  /** A new customer (signed up, so already logged in once); returns the email and password. */
  async function customer() {
    n++;
    const email = `client${String(n)}@example.com`;
    const password = 'long enough';
    const r = await t.call('POST', '/auth/signup', {
      email,
      password,
      fullName: 'Client',
      mobile: '+963911111111',
      dateOfBirth: '1990-01-01',
      governorate: 'homs',
      cityArea: 'Inshaat',
    });
    expect(r.status).toBe(201);
    return { email, password, id: (r.body as { id: string }).id };
  }

  it('a token copied before logout gets 401 after it', async () => {
    const copied = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    expect(await me(copied)).toBe(200);

    const out = await t.call('POST', '/auth/logout', undefined, copied);
    expect(out.status).toBe(204);
    expect(out.setCookie).toMatch(/mixline_session=;/); // the browser forgets it too

    expect(await me(copied)).toBe(401);
    expect((await t.call('GET', '/machine', undefined, copied)).status).toBe(401);
  });

  it('logout on one device keeps the other devices logged in', async () => {
    const phone = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    const laptop = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    await t.call('POST', '/auth/logout', undefined, phone);
    expect(await me(phone)).toBe(401);
    expect(await me(laptop)).toBe(200);
  });

  it('a password change logs out the other devices; the device that changed it stays in', async () => {
    const c = await customer();
    const here = await t.login(c.email, c.password);
    const other = await t.login(c.email, c.password);
    const third = await t.login(c.email, c.password);

    const r = await t.call(
      'POST',
      '/auth/change-password',
      { currentPassword: c.password, newPassword: 'a new long password' },
      here,
    );
    expect(r.status).toBe(200);
    expect(await me(here)).toBe(200);
    expect(await me(other)).toBe(401);
    expect(await me(third)).toBe(401);
    expect(t.sessions.idsOf(c.id)).toHaveLength(1);
  });

  it('a wrong current password changes nothing and logs nobody out', async () => {
    const c = await customer();
    const here = await t.login(c.email, c.password);
    const other = await t.login(c.email, c.password);
    const r = await t.call(
      'POST',
      '/auth/change-password',
      { currentPassword: 'not the password', newPassword: 'a new long password' },
      here,
    );
    expect(r.status).toBe(400);
    expect(await me(other)).toBe(200);
  });

  it('logout without a valid session still answers 204 and clears the cookie', async () => {
    for (const cookie of [undefined, `${SESSION_COOKIE}=garbage`]) {
      const r = await t.call('POST', '/auth/logout', undefined, cookie);
      expect(r.status).toBe(204);
      expect(r.setCookie).toMatch(/mixline_session=;/);
    }
  });

  it('refuses a token whose session row was removed, or belongs to another user', async () => {
    const a = await customer();
    const b = await customer();
    const cookieA = await t.login(a.email, a.password);
    const [sessionOfB] = t.sessions.idsOf(b.id);
    if (!sessionOfB) throw new Error('b has no session');

    // Signed with the real secret, but pointing at another user's session.
    const mixed = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(a.id)
      .setJti(sessionOfB)
      .setIssuer('mixline')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(TEST_ENV.JWT_SECRET));
    expect(await me(`${SESSION_COOKIE}=${mixed}`)).toBe(401);

    for (const id of t.sessions.idsOf(a.id)) t.sessions.rows.delete(id);
    expect(await me(cookieA)).toBe(401);
  });

  it('refuses a session past its end even if the token itself is still valid', async () => {
    const c = await customer();
    const cookie = await t.login(c.email, c.password);
    const token = readCookie(cookie, SESSION_COOKIE) ?? '';
    const jti = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      jti: string;
    };
    const row = t.sessions.rows.get(jti.jti);
    if (!row) throw new Error('no session row');
    row.expiresAt = new Date(Date.now() - 1);
    expect(await me(cookie)).toBe(401);
  });

  it('forgets expired sessions at the next login', async () => {
    const c = await customer();
    const old = await t.login(c.email, c.password);
    for (const id of t.sessions.idsOf(c.id)) {
      const row = t.sessions.rows.get(id);
      if (row) row.expiresAt = new Date(Date.now() - 1);
    }
    await t.login(c.email, c.password);
    expect(t.sessions.idsOf(c.id)).toHaveLength(1);
    expect(await me(old)).toBe(401);
  });
});
