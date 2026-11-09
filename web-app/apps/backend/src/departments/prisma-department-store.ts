import type { AuditValues, Department } from '@mixline/shared';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  DepartmentHasWorkersError,
  DepartmentNameTakenError,
  DepartmentNotFoundError,
  type DepartmentStore,
  UUID,
} from './department-store.js';

const withCount = { _count: { select: { workers: true } } } as const;

type Row = Prisma.DepartmentGetPayload<{ include: typeof withCount }>;

/** DepartmentStore on the `departments` table (Prisma). */
export class PrismaDepartmentStore implements DepartmentStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<Department[]> {
    const rows = await this.prisma.department.findMany({
      orderBy: { nameEn: 'asc' },
      include: withCount,
    });
    return rows.map(toDepartment);
  }

  async findById(id: string): Promise<Department | undefined> {
    if (!UUID.test(id)) return undefined;
    const row = await this.prisma.department.findUnique({ where: { id }, include: withCount });
    return row ? toDepartment(row) : undefined;
  }

  async create(input: { nameEn: string; nameAr: string }, actorId: string): Promise<Department> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.department.create({ data: input, include: withCount });
        await record(tx, actorId, 'departmentCreated', row.id, null, names(row));
        return toDepartment(row);
      });
    } catch (error) {
      throw nameTaken(error) ?? error;
    }
  }

  async rename(
    id: string,
    input: { nameEn?: string; nameAr?: string },
    actorId: string,
  ): Promise<Department> {
    if (!UUID.test(id)) throw new DepartmentNotFoundError(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.department.findUniqueOrThrow({ where: { id } });
        const row = await tx.department.update({ where: { id }, data: input, include: withCount });
        const changed = (Object.keys(input) as ('nameEn' | 'nameAr')[]).filter(
          (k) => before[k] !== row[k],
        );
        if (changed.length) {
          const pick = (r: { nameEn: string; nameAr: string }): AuditValues =>
            Object.fromEntries(changed.map((k) => [k, r[k]]));
          await record(tx, actorId, 'departmentRenamed', id, pick(before), pick(row));
        }
        return toDepartment(row);
      });
    } catch (error) {
      if (code(error) === 'P2025') throw new DepartmentNotFoundError(id);
      throw nameTaken(error) ?? error;
    }
  }

  async delete(id: string, actorId: string): Promise<void> {
    if (!UUID.test(id)) throw new DepartmentNotFoundError(id);
    const workers = await this.prisma.user.count({ where: { departmentId: id } });
    if (workers > 0) throw new DepartmentHasWorkersError(workers);
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.department.delete({ where: { id } });
        await record(tx, actorId, 'departmentDeleted', id, names(row), null);
      });
    } catch (error) {
      if (code(error) === 'P2025') throw new DepartmentNotFoundError(id);
      // P2003: a worker was added between the count and the delete; the
      // foreign key refused it.
      if (code(error) === 'P2003') {
        throw new DepartmentHasWorkersError(
          await this.prisma.user.count({ where: { departmentId: id } }),
        );
      }
      throw error;
    }
  }
}

const names = (row: { nameEn: string; nameAr: string }): AuditValues => ({
  nameEn: row.nameEn,
  nameAr: row.nameAr,
});

/** Writes one audit entry inside the caller's transaction. */
async function record(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: 'departmentCreated' | 'departmentRenamed' | 'departmentDeleted',
  targetId: string,
  before: AuditValues | null,
  after: AuditValues | null,
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      actorId,
      action,
      targetType: 'department',
      targetId,
      before: before ?? Prisma.DbNull,
      after: after ?? Prisma.DbNull,
    },
  });
}

function toDepartment(row: Row): Department {
  return { id: row.id, nameEn: row.nameEn, nameAr: row.nameAr, workerCount: row._count.workers };
}

function code(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

/** P2002 = unique constraint violated: which name. */
function nameTaken(error: unknown): DepartmentNameTakenError | undefined {
  if (code(error) !== 'P2002') return undefined;
  const target = JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {});
  return new DepartmentNameTakenError(target.includes('name_ar') ? 'nameAr' : 'nameEn');
}
