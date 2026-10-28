// Live check of the web app behind nginx (plan step 11), the way a browser on
// the lab network uses it: http://localhost:WEB_PORT only, never the backend's
// own port. Run with `pnpm web:check` while `pnpm stack:up` is running. Logs in
// as the first manager from .env.
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
const web = `http://localhost:${env.WEB_PORT ?? '8080'}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, cookie) {
  const res = await fetch(`${web}${path}`, { headers: cookie ? { cookie } : {} });
  return { res, text: await res.text() };
}

async function login() {
  const res = await fetch(`${web}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.MANAGER_EMAIL, password: env.MANAGER_PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login answered ${String(res.status)}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

/** Connects like the browser (long-polling first, then upgrade to WebSocket); resolves with the snapshot. */
function connectLive(cookie) {
  const socket = io(web, {
    path: '/api/socket.io',
    reconnection: false,
    forceNew: true,
    extraHeaders: { cookie },
  });
  const snapshot = new Promise((resolve, reject) => {
    socket.once('snapshot', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('no snapshot within 5 s')), 5000);
  });
  return { socket, snapshot };
}

let indexHtml = '';

const checks = [
  [
    'the web app is served, with its security headers and no caching of the page',
    async () => {
      const { res, text } = await get('/');
      if (res.status !== 200 || !text.includes('<div id="root">')) {
        throw new Error(`answered ${String(res.status)} without the app`);
      }
      indexHtml = text;
      const expected = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'same-origin',
        'cache-control': 'no-cache',
      };
      for (const [name, value] of Object.entries(expected)) {
        if (res.headers.get(name) !== value)
          throw new Error(`${name}: ${String(res.headers.get(name))}`);
      }
    },
  ],
  [
    'a page address opened directly (/line/mixingColor) gets the app, not 404',
    async () => {
      const { res, text } = await get('/line/mixingColor');
      if (res.status !== 200 || !text.includes('<div id="root">')) {
        throw new Error(`answered ${String(res.status)}`);
      }
    },
  ],
  [
    'the built script is served and cached for a year (its name changes with every build)',
    async () => {
      const script = /src="(\/assets\/[^"]+\.js)"/.exec(indexHtml)?.[1];
      if (!script) throw new Error('no script in index.html');
      const { res } = await get(script);
      const cache = res.headers.get('cache-control') ?? '';
      if (res.status !== 200 || !cache.includes('immutable')) {
        throw new Error(`answered ${String(res.status)}, cache-control "${cache}"`);
      }
      return script;
    },
  ],
  [
    'the API through nginx: health, and the Arabic labels',
    async () => {
      const health = await get('/api/health');
      if (health.res.status !== 200)
        throw new Error(`health answered ${String(health.res.status)}`);
      const ar = JSON.parse((await get('/api/locales/ar')).text);
      if (ar['brand.name'] !== 'ألماس')
        throw new Error(`brand.name is "${String(ar['brand.name'])}"`);
    },
  ],
  [
    'the manager logs in through nginx; the live push connects and upgrades to WebSocket',
    async () => {
      const cookie = await login();
      if ((await get('/api/auth/me', cookie)).res.status !== 200) throw new Error('/me refused');
      const { socket, snapshot } = connectLive(cookie);
      try {
        const snap = await snapshot;
        await sleep(1000);
        const transport = socket.io.engine.transport.name;
        if (transport !== 'websocket') throw new Error(`transport is ${transport}`);
        return `${String(Object.keys(snap.readings).length)} readings in the snapshot, line ${snap.states.line}`;
      } finally {
        socket.disconnect();
      }
    },
  ],
  [
    'logout (owner, step 11): the copied cookie gets 401, its live connection closes at once',
    async () => {
      const cookie = await login();
      const other = await login(); // the same user on another device
      const live = connectLive(cookie);
      const otherLive = connectLive(other);
      await Promise.all([live.snapshot, otherLive.snapshot]);
      const closed = new Promise((resolve) => live.socket.once('disconnect', resolve));
      const started = Date.now();
      const out = await fetch(`${web}/api/auth/logout`, { method: 'POST', headers: { cookie } });
      try {
        if (out.status !== 204) throw new Error(`logout answered ${String(out.status)}`);
        const reason = await Promise.race([closed, sleep(3000).then(() => 'still open')]);
        if (reason !== 'io server disconnect')
          throw new Error(`live connection: ${String(reason)}`);
        const copied = (await get('/api/auth/me', cookie)).res.status;
        if (copied !== 401) throw new Error(`the copied cookie answered ${String(copied)}`);
        if ((await get('/api/auth/me', other)).res.status !== 200) {
          throw new Error('the other device was logged out too');
        }
        if (!otherLive.socket.connected)
          throw new Error("the other device's live connection closed");
        return `closed ${String(Date.now() - started)} ms after the logout; the other device stays in`;
      } finally {
        live.socket.disconnect();
        otherLive.socket.disconnect();
        await fetch(`${web}/api/auth/logout`, { method: 'POST', headers: { cookie: other } });
      }
    },
  ],
  [
    "the backend's own port is reachable from this computer only",
    async () => {
      const binding = execFileSync('docker', ['compose', 'port', 'backend', '3000'], {
        encoding: 'utf8',
      }).trim();
      if (!binding.startsWith('127.0.0.1:')) throw new Error(`published on ${binding}`);
      return binding;
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
console.log(failed ? `\n${String(failed)} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
