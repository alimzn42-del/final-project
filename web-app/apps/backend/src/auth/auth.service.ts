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

/** The current password given for a password change is wrong. */
export class WrongPasswordError extends Error {}

/** Account logic: sign-up, login, staff creation, password change, the first manager. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(DEPARTMENT_STORE) private readonly departments: DepartmentStore,
  ) {}

  /** Always creates a customer, whatever the request contained (doc 03). */
  async signup(input: SignupInput): Promise<StoredUser> {
    return this.users.create({
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
    });
  }

  /**
   * The user, or undefined for a wrong email or password. An unknown email
   * still costs one password check, so timing does not reveal which emails
   * have accounts.
   */
  async login(input: LoginInput): Promise<StoredUser | undefined> {
    const user = await this.users.findByEmail(input.email);
    const ok = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    return user && ok ? user : undefined;
  }

  /** A manager creates a manager or worker account. */
  async createStaff(creator: PublicUser, input: CreateStaffInput): Promise<StoredUser> {
    if (input.departmentId && !(await this.departments.findById(input.departmentId))) {
      throw new DepartmentNotFoundError(input.departmentId);
    }
    return this.users.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      locale: input.locale,
      fullName: input.fullName,
      departmentId: input.departmentId,
      createdById: creator.id,
      // The password was chosen by the manager: the user must replace it (owner, step 9).
      mustChangePassword: true,
    });
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
    await this.users.create({
      email: first.email,
      passwordHash: await hashPassword(first.password),
      role: 'manager',
      locale: 'en',
      mustChangePassword: true,
    });
    return 'created';
  }
}
