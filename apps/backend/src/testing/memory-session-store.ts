/**
 * TEST-ONLY session store kept in memory, so the HTTP tests run without
 * Docker. Excluded from the build (tsconfig.build.json).
 */
import { randomUUID } from 'node:crypto';

import type { SessionRow, SessionStore } from '../auth/session-store.js';

export class MemorySessionStore implements SessionStore {
  readonly rows = new Map<string, SessionRow>();

  create(userId: string, expiresAt: Date): Promise<SessionRow> {
    const row = { id: randomUUID(), userId, expiresAt };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  }

  find(id: string): Promise<SessionRow | undefined> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : undefined);
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(id));
  }

  deleteOthers(userId: string, keepId: string): Promise<string[]> {
    const ids = [...this.rows.values()]
      .filter((r) => r.userId === userId && r.id !== keepId)
      .map((r) => r.id);
    for (const id of ids) this.rows.delete(id);
    return Promise.resolve(ids);
  }

  deleteExpired(now: Date): Promise<void> {
    for (const [id, row] of this.rows) if (row.expiresAt < now) this.rows.delete(id);
    return Promise.resolve();
  }

  /** The ids of a user's sessions (for tests). */
  idsOf(userId: string): string[] {
    return [...this.rows.values()].filter((r) => r.userId === userId).map((r) => r.id);
  }
}
