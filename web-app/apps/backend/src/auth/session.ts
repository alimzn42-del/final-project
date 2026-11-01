/**
 * The login session: one row per login in the session store (owner, step 11),
 * and a signed token (JWT, HS256) holding the user id and that row's id, sent
 * as an httpOnly cookie. Page scripts cannot read the cookie, and
 * SameSite=Strict keeps the browser from sending it from other sites.
 *
 * A token counts only while its row exists: logout deletes the row, so a
 * copied token stops working at once; a password change deletes the user's
 * other rows. Listeners (the live push) hear which sessions ended, to close
 * their connections. The user is re-read on every request (access.ts), so a
 * deleted user or a changed role takes effect immediately.
 */
import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';

import type { SessionStore } from './session-store.js';

export const SESSION_COOKIE = 'mixline_session';
const ISSUER = 'mixline';

export interface SessionSettings {
  secret: string;
  hours: number;
  /** Send the cookie over HTTPS only. Off on the lab network (plain HTTP). */
  secureCookie: boolean;
}

export interface Session {
  userId: string;
  sessionId: string;
}

export type SessionsEndedListener = (sessionIds: string[]) => void;

export class Sessions {
  private readonly key: Uint8Array;
  private readonly listeners = new Set<SessionsEndedListener>();

  constructor(
    private readonly settings: SessionSettings,
    private readonly store: SessionStore,
  ) {
    this.key = new TextEncoder().encode(settings.secret);
  }

  /** Starts a session for the user; returns the token for the cookie. */
  async start(userId: string): Promise<string> {
    const now = Date.now();
    // Logins are rare, so this is a cheap moment to forget expired sessions.
    await this.store.deleteExpired(new Date(now));
    const expiresAt = new Date(now + this.settings.hours * 3_600_000);
    const row = await this.store.create(userId, expiresAt);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(row.id)
      .setIssuer(ISSUER)
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(expiresAt)
      .sign(this.key);
  }

  /**
   * The session, or undefined for a missing, forged, expired or malformed
   * token, or one whose session has ended (logout, password change).
   */
  async verify(token: string | undefined): Promise<Session | undefined> {
    const claims = await this.claims(token);
    if (!claims) return undefined;
    const row = await this.store.find(claims.sessionId);
    if (row?.userId !== claims.userId || row.expiresAt.getTime() <= Date.now()) return undefined;
    return claims;
  }

  /** Ends the session of this token (logout). Does nothing for an invalid token. */
  async end(token: string | undefined): Promise<void> {
    const claims = await this.claims(token);
    if (claims && (await this.store.delete(claims.sessionId))) this.tell([claims.sessionId]);
  }

  /** Ends every session of the user except `keep` (password change). */
  async endOthers(keep: Session): Promise<void> {
    const ended = await this.store.deleteOthers(keep.userId, keep.sessionId);
    if (ended.length) this.tell(ended);
  }

  /** Calls `listener` with the ids of sessions that ended; returns a function that stops it. */
  onEnded(listener: SessionsEndedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  cookieOptions(): CookieOptions {
    return { ...this.clearCookieOptions(), maxAge: this.settings.hours * 3_600_000 };
  }

  /** The same cookie attributes without a lifetime, as clearing a cookie needs. */
  clearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.settings.secureCookie,
      path: '/api',
    };
  }

  /** The ids inside a token whose signature, issuer and expiry are valid. */
  private async claims(token: string | undefined): Promise<Session | undefined> {
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      if (!payload.sub || !payload.jti) return undefined;
      return { userId: payload.sub, sessionId: payload.jti };
    } catch {
      return undefined;
    }
  }

  private tell(sessionIds: string[]): void {
    for (const listener of this.listeners) {
      // A broken listener must not undo a logout that already happened.
      try {
        listener(sessionIds);
      } catch {
        // the live push re-checks every connection within a minute anyway
      }
    }
  }
}

/** Reads one cookie from a Cookie header (no extra dependency needed). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}
