import type { StaffMember } from '@mixline/shared';
import { Inject, Injectable } from '@nestjs/common';

import { hashPassword } from '../auth/password.js';
import { Sessions } from '../auth/session.js';
import { CannotDisableSelfError, toStaff, USER_STORE, type UserStore } from './user-store.js';

/**
 * A manager's actions on staff accounts (owner, step 16). The store does each one in a single
 * transaction with its lockout check and audit entry. A new temporary password and disabling
 * also end every session of that person at once, so their live connections close too.
 * Changing a worker's department does not (it changes no access yet; doc 05).
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}

  async list(): Promise<StaffMember[]> {
    return (await this.users.listStaff()).map(toStaff);
  }

  async setDepartment(managerId: string, id: string, departmentId: string): Promise<StaffMember> {
    return toStaff(await this.users.setDepartment(managerId, id, departmentId));
  }

  async issueTemporaryPassword(
    managerId: string,
    id: string,
    password: string,
  ): Promise<StaffMember> {
    const user = await this.users.issueTemporaryPassword(
      managerId,
      id,
      await hashPassword(password),
    );
    await this.sessions.endAll(id);
    return toStaff(user);
  }

  async disable(managerId: string, id: string): Promise<StaffMember> {
    // Owner, step 16: always refused, even with other managers left.
    if (managerId === id) throw new CannotDisableSelfError();
    const user = await this.users.setDisabled(managerId, id, true);
    await this.sessions.endAll(id);
    return toStaff(user);
  }

  async enable(managerId: string, id: string): Promise<StaffMember> {
    return toStaff(await this.users.setDisabled(managerId, id, false));
  }
}
