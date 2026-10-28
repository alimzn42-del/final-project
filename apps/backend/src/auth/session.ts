/**
 * The login session: a signed token (JWT, HS256) holding only the user id,
 * sent as an httpOnly cookie. Page scripts cannot read the cookie, and
 * SameSite=Strict keeps the browser from sending it from other sites.
 * The user is re-read from the database on every request (auth.guard.ts),
 * so a deleted user or a changed role takes effect immediately.
 */
import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'mixline_session';
const ISSUER = 'mixline';

export interface SessionSettings {
  secret: string;
  hours: number;
  /** Send the cookie over HTTPS only. Off on the lab network (plain HTTP). */
  secureCookie: boolean;
}

export class Sessions {
  private readonly key: Uint8Array;

  constructor(private readonly settings: SessionSettings) {
    this.key = new TextEncoder().encode(settings.secret);
  }

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${String(this.settings.hours)}h`)
      .sign(this.key);
  }

  /** The user id, or undefined for a missing, forged, expired or malformed token. */
  async verify(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      return payload.sub;
    } catch {
      return undefined;
    }
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
