import { UUID } from '../departments/department-store.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { SessionRow, SessionStore } from './session-store.js';

const columns = { id: true, userId: true, expiresAt: true } as const;

/** SessionStore on the `sessions` table (Prisma). */
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  create(userId: string, expiresAt: Date): Promise<SessionRow> {
    return this.prisma.session.create({ data: { userId, expiresAt }, select: columns });
  }

  async find(id: string): Promise<SessionRow | undefined> {
    if (!UUID.test(id)) return undefined;
    return (await this.prisma.session.findUnique({ where: { id }, select: columns })) ?? undefined;
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const { count } = await this.prisma.session.deleteMany({ where: { id } });
    return count > 0;
  }

  async deleteOthers(userId: string, keepId: string): Promise<string[]> {
    // One statement, so a login at the same moment is either kept or deleted, never half.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM sessions WHERE user_id = ${userId}::uuid AND id <> ${keepId}::uuid RETURNING id`;
    return rows.map((r) => r.id);
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  }
}
