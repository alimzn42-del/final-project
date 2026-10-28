/**
 * Account rules shared by the backend (request validation) and the frontend
 * (forms), so both always agree: roles, governorates, sign-up, login and
 * staff creation (docs/03-ui-spec.md "Users and roles", docs/04-architecture.md
 * "users").
 */
import { z } from 'zod';

import { LANGUAGES } from './locales.js';

export const ROLES = ['manager', 'worker', 'customer'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a manager can create. Sign-up only ever creates `customer`. */
export const STAFF_ROLES = ['manager', 'worker'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** The 14 Syrian governorates, then "outside" (labels: `governorate.<code>`). */
export const GOVERNORATES = [
  'damascus',
  'rifDimashq',
  'aleppo',
  'homs',
  'hama',
  'latakia',
  'tartus',
  'idlib',
  'daraa',
  'asSuwayda',
  'quneitra',
  'deirEzZor',
  'raqqa',
  'hasakah',
  'outside',
] as const;
export type Governorate = (typeof GOVERNORATES)[number];

/** NIST SP 800-63B: at least 8 characters, no composition rules; long passphrases allowed. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Emails are compared and stored lowercase (the database refuses capitals). */
const email = z.string().trim().toLowerCase().pipe(z.email('expected an email address').max(254));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `at most ${String(PASSWORD_MAX_LENGTH)} characters`);

/** International E.164: "+", country code, number; 8 to 15 digits in total. */
export const E164 = /^\+[1-9]\d{7,14}$/;

const text = (max: number) => z.string().trim().min(1, 'required').max(max);
/** Optional text: missing or blank becomes undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** Customers must be at least this old on the sign-up date (owner, step 9). */
export const MINIMUM_CUSTOMER_AGE = 18;

/**
 * A date as YYYY-MM-DD in Syria (Asia/Damascus), where the line is, so the
 * answer does not depend on the server's or the browser's time zone.
 */
export function dateInSyria(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus' }).format(at);
}

/**
 * True if someone born on `dateOfBirth` (YYYY-MM-DD) is at least `years` old
 * on `onDate` (YYYY-MM-DD). The birthday is compared as text: born on 29
 * February, the birthday in a non-leap year counts from 1 March.
 */
export function isAtLeast(years: number, dateOfBirth: string, onDate: string): boolean {
  const birthYear = Number(dateOfBirth.slice(0, 4));
  return `${String(birthYear + years).padStart(4, '0')}${dateOfBirth.slice(4)}` <= onDate;
}

/**
 * Customer sign-up (doc 03). Unknown fields, such as `role`, are dropped:
 * the backend always creates a customer.
 */
export const signupSchema = z
  .object({
    email,
    password: newPassword,
    fullName: text(100),
    mobile: z.string().trim().regex(E164, 'expected an international number like +963912345678'),
    /** YYYY-MM-DD; at least 18 years before the sign-up date (in Syria). */
    dateOfBirth: z.iso
      .date('expected a date like 1990-05-17')
      .refine((d) => d >= '1900-01-01', 'must be after 1900')
      .refine(
        (d) => isAtLeast(MINIMUM_CUSTOMER_AGE, d, dateInSyria()),
        `must be at least ${String(MINIMUM_CUSTOMER_AGE)} years old`,
      ),
    governorate: z.enum(GOVERNORATES),
    /** Only for governorate "outside". */
    country: optionalText(100),
    cityArea: text(100),
    occupation: optionalText(100),
    paintPurpose: optionalText(500),
    /** The language the person used on the sign-up page. */
    locale: z.enum(LANGUAGES).default('en'),
  })
  .superRefine((s, ctx) => {
    if (s.governorate === 'outside' && !s.country) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'required outside Syria' });
    }
    if (s.governorate !== 'outside' && s.country) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'only for "outside Syria"' });
    }
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** A manager creates a manager or worker account. */
/**
 * A manager creates a manager or worker account (owner, step 9): full name,
 * email, role and a temporary password are required; language is optional.
 * Workers also need a department; whether it is one of the departments in
 * config/departments.json is checked by the backend, which has the file.
 * The new user must change the password at first login.
 */
export const createStaffSchema = z
  .strictObject({
    fullName: text(100),
    email,
    role: z.enum(STAFF_ROLES),
    /** Temporary: the user must change it at first login. */
    password: newPassword,
    locale: z.enum(LANGUAGES).default('en'),
    /** Required for workers, not allowed for managers. */
    department: optionalText(50),
  })
  .superRefine((s, ctx) => {
    if (s.role === 'worker' && !s.department) {
      ctx.addIssue({ code: 'custom', path: ['department'], message: 'required for a worker' });
    }
    if (s.role === 'manager' && s.department) {
      ctx.addIssue({ code: 'custom', path: ['department'], message: 'only for workers' });
    }
  });
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/** What a logged-in user may change about their own account. */
export const updateMeSchema = z.strictObject({ locale: z.enum(LANGUAGES) });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** The user as the API returns it: never the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  locale: (typeof LANGUAGES)[number];
  fullName: string | null;
  /** Workers only: an id from config/departments.json. */
  department: string | null;
  /** True until a manager-created account has replaced its temporary password. */
  mustChangePassword: boolean;
}

/** Change my password: the current one, then the new one (same rules as sign-up). */
export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
    newPassword: newPassword,
  })
  .refine((s) => s.newPassword !== s.currentPassword, {
    path: ['newPassword'],
    message: 'must differ from the current password',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
