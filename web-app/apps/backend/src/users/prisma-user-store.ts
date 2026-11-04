import type { AuditAction, AuditValues, Language, Role, Theme } from '@mixline/shared';

import { DepartmentNotFoundError } from '../departments/department-store.js';
import { Prisma, type PrismaClient, type User } from '../generated/prisma/client.js';
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
} from './user-store.js';

type Tx = Prisma.TransactionClient;

/** UserStore on the `users` table (Prisma), with each change and its audit entry in one transaction. */
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

  async create(input: NewUser, audit: CreationAudit): Promise<StoredUser> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = toStored(
          await tx.user.create({
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
          }),
        );
        const actorId = audit.action === 'signedUp' ? user.id : audit.actorId;
        await record(tx, actorId, audit.action, user.id, null, creationValues(user));
        return user;
      });
    } catch (error) {
      // P2002 = unique constraint violated (users_email_key).
      if (code(error) === 'P2002') throw new EmailTakenError(input.email);
      // P2003 = foreign key: the department does not exist (deleted meanwhile).
      if (code(error) === 'P2003') throw new DepartmentNotFoundError(input.departmentId ?? '');
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
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      const user = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: false },
      });
      await record(
        tx,
        id,
        'passwordChanged',
        id,
        { mustChangePassword: before.mustChangePassword },
        { mustChangePassword: false },
      );
      return toStored(user);
    });
  }

  async listStaff(): Promise<StoredUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['manager', 'worker'] } },
    });
    return rows.map(toStored).sort(staffOrder);
  }

  setDepartment(actorId: string, id: string, departmentId: string): Promise<StoredUser> {
    return this.staffAction(actorId, id, async (tx, target) => {
      if (target.role !== 'worker') throw new NotAWorkerError();
      if (!UUID.test(departmentId)) throw new DepartmentNotFoundError(departmentId);
      const next = await tx.department.findUnique({ where: { id: departmentId } });
      if (!next) throw new DepartmentNotFoundError(departmentId);
      if (target.departmentId === departmentId) return toStored(target);
      const previous = target.departmentId
        ? await tx.department.findUnique({ where: { id: target.departmentId } })
        : null;
      const user = await tx.user.update({ where: { id }, data: { departmentId } });
      await record(
        tx,
        actorId,
        'departmentChanged',
        id,
        { departmentId: target.departmentId, departmentName: previous?.nameEn ?? null },
        { departmentId, departmentName: next.nameEn },
      );
      return toStored(user);
    });
  }

  issueTemporaryPassword(actorId: string, id: string, passwordHash: string): Promise<StoredUser> {
    return this.staffAction(actorId, id, async (tx, target) => {
      const user = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      // The password itself is never recorded.
      await record(
        tx,
        actorId,
        'temporaryPasswordIssued',
        id,
        { mustChangePassword: target.mustChangePassword },
        { mustChangePassword: true },
      );
      return toStored(user);
    });
  }

  setDisabled(actorId: string, id: string, disabled: boolean): Promise<StoredUser> {
    return this.staffAction(actorId, id, async (tx, target, activeManagers) => {
      if (disabled && actorId === id) throw new CannotDisableSelfError();
      if ((target.disabledAt !== null) === disabled) return toStored(target);
      if (
        disabled &&
        target.role === 'manager' &&
        activeManagers.filter((m) => m !== id).length === 0
      ) {
        throw new LastActiveManagerError();
      }
      const disabledAt = disabled ? new Date() : null;
      const user = await tx.user.update({ where: { id }, data: { disabledAt } });
      await record(
        tx,
        actorId,
        disabled ? 'accountDisabled' : 'accountEnabled',
        id,
        { disabledAt: target.disabledAt?.toISOString() ?? null },
        { disabledAt: disabledAt?.toISOString() ?? null },
      );
      return toStored(user);
    });
  }

  /**
   * One manager action on a staff account, in one transaction. The managers' rows are locked
   * first (SELECT ... FOR UPDATE), so two managers acting at the same moment take turns: the
   * second sees what the first did. That is what makes the lockout check safe: two managers
   * cannot disable each other at once.
   */
  private async staffAction(
    actorId: string,
    id: string,
    change: (tx: Tx, target: User, activeManagers: string[]) => Promise<StoredUser>,
  ): Promise<StoredUser> {
    if (!UUID.test(id)) throw new StaffNotFoundError(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const managers = await tx.$queryRaw<{ id: string; active: boolean }[]>`
          SELECT id, disabled_at IS NULL AS active FROM users WHERE role = 'manager' FOR UPDATE`;
        const active = managers.filter((m) => m.active).map((m) => m.id);
        if (!active.includes(actorId)) throw new ActorNotActiveError();
        const target = await tx.user.findUnique({ where: { id } });
        if (!target || (target.role !== 'manager' && target.role !== 'worker')) {
          throw new StaffNotFoundError(id);
        }
        const result = await change(tx, target, active);
        // Owner, step 16: never leave the line without an active manager, whatever the action.
        const left = await tx.user.count({ where: { role: 'manager', disabledAt: null } });
        if (left === 0) throw new LastActiveManagerError();
        return result;
      });
    } catch (error) {
      if (code(error) === 'P2003') throw new DepartmentNotFoundError('');
      throw error;
    }
  }
}

/** Writes one audit entry inside the caller's transaction. */
async function record(
  tx: Tx,
  actorId: string | null,
  action: AuditAction,
  targetId: string,
  before: AuditValues | null,
  after: AuditValues | null,
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      actorId,
      action,
      targetType: 'user',
      targetId,
      before: before ?? Prisma.DbNull,
      after: after ?? Prisma.DbNull,
    },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function code(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

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
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
  };
}
