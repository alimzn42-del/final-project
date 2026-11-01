import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';
import { readCookie } from './session.js';

describe('password hashing', () => {
  it('uses argon2id with the OWASP settings (19 MiB, 2 passes, 1 lane)', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('salts every hash, so the same password never gives the same hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies the right password, refuses a wrong one and a malformed hash', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
    expect(await verifyPassword(hash, 'Correct horse')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'correct horse')).toBe(false);
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; mixline_session=abc.def; b=2', 'mixline_session')).toBe('abc.def');
  });

  it('handles a missing header, a missing cookie and a similar name', () => {
    expect(readCookie(undefined, 'x')).toBeUndefined();
    expect(readCookie('a=1', 'x')).toBeUndefined();
    expect(readCookie('mixline_session2=zzz', 'mixline_session')).toBeUndefined();
  });
});
