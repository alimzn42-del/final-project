import type { Language, Role, Theme } from '@mixline/shared';

import { Prisma, type PrismaClient, type User } from '../generated/prisma/client.js';
import { DepartmentNotFoundError } from '../departments/department-store.js';
import { EmailTakenError, type NewUser, type StoredUser, type UserStore } from './user-store.js';

/** UserStore on the `users` table (Prisma). */
export class PrismaUserStore implements UserStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<StoredUser | undefined> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? toStored(user) : undefined;
  }

  async findById(id: string): Promise<StoredUser | undefined> {
    // Session tokens carry the id; a malformed one must not reach the uuid column.
    if (!UUID.test(id)) return undefined;
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toStored(user) : undefined;
  }

  async create(input: NewUser): Promise<StoredUser> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          locale: input.locale,
          createdById: input.createdById ?? null,
          fullName: input.fullName ?? null,
          mobile: input.mobile ?? null,
          dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
          governorate: input.governorate ?? null,
          country: input.country ?? null,
          cityArea: input.cityArea ?? null,
          occupation: input.occupation ?? null,
          paintPurpose: input.paintPurpose ?? null,
          departmentId: input.departmentId ?? null,
          mustChangePassword: input.mustChangePassword ?? false,
        },
      });
      return toStored(user);
    } catch (error) {
      // P2002 = unique constraint violated (users_email_key).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailTakenError(input.email);
      }
      // P2003 = foreign key: the department does not exist (deleted meanwhile).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new DepartmentNotFoundError(input.departmentId ?? '');
      }
      throw error;
    }
  }

  countByRole(role: Role): Promise<number> {
    return this.prisma.user.count({ where: { role } });
  }

  async setPreferences(
    id: string,
    preferences: { locale?: Language; theme?: Theme | null },
  ): Promise<StoredUser> {
    return toStored(await this.prisma.user.update({ where: { id }, data: preferences }));
  }

  async setPassword(id: string, passwordHash: string): Promise<StoredUser> {
    return toStored(
      await this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: false },
      }),
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toStored(u: User): StoredUser {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    role: u.role,
    locale: u.locale,
    theme: u.theme,
    fullName: u.fullName,
    departmentId: u.departmentId,
    mustChangePassword: u.mustChangePassword,
  };
}
