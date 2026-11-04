/**
 * TEST-ONLY department store in memory. It mirrors the database: the same
 * three starting departments (as the migration inserts them), unique names,
 * and no delete while workers are in a department. Excluded from the build.
 */
import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditValues, Department } from '@mixline/shared';

import {
  DepartmentHasWorkersError,
  DepartmentNameTakenError,
  DepartmentNotFoundError,
  type DepartmentStore,
} from '../departments/department-store.js';
import { MemoryAuditLog } from './memory-audit-log.js';

interface Row {
  id: string;
  nameEn: string;
  nameAr: string;
}

export class MemoryDepartmentStore implements DepartmentStore {
  readonly rows = new Map<string, Row>();
  /** Set by MemoryUserStore: how many workers are in a department. */
  workersIn: (departmentId: string) => number = () => 0;

  constructor(readonly audit: MemoryAuditLog = new MemoryAuditLog()) {
    for (const [nameEn, nameAr] of [
      ['Maintenance', 'الصيانة'],
      ['Production', 'الإنتاج'],
      ['Quality', 'الجودة'],
    ] as const) {
      const id = randomUUID();
      this.rows.set(id, { id, nameEn, nameAr });
    }
  }

  /** The id of a department by its English name (tests). */
  idOf(nameEn: string): string {
    const row = [...this.rows.values()].find((r) => r.nameEn === nameEn);
    if (!row) throw new Error(`no department ${nameEn}`);
    return row.id;
  }

  list(): Promise<Department[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
        .map((r) => this.view(r)),
    );
  }

  findById(id: string): Promise<Department | undefined> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? this.view(row) : undefined);
  }

  create(input: { nameEn: string; nameAr: string }, actorId: string): Promise<Department> {
    const taken = this.taken(input);
    if (taken) return Promise.reject(taken);
    const row = { id: randomUUID(), ...input };
    this.rows.set(row.id, row);
    this.record(actorId, 'departmentCreated', row.id, null, { ...input });
    return Promise.resolve(this.view(row));
  }

  rename(
    id: string,
    input: { nameEn?: string; nameAr?: string },
    actorId: string,
  ): Promise<Department> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new DepartmentNotFoundError(id));
    const taken = this.taken(input, id);
    if (taken) return Promise.reject(taken);
    const changed = (Object.keys(input) as ('nameEn' | 'nameAr')[]).filter(
      (k) => input[k] !== row[k],
    );
    const before: AuditValues = Object.fromEntries(changed.map((k) => [k, row[k]]));
    Object.assign(row, input);
    if (changed.length) {
      const after: AuditValues = Object.fromEntries(changed.map((k) => [k, row[k]]));
      this.record(actorId, 'departmentRenamed', id, before, after);
    }
    return Promise.resolve(this.view(row));
  }

  delete(id: string, actorId: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new DepartmentNotFoundError(id));
    const workers = this.workersIn(id);
    if (workers > 0) return Promise.reject(new DepartmentHasWorkersError(workers));
    this.rows.delete(id);
    this.record(actorId, 'departmentDeleted', id, { nameEn: row.nameEn, nameAr: row.nameAr }, null);
    return Promise.resolve();
  }

  private record(
    actorId: string,
    action: AuditAction,
    targetId: string,
    before: AuditValues | null,
    after: AuditValues | null,
  ): void {
    this.audit.add({ actorId, action, targetType: 'department', targetId, before, after });
  }

  private view(row: Row): Department {
    return { ...row, workerCount: this.workersIn(row.id) };
  }

  /** Exact-match uniqueness, like the database's unique indexes. */
  private taken(input: { nameEn?: string; nameAr?: string }, exceptId?: string) {
    const others = [...this.rows.values()].filter((r) => r.id !== exceptId);
    if (input.nameEn !== undefined && others.some((r) => r.nameEn === input.nameEn)) {
      return new DepartmentNameTakenError('nameEn');
    }
    if (input.nameAr !== undefined && others.some((r) => r.nameAr === input.nameAr)) {
      return new DepartmentNameTakenError('nameAr');
    }
    return undefined;
  }
}
