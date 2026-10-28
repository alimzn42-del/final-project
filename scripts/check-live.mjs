// Live check of the push to the web app (plan step 10): socket.io at
// /api/socket.io on the running stack. Run with `pnpm live:check` while
// `pnpm stack:up` is running. Logs in as the first manager from .env.
// Stops the simulator for about 15 s to show that offline is pushed with time
// alone, then starts it again (also when a check fails).
// Exits with code 1 if any check fails.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { io } from 'socket.io-client';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // no .env: use the environment as it is
}
const env = process.env;
const origin = `http://localhost:${env.PORT ?? '3000'}`;
const api = `${origin}/api`;
const PATH = '/api/socket.io';
const SENSORS = 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function compose(...args) {
  return execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Connects like the browser (long-polling first, then upgrade to WebSocket). */
function connect(cookie) {
  return io(origin, {
    path: PATH,
    reconnection: false,
    forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
}

/** The next `event` whose data matches, or an error after `ms`. */
function next(socket, event, match, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      reject(new Error(`no matching "${event}" within ${String(ms / 1000)} s`));
    }, ms);
    const on = (data) => {
      if (!match(data)) return;
      clearTimeout(timer);
      socket.off(event, on);
      resolve(data);
    };
    socket.on(event, on);
  });
}

let cookie = '';
let socket;
let snapshot;

const checks = [
  [
    'the first manager can log in',
    async () => {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: env.MANAGER_EMAIL, password: env.MANAGER_PASSWORD }),
      });
      if (res.status !== 200) throw new Error(`login answered ${String(res.status)}`);
      cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
      const me = await (await fetch(`${api}/auth/me`, { headers: { cookie } })).json();
      if (me.mustChangePassword) {
        throw new Error(
          'the first manager still has its temporary password: log in once and change it, ' +
            'then put the new password in MANAGER_PASSWORD for this check',
        );
      }
    },
  ],
  [
    'a visitor without a session is refused (LOGIN_REQUIRED)',
    async () => {
      const visitor = connect();
      try {
        const message = await new Promise((resolve, reject) => {
          visitor.once('connect_error', (error) => resolve(error.message));
          visitor.once('connect', () => reject(new Error('the connection was accepted')));
        });
        if (message !== 'LOGIN_REQUIRED') throw new Error(`refused with "${message}"`);
      } finally {
        visitor.disconnect();
      }
    },
  ],
  [
    `the manager gets a snapshot on connect: ${String(SENSORS)} readings and every state`,
    async () => {
      socket = connect(cookie);
      snapshot = await new Promise((resolve, reject) => {
        socket.once('snapshot', resolve);
        socket.once('connect_error', reject);
        setTimeout(() => reject(new Error('no snapshot within 5 s')), 5000);
      });
      const readings = Object.keys(snapshot.readings).length;
      const states = Object.keys(snapshot.states.sensors).length;
      if (readings !== SENSORS || states !== SENSORS) {
        throw new Error(`${String(readings)} readings, ${String(states)} sensor states`);
      }
      if (snapshot.states.line !== 'ok') throw new Error(`line is ${snapshot.states.line}`);
      await sleep(1000);
      return `line ok; transport now ${socket.io.engine.transport.name}`;
    },
  ],
  [
    'GET /api/state agrees: line ok, every sensor ok',
    async () => {
      const res = await fetch(`${api}/state`, { headers: { cookie } });
      if (res.status !== 200) throw new Error(`answered ${String(res.status)}`);
      const body = await res.json();
      const notOk = Object.entries(body.sensors).filter(([, s]) => s !== 'ok');
      if (body.line !== 'ok' || notOk.length) {
        throw new Error(`line ${body.line}; not ok: ${notOk.map(([id]) => id).join(', ')}`);
      }
    },
  ],
  [
    // The backend checks every 0.5 s and sends only when something is new. The simulator
    // publishes once a second, so batches come about every second here.
    'readings batched (never closer than 0.5 s), keeping up, only what is new',
    async () => {
      const batches = [];
      const onReadings = (data) => batches.push({ at: Date.now(), data });
      socket.on('readings', onReadings);
      await sleep(5000);
      socket.off('readings', onReadings);

      const gaps = batches.slice(1).map((b, i) => b.at - batches[i].at);
      const minGap = Math.min(...gaps);
      const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (batches.length < 4 || minGap < 400 || meanGap > 1100) {
        throw new Error(
          `${String(batches.length)} batches, ${minGap.toFixed(0)} to ${meanGap.toFixed(0)} ms apart`,
        );
      }
      // A reading is new if the sensor's previous one (snapshot or batch) was received earlier.
      const last = new Map(Object.entries(snapshot.readings).map(([id, r]) => [id, r.receivedAt]));
      let repeats = 0;
      for (const { data } of batches) {
        for (const [id, r] of Object.entries(data)) {
          if (last.get(id) === r.receivedAt) repeats++;
          last.set(id, r.receivedAt);
        }
      }
      if (repeats) throw new Error(`${String(repeats)} readings were sent again`);
      const sizes = batches.map((b) => JSON.stringify(b.data).length);
      const perBatch = batches.map((b) => Object.keys(b.data).length);
      const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0);
      return (
        `${String(batches.length)} batches, at least ${minGap.toFixed(0)} ms apart, ` +
        `${mean(perBatch)} sensors and ${mean(sizes)} bytes per batch on average`
      );
    },
  ],
  [
    'state changes are pushed: simulator stopped -> offline, started -> ok',
    async () => {
      const stoppedAt = Date.now();
      const offline = next(socket, 'states', (s) => s.line === 'offline', 20_000);
      compose('stop', 'simulator');
      try {
        const changes = await offline;
        const offlineAfter = (Date.now() - stoppedAt) / 1000;
        if (changes.sensors && Object.values(changes.sensors).some((s) => s !== 'offline')) {
          throw new Error('a change other than offline was pushed');
        }
        const startedAt = Date.now();
        const back = next(socket, 'states', (s) => s.line === 'ok', 30_000);
        compose('start', 'simulator');
        await back;
        const okAfter = (Date.now() - startedAt) / 1000;
        return `offline ${offlineAfter.toFixed(1)} s after the stop, ok ${okAfter.toFixed(1)} s after the start`;
      } finally {
        compose('start', 'simulator');
      }
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    const detail = await run();
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
socket?.disconnect();
console.log(failed ? `\n${String(failed)} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
