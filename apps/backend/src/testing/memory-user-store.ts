/**
 * TEST-ONLY user store kept in memory, so the HTTP tests run without Docker.
 * It mirrors the database rules: unique email, lowercase emails only.
 * Excluded from the build (tsconfig.build.json).
 */
import { randomUUID } from 'node:crypto';

import type { Language, Role } from '@mixline/shared';

import {
  EmailTakenError,
  type NewUser,
  type StoredUser,
  type UserStore,
} from '../users/user-store.js';

export class MemoryUserStore implements UserStore {
  readonly rows = new Map<
    string,
    StoredUser & Omit<NewUser, 'fullName' | 'department' | 'mustChangePassword'>
  >();

  findByEmail(email: string): Promise<StoredUser | undefined> {
    return Promise.resolve(copy([...this.rows.values()].find((u) => u.email === email)));
  }

  findById(id: string): Promise<StoredUser | undefined> {
    return Promise.resolve(copy(this.rows.get(id)));
  }

  create(input: NewUser): Promise<StoredUser> {
    if (input.email !== input.email.toLowerCase()) {
      return Promise.reject(new Error('users_email_lowercase: email must be lowercase'));
    }
    if ((input.role === 'worker') !== Boolean(input.department)) {
      return Promise.reject(new Error('users_department_only_for_workers'));
    }
    if ([...this.rows.values()].some((u) => u.email === input.email)) {
      return Promise.reject(new EmailTakenError(input.email));
    }
    const row = {
      ...input,
      id: randomUUID(),
      fullName: input.fullName ?? null,
      department: input.department ?? null,
      mustChangePassword: input.mustChangePassword ?? false,
    };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  }

  countByRole(role: Role): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((u) => u.role === role).length);
  }

  setLocale(id: string, locale: Language): Promise<StoredUser> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new Error(`no user ${id}`));
    row.locale = locale;
    return Promise.resolve({ ...row });
  }

  setPassword(id: string, passwordHash: string): Promise<StoredUser> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new Error(`no user ${id}`));
    row.passwordHash = passwordHash;
    row.mustChangePassword = false;
    return Promise.resolve({ ...row });
  }
}

function copy<T extends object>(row: T | undefined): T | undefined {
  return row ? { ...row } : undefined;
}
