/**
 * Where login sessions are kept, one row per login (owner, step 11): the
 * database in the app (PrismaSessionStore), memory in the HTTP tests.
 */

export const SESSION_STORE = Symbol('SESSION_STORE');

export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface SessionStore {
  create(userId: string, expiresAt: Date): Promise<SessionRow>;
  /** Undefined for an unknown id. Does not check the expiry. */
  find(id: string): Promise<SessionRow | undefined>;
  /** Deletes one session; returns false if it was already gone. */
  delete(id: string): Promise<boolean>;
  /** Deletes every session of the user except `keepId`; returns the deleted ids. */
  deleteOthers(userId: string, keepId: string): Promise<string[]>;
  /** Deletes the sessions that expired before `now`. */
  deleteExpired(now: Date): Promise<void>;
}
