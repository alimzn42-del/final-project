/**
 * Where user accounts are kept. The auth code depends only on this interface:
 * the backend uses the database (PrismaUserStore); the HTTP tests use an
 * in-memory store, so they run without Docker.
 *
 * Every change to an account writes its audit entry in the same transaction
 * (owner, step 16): if the entry cannot be written, the change does not happen.
 * Language and theme changes are not recorded.
 */
import type {
  AuditValues,
  Governorate,
  Language,
  PublicUser,
  Role,
  StaffMember,
  StaffRole,
  Theme,
} from '@mixline/shared';

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

/** How a new account is recorded in the audit log. */
export type CreationAudit =
  /** A customer signed up: the new account is its own actor. */
  | { action: 'signedUp' }
  /** A manager created it (actorId), or the system did (null: the first manager from .env). */
  | { action: 'accountCreated'; actorId: string | null };

export interface StoredUser extends PublicUser {
  passwordHash: string;
  disabledAt: Date | null;
  createdAt: Date;
}

/** Thrown by create() when the email is already registered. */
export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`email already registered: ${email}`);
  }
}

/** No manager or worker account with this id (customers are not staff). */
export class StaffNotFoundError extends Error {
  constructor(id: string) {
    super(`no staff account ${id}`);
  }
}

/** Only workers have a department. */
export class NotAWorkerError extends Error {}

/** Owner, step 16: a manager may never disable their own account. */
export class CannotDisableSelfError extends Error {}

/** Owner, step 16: the change would leave no active manager. */
export class LastActiveManagerError extends Error {}

/** The manager acting is no longer an active manager (disabled a moment ago). */
export class ActorNotActiveError extends Error {}

export interface UserStore {
  findByEmail(email: string): Promise<StoredUser | undefined>;
  findById(id: string): Promise<StoredUser | undefined>;
  /** Throws EmailTakenError if the email exists. Records accountCreated or signedUp. */
  create(user: NewUser, audit: CreationAudit): Promise<StoredUser>;
  countByRole(role: Role): Promise<number>;
  /** Changes the language and/or the theme (null: follow the browser again). Not recorded. */
  setPreferences(
    id: string,
    preferences: { locale?: Language; theme?: Theme | null },
  ): Promise<StoredUser>;
  /** The user's own password change: replaces the hash, clears mustChangePassword. Recorded. */
  setPassword(id: string, passwordHash: string): Promise<StoredUser>;

  // Manager actions on staff accounts (owner, step 16). Each one locks the managers' rows,
  // refuses if the acting manager is no longer active (ActorNotActiveError) or if the change
  // would leave no active manager (LastActiveManagerError), and records itself.

  /** Managers and workers, managers first, then by name. */
  listStaff(): Promise<StoredUser[]>;
  /** Moves a worker; throws StaffNotFoundError, NotAWorkerError, DepartmentNotFoundError. */
  setDepartment(actorId: string, id: string, departmentId: string): Promise<StoredUser>;
  /** A new temporary password: must be changed at the next login. Throws StaffNotFoundError. */
  issueTemporaryPassword(actorId: string, id: string, passwordHash: string): Promise<StoredUser>;
  /**
   * Disables or re-enables a staff account. Throws StaffNotFoundError, CannotDisableSelfError,
   * LastActiveManagerError, ActorNotActiveError. Doing what is already so changes nothing.
   */
  setDisabled(actorId: string, id: string, disabled: boolean): Promise<StoredUser>;
}

export const STAFF: readonly Role[] = ['manager', 'worker'] satisfies StaffRole[];

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

export function toStaff(user: StoredUser): StaffMember {
  return {
    id: user.id,
    email: user.email,
    role: user.role === 'manager' ? 'manager' : 'worker',
    fullName: user.fullName,
    locale: user.locale,
    departmentId: user.departmentId,
    mustChangePassword: user.mustChangePassword,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** What the audit log keeps about a new account: never the password or a customer's profile. */
export function creationValues(user: StoredUser): AuditValues {
  return {
    email: user.email,
    role: user.role,
    fullName: user.role === 'customer' ? null : user.fullName,
    departmentId: user.departmentId,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Sorts managers first, then by name (or email). */
export function staffOrder(a: StoredUser, b: StoredUser): number {
  if (a.role !== b.role) return a.role === 'manager' ? -1 : 1;
  return (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email);
}
