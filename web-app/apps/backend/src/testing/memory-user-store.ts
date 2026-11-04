/**
 * TEST-ONLY user store kept in memory, so the HTTP tests run without Docker.
 * It mirrors the database rules: unique email, lowercase emails only, disabled
 * only for staff, and the step 16 account rules (lockout, audit entries).
 * Excluded from the build (tsconfig.build.json).
 */
import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditValues, Language, Role, Theme } from '@mixline/shared';

import { DepartmentNotFoundError } from '../departments/department-store.js';
import {
  ActorNotActiveError,
  CannotDisableSelfError,
  creationValues,
  type CreationAudit,
  EmailTakenError,
  LastActiveManagerError,
  type NewUser,
  NotAWorkerError,
  staffOrder,
  StaffNotFoundError,
  type StoredUser,
  type UserStore,
} from '../users/user-store.js';
import { MemoryAuditLog } from './memory-audit-log.js';
import type { MemoryDepartmentStore } from './memory-department-store.js';

type Row = StoredUser &
  Omit<NewUser, 'fullName' | 'departmentId' | 'mustChangePassword' | 'createdById'>;

export class MemoryUserStore implements UserStore {
  readonly rows = new Map<string, Row>();

  /** Linked like the database: workers point at existing departments (foreign key). */
  constructor(
    private readonly departments?: MemoryDepartmentStore,
    readonly audit: MemoryAuditLog = new MemoryAuditLog(),
  ) {
    if (departments) {
      departments.workersIn = (id) =>
        [...this.rows.values()].filter((u) => u.departmentId === id).length;
    }
  }

  findByEmail(email: string): Promise<StoredUser | undefined> {
    return Promise.resolve(copy([...this.rows.values()].find((u) => u.email === email)));
  }

  findById(id: string): Promise<StoredUser | undefined> {
    return Promise.resolve(copy(this.rows.get(id)));
  }

  create(input: NewUser, audit: CreationAudit): Promise<StoredUser> {
    if (input.email !== input.email.toLowerCase()) {
      return Promise.reject(new Error('users_email_lowercase: email must be lowercase'));
    }
    if ((input.role === 'worker') !== Boolean(input.departmentId)) {
      return Promise.reject(new Error('users_department_only_for_workers'));
    }
    if (input.departmentId && this.departments && !this.departments.rows.has(input.departmentId)) {
      return Promise.reject(new DepartmentNotFoundError(input.departmentId));
    }
    if ([...this.rows.values()].some((u) => u.email === input.email)) {
      return Promise.reject(new EmailTakenError(input.email));
    }
    const row: Row = {
      ...input,
      id: randomUUID(),
      fullName: input.fullName ?? null,
      departmentId: input.departmentId ?? null,
      mustChangePassword: input.mustChangePassword ?? false,
      theme: null,
      disabledAt: null,
      createdAt: new Date(),
      createdById: input.createdById ?? null,
    };
    this.rows.set(row.id, row);
    const actorId = audit.action === 'signedUp' ? row.id : audit.actorId;
    this.record(actorId, audit.action, row.id, null, creationValues(row));
    return Promise.resolve({ ...row });
  }

  countByRole(role: Role): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((u) => u.role === role).length);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Language; theme?: Theme | null },
  ): Promise<StoredUser> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new Error(`no user ${id}`));
    if (preferences.locale !== undefined) row.locale = preferences.locale;
    if (preferences.theme !== undefined) row.theme = preferences.theme;
    return Promise.resolve({ ...row });
  }

  setPassword(id: string, passwordHash: string, actorId: string | null = id): Promise<StoredUser> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new Error(`no user ${id}`));
    const before = row.mustChangePassword;
    row.passwordHash = passwordHash;
    row.mustChangePassword = false;
    this.record(
      actorId,
      'passwordChanged',
      id,
      { mustChangePassword: before },
      { mustChangePassword: false },
    );
    return Promise.resolve({ ...row });
  }

  listStaff(): Promise<StoredUser[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((u) => u.role !== 'customer')
        .map((u) => ({ ...u }))
        .sort(staffOrder),
    );
  }

  setDepartment(actorId: string, id: string, departmentId: string): Promise<StoredUser> {
    return this.staffAction(actorId, id, (target) => {
      if (target.role !== 'worker') throw new NotAWorkerError();
      const next = this.departments?.rows.get(departmentId);
      if (this.departments && !next) throw new DepartmentNotFoundError(departmentId);
      if (target.departmentId === departmentId) return;
      const previous = target.departmentId
        ? this.departments?.rows.get(target.departmentId)
        : undefined;
      const before = {
        departmentId: target.departmentId,
        departmentName: previous?.nameEn ?? null,
      };
      target.departmentId = departmentId;
      this.record(actorId, 'departmentChanged', id, before, {
        departmentId,
        departmentName: next?.nameEn ?? null,
      });
    });
  }

  issueTemporaryPassword(actorId: string, id: string, passwordHash: string): Promise<StoredUser> {
    return this.staffAction(actorId, id, (target) => {
      const before = target.mustChangePassword;
      target.passwordHash = passwordHash;
      target.mustChangePassword = true;
      this.record(
        actorId,
        'temporaryPasswordIssued',
        id,
        { mustChangePassword: before },
        { mustChangePassword: true },
      );
    });
  }

  setDisabled(actorId: string, id: string, disabled: boolean): Promise<StoredUser> {
    return this.staffAction(actorId, id, (target, activeManagers) => {
      if (disabled && actorId === id) throw new CannotDisableSelfError();
      if ((target.disabledAt !== null) === disabled) return;
      if (disabled && target.role === 'manager' && activeManagers.every((m) => m === id)) {
        throw new LastActiveManagerError();
      }
      const before = target.disabledAt?.toISOString() ?? null;
      target.disabledAt = disabled ? new Date() : null;
      this.record(
        actorId,
        disabled ? 'accountDisabled' : 'accountEnabled',
        id,
        { disabledAt: before },
        { disabledAt: target.disabledAt?.toISOString() ?? null },
      );
    });
  }

  /** Like the database: the acting manager must be active, and one active manager must remain. */
  private staffAction(
    actorId: string,
    id: string,
    change: (target: Row, activeManagers: string[]) => void,
  ): Promise<StoredUser> {
    const active = [...this.rows.values()]
      .filter((u) => u.role === 'manager' && u.disabledAt === null)
      .map((u) => u.id);
    if (!active.includes(actorId)) return Promise.reject(new ActorNotActiveError());
    const target = this.rows.get(id);
    if (!target || target.role === 'customer') return Promise.reject(new StaffNotFoundError(id));
    const saved = { ...target };
    try {
      change(target, active);
    } catch (error) {
      Object.assign(target, saved);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return Promise.resolve({ ...target });
  }

  private record(
    actorId: string | null,
    action: AuditAction,
    targetId: string,
    before: AuditValues | null,
    after: AuditValues | null,
  ): void {
    this.audit.add({ actorId, action, targetType: 'user', targetId, before, after });
  }
}

function copy<T extends object>(row: T | undefined): T | undefined {
  return row ? { ...row } : undefined;
}
