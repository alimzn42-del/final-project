import type { Department } from '@mixline/shared';

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

  async create(input: { nameEn: string; nameAr: string }): Promise<Department> {
    try {
      return toDepartment(await this.prisma.department.create({ data: input, include: withCount }));
    } catch (error) {
      throw nameTaken(error) ?? error;
    }
  }

  async rename(id: string, input: { nameEn?: string; nameAr?: string }): Promise<Department> {
    if (!UUID.test(id)) throw new DepartmentNotFoundError(id);
    try {
      return toDepartment(
        await this.prisma.department.update({ where: { id }, data: input, include: withCount }),
      );
    } catch (error) {
      if (code(error) === 'P2025') throw new DepartmentNotFoundError(id);
      throw nameTaken(error) ?? error;
    }
  }

  async delete(id: string): Promise<void> {
    if (!UUID.test(id)) throw new DepartmentNotFoundError(id);
    const workers = await this.prisma.user.count({ where: { departmentId: id } });
    if (workers > 0) throw new DepartmentHasWorkersError(workers);
    try {
      await this.prisma.department.delete({ where: { id } });
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
