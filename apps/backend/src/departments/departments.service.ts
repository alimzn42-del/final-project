import type { CreateDepartmentInput, Department, RenameDepartmentInput } from '@mixline/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  DEPARTMENT_STORE,
  DepartmentNameTakenError,
  type DepartmentStore,
} from './department-store.js';

/**
 * Department rules on top of the store: names are unique ignoring letter case
 * ("quality" and "Quality" are the same department); the database adds an
 * exact-match unique index and the delete protection.
 */
@Injectable()
export class DepartmentsService {
  constructor(@Inject(DEPARTMENT_STORE) private readonly store: DepartmentStore) {}

  list(): Promise<Department[]> {
    return this.store.list();
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    await this.refuseTakenNames(input);
    return this.store.create(input);
  }

  async rename(id: string, input: RenameDepartmentInput): Promise<Department> {
    await this.refuseTakenNames(input, id);
    return this.store.rename(id, input);
  }

  delete(id: string): Promise<void> {
    return this.store.delete(id);
  }

  private async refuseTakenNames(
    input: { nameEn?: string | undefined; nameAr?: string | undefined },
    exceptId?: string,
  ): Promise<void> {
    const others = (await this.store.list()).filter((d) => d.id !== exceptId);
    const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
    const { nameEn, nameAr } = input;
    if (nameEn !== undefined && others.some((d) => same(d.nameEn, nameEn))) {
      throw new DepartmentNameTakenError('nameEn');
    }
    if (nameAr !== undefined && others.some((d) => same(d.nameAr, nameAr))) {
      throw new DepartmentNameTakenError('nameAr');
    }
  }
}
