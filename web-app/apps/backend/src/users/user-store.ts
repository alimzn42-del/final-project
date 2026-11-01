/**
 * Where user accounts are kept. The auth code depends only on this interface:
 * the backend uses the database (PrismaUserStore); the HTTP tests use an
 * in-memory store, so they run without Docker.
 */
import type { Governorate, Language, PublicUser, Role, Theme } from '@mixline/shared';

export const USER_STORE = Symbol('USER_STORE');

export interface NewUser {
  email: string;
  passwordHash: string;
  role: Role;
  locale: Language;
  createdById?: string | undefined;
  fullName?: string | undefined;
  mobile?: string | undefined;
  /** YYYY-MM-DD */
  dateOfBirth?: string | undefined;
  governorate?: Governorate | undefined;
  country?: string | undefined;
  cityArea?: string | undefined;
  occupation?: string | undefined;
  paintPurpose?: string | undefined;
  /** Workers only (database check); must exist (foreign key). */
  departmentId?: string | undefined;
  /** True for accounts a manager creates (temporary password). */
  mustChangePassword?: boolean | undefined;
}

export interface StoredUser extends PublicUser {
  passwordHash: string;
}

/** Thrown by create() when the email is already registered. */
export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`email already registered: ${email}`);
  }
}

export interface UserStore {
  findByEmail(email: string): Promise<StoredUser | undefined>;
  findById(id: string): Promise<StoredUser | undefined>;
  /** Throws EmailTakenError if the email exists. */
  create(user: NewUser): Promise<StoredUser>;
  countByRole(role: Role): Promise<number>;
  /** Changes the language and/or the theme (null: follow the browser again). */
  setPreferences(
    id: string,
    preferences: { locale?: Language; theme?: Theme | null },
  ): Promise<StoredUser>;
  /** Replaces the password hash and clears mustChangePassword. */
  setPassword(id: string, passwordHash: string): Promise<StoredUser>;
}

export function toPublic(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    theme: user.theme,
    fullName: user.fullName,
    departmentId: user.departmentId,
    mustChangePassword: user.mustChangePassword,
  };
}
