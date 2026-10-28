/**
 * Where user accounts are kept. The auth code depends only on this interface:
 * the backend uses the database (PrismaUserStore); the HTTP tests use an
 * in-memory store, so they run without Docker.
 */
import type { Governorate, Language, PublicUser, Role } from '@mixline/shared';

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
  setLocale(id: string, locale: Language): Promise<StoredUser>;
}

export function toPublic(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    fullName: user.fullName,
  };
}
