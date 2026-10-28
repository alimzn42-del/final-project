import { describe, expect, it } from 'vitest';

import { createStaffSchema, dateInSyria, isAtLeast, loginSchema, signupSchema } from './auth.js';

const valid = {
  email: '  Rana.Haddad@Example.COM ',
  password: 'correct horse',
  fullName: 'Rana Haddad',
  mobile: '+963912345678',
  dateOfBirth: '1995-04-12',
  governorate: 'damascus',
  cityArea: 'Mezzeh',
};

/** The messages of a failed parse, by field. */
function errors(result: ReturnType<typeof signupSchema.safeParse>): Record<string, string> {
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('signupSchema', () => {
  it('accepts a valid sign-up, lowercases the email and fills the default language', () => {
    const r = signupSchema.parse(valid);
    expect(r.email).toBe('rana.haddad@example.com');
    expect(r.locale).toBe('en');
    expect(r.country).toBeUndefined();
  });

  it('drops a role sent by the client: sign-up only ever creates a customer', () => {
    const r = signupSchema.parse({ ...valid, role: 'manager' });
    expect(r).not.toHaveProperty('role');
  });

  it('turns blank optional fields into "not given"', () => {
    const r = signupSchema.parse({ ...valid, occupation: '   ', paintPurpose: 'My café walls' });
    expect(r.occupation).toBeUndefined();
    expect(r.paintPurpose).toBe('My café walls');
  });

  it('needs a country outside Syria, and refuses one inside', () => {
    expect(errors(signupSchema.safeParse({ ...valid, governorate: 'outside' }))).toEqual({
      country: 'required outside Syria',
    });
    expect(
      signupSchema.parse({ ...valid, governorate: 'outside', country: 'Lebanon' }).country,
    ).toBe('Lebanon');
    expect(errors(signupSchema.safeParse({ ...valid, country: 'Lebanon' }))).toEqual({
      country: 'only for "outside Syria"',
    });
  });

  it.each([
    ['a local number without +', { mobile: '0912345678' }, 'mobile'],
    ['a short password', { password: 'short' }, 'password'],
    ['a future birth date', { dateOfBirth: '2999-01-01' }, 'dateOfBirth'],
    ['a birth date in another format', { dateOfBirth: '12/04/1995' }, 'dateOfBirth'],
    ['an unknown governorate', { governorate: 'beirut' }, 'governorate'],
    ['a missing city/area', { cityArea: ' ' }, 'cityArea'],
    ['a bad email', { email: 'rana@' }, 'email'],
  ])('refuses %s', (_case, change, field) => {
    expect(Object.keys(errors(signupSchema.safeParse({ ...valid, ...change })))).toContain(field);
  });
});

describe('age: at least 18 on the sign-up date', () => {
  it('counts the 18th birthday itself as old enough', () => {
    expect(isAtLeast(18, '2008-10-28', '2026-10-28')).toBe(true);
    expect(isAtLeast(18, '2008-10-29', '2026-10-28')).toBe(false);
    expect(isAtLeast(18, '1990-01-01', '2026-10-28')).toBe(true);
  });

  it('born on 29 February: 18 from 1 March in a non-leap year', () => {
    expect(isAtLeast(18, '2008-02-29', '2026-02-28')).toBe(false);
    expect(isAtLeast(18, '2008-02-29', '2026-03-01')).toBe(true);
  });

  it('uses the date in Syria (UTC+3), not UTC', () => {
    // 22:30 UTC on 27 October is already 28 October in Damascus.
    expect(dateInSyria(new Date('2026-10-27T22:30:00Z'))).toBe('2026-10-28');
    expect(dateInSyria(new Date('2026-10-27T20:00:00Z'))).toBe('2026-10-27');
  });

  it('refuses a 17-year-old at sign-up, accepts an 18-year-old', () => {
    const today = dateInSyria();
    const year = Number(today.slice(0, 4));
    const turns18Today = `${String(year - 18)}${today.slice(4)}`;
    const turns18Tomorrow = new Date(Date.parse(turns18Today) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(signupSchema.safeParse({ ...valid, dateOfBirth: turns18Today }).success).toBe(true);
    expect(errors(signupSchema.safeParse({ ...valid, dateOfBirth: turns18Tomorrow }))).toEqual({
      dateOfBirth: 'must be at least 18 years old',
    });
  });
});

describe('loginSchema and createStaffSchema', () => {
  it('lowercases the login email and refuses unknown fields', () => {
    expect(loginSchema.parse({ email: 'A@B.CO', password: 'x' }).email).toBe('a@b.co');
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', role: 'manager' }).success).toBe(
      false,
    );
  });

  it('lets a manager create only managers and workers', () => {
    const base = { email: 'w@lab.sy', password: 'long enough' };
    expect(createStaffSchema.parse({ ...base, role: 'worker' }).role).toBe('worker');
    expect(createStaffSchema.safeParse({ ...base, role: 'customer' }).success).toBe(false);
  });
});
