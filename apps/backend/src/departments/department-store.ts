/**
 * Where departments are kept: the database in the app (PrismaDepartmentStore),
 * memory in the HTTP tests. A department that still has workers is never
 * deleted; the database enforces it too (foreign key, ON DELETE RESTRICT).
 */
import type { Department } from '@mixline/shared';

export const DEPARTMENT_STORE = Symbol('DEPARTMENT_STORE');

export class DepartmentNotFoundError extends Error {
  constructor(id: string) {
    super(`no department ${id}`);
  }
}

export class DepartmentNameTakenError extends Error {
  constructor(readonly field: 'nameEn' | 'nameAr') {
    super(`department name already used (${field})`);
  }
}

export class DepartmentHasWorkersError extends Error {
  constructor(readonly workers: number) {
    super(
      workers === 1
        ? 'cannot delete: 1 worker is in this department'
        : `cannot delete: ${String(workers)} workers are in this department`,
    );
  }
}

export interface DepartmentStore {
  /** Sorted by English name, each with its number of workers. */
  list(): Promise<Department[]>;
  findById(id: string): Promise<Department | undefined>;
  /** Throws DepartmentNameTakenError. */
  create(input: { nameEn: string; nameAr: string }): Promise<Department>;
  /** Throws DepartmentNotFoundError, DepartmentNameTakenError. */
  rename(id: string, input: { nameEn?: string; nameAr?: string }): Promise<Department>;
  /** Throws DepartmentNotFoundError, DepartmentHasWorkersError. */
  delete(id: string): Promise<void>;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
