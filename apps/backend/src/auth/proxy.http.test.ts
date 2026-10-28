/**
 * The login limit counts each client address (doc 04). Behind nginx
 * (TRUST_PROXY=1) the address comes from X-Forwarded-For, which nginx sets;
 * without a proxy (the default) that header is ignored, so a client cannot
 * fake addresses to get more attempts.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_RATE_LIMITS, startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';

/** Statuses of `count` wrong logins, each from the address `from(i)` as nginx would forward it. */
async function wrongLogins(t: TestApp, count: number, from: (i: number) => string) {
  const base = `${await t.app.getUrl()}/api`;
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from(i) },
      body: JSON.stringify({ email: 'x@lab.sy', password: 'wrong-pass' }),
    });
    statuses.push(res.status);
  }
  return statuses;
}

describe('client address for the login limit', () => {
  it('behind nginx (TRUST_PROXY=1): each client has its own limit', async () => {
    const t = await startTestApp({
      env: { ...TEST_ENV, TRUST_PROXY: '1' },
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    const first = await wrongLogins(t, 11, () => '10.0.0.1');
    expect(first[10]).toBe(429);
    // Another computer on the lab network is not blocked by the first one.
    expect(await wrongLogins(t, 1, () => '10.0.0.2')).toEqual([401]);
    await t.close();
  });

  it('without a proxy (default): X-Forwarded-For is ignored, so it cannot dodge the limit', async () => {
    const t = await startTestApp({ rateLimits: DEFAULT_RATE_LIMITS });
    const statuses = await wrongLogins(t, 11, (i) => `10.0.1.${String(i)}`);
    expect(statuses[10]).toBe(429);
    await t.close();
  });
});
