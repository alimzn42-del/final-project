/**
 * TEST-ONLY audit log in memory, shared by the memory user and department stores, so the HTTP
 * tests can read what was recorded. Append-only like the real one: entries are frozen copies.
 * Excluded from the build (tsconfig.build.json).
 */
import type { AuditEntry } from '@mixline/shared';

export class MemoryAuditLog {
  private readonly list: Readonly<AuditEntry>[] = [];

  add(entry: AuditEntry): void {
    this.list.push(Object.freeze({ ...entry }));
  }

  get entries(): readonly Readonly<AuditEntry>[] {
    return [...this.list];
  }

  /** The entries about one account or department, oldest first. */
  about(targetId: string): readonly Readonly<AuditEntry>[] {
    return this.list.filter((e) => e.targetId === targetId);
  }
}
