/**
 * TEST-ONLY helpers: start the real app on a free port with an in-memory user
 * store, and call it over HTTP like a browser (JSON body, session cookie).
 * Excluded from the build (tsconfig.build.json).
 */
import type { INestApplication } from '@nestjs/common';

import { DEFAULT_RATE_LIMITS, type RateLimits } from '../app.module.js';
import { createApp } from '../bootstrap.js';
import { MemoryTelemetryStore } from './memory-telemetry-store.js';
import { MemoryUserStore } from './memory-user-store.js';

export const TEST_ENV = {
  JWT_SECRET: 'test-secret-that-is-long-enough-0123456789',
  MANAGER_EMAIL: 'boss@lab.sy',
  MANAGER_PASSWORD: 'manager-pass-1',
};

/** High enough that ordinary tests never hit them. */
export const GENEROUS_LIMITS: RateLimits = {
  login: { limit: 1000, ttl: 60_000 },
  signup: { limit: 1000, ttl: 60_000 },
};

export interface Reply {
  status: number;
  body: unknown;
  /** The raw Set-Cookie header, if any. */
  setCookie: string | null;
  /** "name=value" from Set-Cookie, ready to send back. */
  cookie: string | undefined;
}

export interface TestApp {
  app: INestApplication;
  store: MemoryUserStore;
  telemetry: MemoryTelemetryStore;
  call(method: string, path: string, body?: unknown, cookie?: string): Promise<Reply>;
  /** Logs in and returns the session cookie. */
  login(email: string, password: string): Promise<string>;
  close(): Promise<void>;
}

export async function startTestApp(
  options: { env?: Record<string, string>; rateLimits?: RateLimits } = {},
): Promise<TestApp> {
  const store = new MemoryUserStore();
  const telemetry = new MemoryTelemetryStore();
  const { app } = await createApp(options.env ?? TEST_ENV, {
    userStore: store,
    telemetryStore: telemetry,
    rateLimits: options.rateLimits ?? GENEROUS_LIMITS,
    logs: false,
  });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;

  const call: TestApp['call'] = async (method, path, body, cookie) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const setCookie = res.headers.get('set-cookie');
    return {
      status: res.status,
      body: text ? (JSON.parse(text) as unknown) : undefined,
      setCookie,
      cookie: setCookie?.split(';')[0],
    };
  };

  const login: TestApp['login'] = async (email, password) => {
    const reply = await call('POST', '/auth/login', { email, password });
    if (reply.status !== 200 || !reply.cookie) {
      throw new Error(`login failed: ${String(reply.status)}`);
    }
    return reply.cookie;
  };

  return { app, store, telemetry, call, login, close: () => app.close() };
}

export { DEFAULT_RATE_LIMITS };
