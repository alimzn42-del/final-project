import type {
  ChangePasswordInput,
  CreateStaffInput,
  LoginInput,
  PublicUser,
  SignupInput,
} from '@mixline/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  DEPARTMENT_STORE,
  DepartmentNotFoundError,
  type DepartmentStore,
} from '../departments/department-store.js';
import { type StoredUser, USER_STORE, type UserStore } from '../users/user-store.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';

/** The checks account's name on the users page. */
export const CHECK_ACCOUNT_NAME = 'Automated checks';

/** The current password given for a password change is wrong. */
export class WrongPasswordError extends Error {}

/**
 * The email and password are right, but a manager disabled the account (owner, step 16). Only
 * told after the password checked out, so a stranger guessing passwords learns nothing.
 */
export class AccountDisabledError extends Error {}

/** Account logic: sign-up, login, staff creation, password change, the first manager. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(DEPARTMENT_STORE) private readonly departments: DepartmentStore,
  ) {}

  /** Always creates a customer, whatever the request contained (doc 03). Recorded (step 16). */
  async signup(input: SignupInput): Promise<StoredUser> {
    return this.users.create(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'customer',
        locale: input.locale,
        fullName: input.fullName,
        mobile: input.mobile,
        dateOfBirth: input.dateOfBirth,
        governorate: input.governorate,
        country: input.country,
        cityArea: input.cityArea,
        occupation: input.occupation,
        paintPurpose: input.paintPurpose,
      },
      { action: 'signedUp' },
    );
  }

  /**
   * The user, or undefined for a wrong email or password. An unknown email
   * still costs one password check, so timing does not reveal which emails
   * have accounts. Throws AccountDisabledError only after a correct password.
   */
  async login(input: LoginInput): Promise<StoredUser | undefined> {
    const user = await this.users.findByEmail(input.email);
    const ok = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    if (!user || !ok) return undefined;
    if (user.disabledAt) throw new AccountDisabledError();
    return user;
  }

  /** A manager creates a manager or worker account. */
  async createStaff(creator: PublicUser, input: CreateStaffInput): Promise<StoredUser> {
    if (input.departmentId && !(await this.departments.findById(input.departmentId))) {
      throw new DepartmentNotFoundError(input.departmentId);
    }
    return this.users.create(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        locale: input.locale,
        fullName: input.fullName,
        departmentId: input.departmentId,
        createdById: creator.id,
        // The password was chosen by the manager: the user must replace it (owner, step 9).
        mustChangePassword: true,
      },
      { action: 'accountCreated', actorId: creator.id },
    );
  }

  /** Replaces the user's password after checking the current one; clears mustChangePassword. */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<StoredUser> {
    const user = await this.users.findById(userId);
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new WrongPasswordError();
    }
    return this.users.setPassword(user.id, await hashPassword(input.newPassword));
  }

  /**
   * The automated checks' own account (owner, step 16: `pnpm live:check`, `telemetry:check` and
   * `web:check` never log in as a person). A worker, never a manager: it may read the line, and
   * it never counts toward the lockout check. Created once by the system, in the first
   * department. Afterwards it is only kept in step with .env: a changed CHECK_PASSWORD replaces
   * its password (recorded, with no actor). It never touches an account it did not create (same
   * email, other role or made by a manager), and never re-enables it if a manager disabled it.
   */
  async seedCheckAccount(
    check: { email: string; password: string } | undefined,
  ): Promise<
    'created' | 'updated' | 'ok' | 'disabled' | 'refused' | 'no department' | 'not configured'
  > {
    if (!check) return 'not configured';
    const existing = await this.users.findByEmail(check.email);
    if (!existing) {
      const [department] = await this.departments.list();
      if (!department) return 'no department';
      await this.users.create(
        {
          email: check.email,
          passwordHash: await hashPassword(check.password),
          role: 'worker',
          locale: 'en',
          fullName: CHECK_ACCOUNT_NAME,
          departmentId: department.id,
        },
        { action: 'accountCreated', actorId: null },
      );
      return 'created';
    }
    // Only the account the system made: a worker that no manager created.
    if (existing.role !== 'worker' || existing.createdById !== null) return 'refused';
    if (existing.disabledAt) return 'disabled';
    const same = await verifyPassword(existing.passwordHash, check.password);
    if (same && !existing.mustChangePassword) return 'ok';
    await this.users.setPassword(existing.id, await hashPassword(check.password), null);
    return 'updated';
  }

  /**
   * Creates the first manager from .env if no manager exists yet, with a
   * temporary password: it must be changed at first login (owner, step 9).
   * The flag is set only here, at creation. Once any manager exists this does
   * nothing, so a restart or a re-run never resets the flag or the password.
   */
  async seedFirstManager(
    first: { email: string; password: string } | undefined,
  ): Promise<'created' | 'exists' | 'not configured'> {
    if ((await this.users.countByRole('manager')) > 0) return 'exists';
    if (!first) return 'not configured';
    // Recorded with no actor: the system created it, from .env.
    await this.users.create(
      {
        email: first.email,
        passwordHash: await hashPassword(first.password),
        role: 'manager',
        locale: 'en',
        mustChangePassword: true,
      },
      { action: 'accountCreated', actorId: null },
    );
    return 'created';
  }
}
