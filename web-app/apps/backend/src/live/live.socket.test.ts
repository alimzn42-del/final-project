import { randomUUID } from 'node:crypto';

import {
  LIVE_PATH,
  type LiveReadings,
  type LiveSnapshot,
  type LiveStates,
  type Machine,
  OFFLINE_AFTER_MS,
  type Role,
} from '@mixline/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../auth/password.js';
import { SESSION_COOKIE, Sessions } from '../auth/session.js';
import { MACHINE } from '../machine/machine.tokens.js';
import { MemorySessionStore } from '../testing/memory-session-store.js';
import { StateService } from '../state/state.service.js';
import { TelemetryIngest } from '../telemetry/ingest.js';
import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { LiveGateway } from './live.gateway.js';

describe('live push (socket.io)', () => {
  let t: TestApp;
  let origin: string;
  let manager: string;
  let live: LiveGateway;
  let state: StateService;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await startTestApp();
    origin = await t.app.getUrl();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    live = t.app.get(LiveGateway);
    state = t.app.get(StateService);
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await t.close();
  });

  /** A session cookie signed like a real login; `hours` sets its lifetime. */
  async function cookieFor(userId: string, hours = 8): Promise<string> {
    const sessions = new Sessions(
      { secret: TEST_ENV.JWT_SECRET, hours, secureCookie: false },
      t.sessions,
    );
    return `${SESSION_COOKIE}=${await sessions.start(userId)}`;
  }

  /** A user straight in the store, logged in. */
  async function user(role: Role, mustChangePassword = false) {
    const row = await t.store.create({
      email: `${randomUUID()}@lab.sy`,
      passwordHash: 'not used',
      role,
      locale: 'en',
      departmentId: role === 'worker' ? t.departments.idOf('Production') : undefined,
      mustChangePassword,
    });
    return { id: row.id, cookie: await cookieFor(row.id) };
  }

  /** Opens a connection like the web app (the browser sends the cookie by itself). */
  function open(cookie?: string): Socket {
    const socket = io(origin, {
      path: LIVE_PATH,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: cookie ? { cookie } : {},
    });
    sockets.push(socket);
    return socket;
  }

  /** An accepted connection; `snapshot` settles with its first event. */
  function connect(cookie?: string) {
    const socket = open(cookie);
    const snapshot = new Promise<LiveSnapshot>((resolve, reject) => {
      socket.once('snapshot', resolve);
      socket.once('connect_error', reject);
    });
    return { socket, snapshot };
  }

  /** The connect_error message, or a failure if the connection was accepted. */
  function refusal(cookie?: string): Promise<string> {
    const socket = open(cookie);
    return new Promise((resolve, reject) => {
      socket.once('connect_error', (error) => {
        resolve(error.message);
      });
      socket.once('connect', () => {
        reject(new Error('the connection was accepted'));
      });
    });
  }

  /** The next `event` whose data matches. */
  function next<T>(socket: Socket, event: string, match: (data: T) => boolean): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, on);
        reject(new Error(`no matching "${event}" within 3 s`));
      }, 3000);
      const on = (data: T) => {
        if (!match(data)) return;
        clearTimeout(timer);
        socket.off(event, on);
        resolve(data);
      };
      socket.on(event, on);
    });
  }

  const closed = (socket: Socket) =>
    new Promise<string>((resolve) => socket.once('disconnect', resolve));

  /** As if the broker delivered a message now. */
  const publish = (variable: string, value: number, unit: string) =>
    t.app
      .get(TelemetryIngest)
      .handle(
        `lab/mixline/mixer/sensors/${variable}`,
        JSON.stringify({ ts: new Date().toISOString(), value, unit, source: 'sim' }),
      );

  describe('who may connect', () => {
    it('refuses anonymous visitors, forged and expired sessions: LOGIN_REQUIRED', async () => {
      const { id } = await user('worker');
      const forged = await new Sessions(
        { secret: 'another-secret-that-is-long-enough-0000', hours: 8, secureCookie: false },
        new MemorySessionStore(),
      ).start(id);
      expect(await refusal()).toBe('LOGIN_REQUIRED');
      expect(await refusal(`${SESSION_COOKIE}=${forged}`)).toBe('LOGIN_REQUIRED');
      expect(await refusal(await cookieFor(id, -1))).toBe('LOGIN_REQUIRED');
    });

    it('refuses a deleted user even with a valid session', async () => {
      const { id, cookie } = await user('worker');
      t.store.rows.delete(id);
      expect(await refusal(cookie)).toBe('LOGIN_REQUIRED');
    });

    it('refuses customers: FORBIDDEN', async () => {
      expect(await refusal((await user('customer')).cookie)).toBe('FORBIDDEN');
    });

    it('refuses staff with a temporary password: PASSWORD_CHANGE_REQUIRED', async () => {
      expect(await refusal((await user('worker', true)).cookie)).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('accepts managers (real login) and workers, with a snapshot of everything', async () => {
      publish('mass', 1800, 'g');
      state.update();
      const sensorCount = t.app.get<Machine>(MACHINE).components.flatMap((c) => c.sensors).length;

      const fromManager = await connect(manager).snapshot;
      const fromWorker = await connect((await user('worker')).cookie).snapshot;
      for (const snap of [fromManager, fromWorker]) {
        expect(snap.readings['vessel.mass']?.value).toBe(1800);
        expect(snap.states.sensors['vessel.mass']).toBe('ok');
        expect(Object.keys(snap.states.sensors)).toHaveLength(sensorCount);
      }
    });
  });

  describe('what is pushed', () => {
    it('readings every 0.5 s, only the sensors with something new', async () => {
      const { socket, snapshot } = connect(manager);
      await snapshot;
      live.pushReadings(); // send anything older now, so the next batch holds only what follows

      const start = Date.now();
      publish('mass', 1801, 'g');
      const first = await next<LiveReadings>(
        socket,
        'readings',
        (r) => r['vessel.mass']?.value === 1801,
      );
      expect(Date.now() - start).toBeLessThan(1000);
      expect(Object.keys(first)).toEqual(['vessel.mass']);

      publish('mixer_rpm', 180, 'rpm');
      const second = await next<LiveReadings>(socket, 'readings', (r) => 'mixer.rpm' in r);
      expect(Object.keys(second)).toEqual(['mixer.rpm']); // the mass is not sent again
    });

    it('state changes only, within a second', async () => {
      const { socket, snapshot } = connect(manager);
      const before = (await snapshot).states;
      expect(before.sensors['basePump.on']).toBe('offline'); // nothing heard yet

      publish('base_pump_on', 0, 'bool');
      const changes = await next<LiveStates>(
        socket,
        'states',
        (s) => s.sensors?.['basePump.on'] === 'ok',
      );
      expect(changes.sensors).not.toHaveProperty('vessel.mass'); // unchanged, not sent
    });

    it('offline with time alone, with no new message', async () => {
      const { socket, snapshot } = connect(manager);
      await snapshot;
      publish('mass', 1802, 'g');
      state.update();
      const offline = next<LiveStates>(
        socket,
        'states',
        (s) => s.sensors?.['vessel.mass'] === 'offline',
      );
      state.update(Date.now() + OFFLINE_AFTER_MS + 1);
      await offline;
    });
  });

  describe('every minute: the same check again', () => {
    it('closes deleted users, changed roles, reset passwords and expired sessions; keeps the rest', async () => {
      const deleted = await user('worker');
      const demoted = await user('worker');
      const reset = await user('worker');
      const shortLived = await user('manager');
      shortLived.cookie = await cookieFor(shortLived.id, 2 / 3600); // 2 seconds

      const open = await Promise.all(
        [deleted, demoted, reset, shortLived].map(async (u) => {
          const c = connect(u.cookie);
          await c.snapshot;
          return c.socket;
        }),
      );
      const stays = connect(manager);
      await stays.snapshot;

      t.store.rows.delete(deleted.id);
      const demotedRow = t.store.rows.get(demoted.id);
      const resetRow = t.store.rows.get(reset.id);
      if (!demotedRow || !resetRow) throw new Error('test users missing');
      demotedRow.role = 'customer';
      resetRow.mustChangePassword = true;
      await new Promise((r) => setTimeout(r, 2100)); // let the short session expire

      const reasons = Promise.all(open.map(closed));
      await live.recheck();
      expect(await reasons).toEqual(Array<string>(4).fill('io server disconnect'));
      expect(stays.socket.connected).toBe(true);
    }, 10_000);
  });

  describe('a session that ends closes its connections at once (owner, step 11)', () => {
    it('logout closes that session’s connection; the same user’s other device stays', async () => {
      const phone = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
      const laptop = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
      const onPhone = connect(phone);
      const onLaptop = connect(laptop);
      await Promise.all([onPhone.snapshot, onLaptop.snapshot]);

      const reason = closed(onPhone.socket);
      expect((await t.call('POST', '/auth/logout', undefined, phone)).status).toBe(204);
      expect(await reason).toBe('io server disconnect'); // no re-check needed
      expect(onLaptop.socket.connected).toBe(true);
      expect(await refusal(phone)).toBe('LOGIN_REQUIRED'); // the copied cookie cannot reconnect
    });

    it('a password change closes the other devices’ connections; this device stays', async () => {
      const email = `${randomUUID()}@lab.sy`;
      await t.store.create({
        email,
        passwordHash: await hashPassword('worker-pass-1'),
        role: 'worker',
        locale: 'en',
        departmentId: t.departments.idOf('Production'),
      });
      const here = await t.login(email, 'worker-pass-1');
      const other = await t.login(email, 'worker-pass-1');
      const onHere = connect(here);
      const onOther = connect(other);
      await Promise.all([onHere.snapshot, onOther.snapshot]);

      const reason = closed(onOther.socket);
      const changed = await t.call(
        'POST',
        '/auth/change-password',
        { currentPassword: 'worker-pass-1', newPassword: 'worker-pass-2' },
        here,
      );
      expect(changed.status).toBe(200);
      expect(await reason).toBe('io server disconnect');
      expect(onHere.socket.connected).toBe(true);
    });
  });
});
