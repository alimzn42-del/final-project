// Live check of the telemetry path (plan step 9): simulator -> MQTT -> backend
// -> TimescaleDB -> API. Run with `pnpm telemetry:check` while `pnpm stack:up`
// is running. Logs in as the first manager from .env. Also sends broken
// messages and a reading from a device whose clock is an hour off, to show the
// backend drops the first without crashing and logs the second.
// Exits with code 1 if any check fails.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // no .env: use the environment as it is
}
const env = process.env;
const api = `http://localhost:${env.PORT ?? '3000'}/api`;
const GARBAGE = 987654321;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function compose(...args) {
  return execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Runs SQL in the app database; returns the single value. */
function sql(query) {
  return compose(
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$0"',
    query,
  );
}

/** Publishes one message with the broker's own client, logged in from .env. */
function publish(topic, message) {
  compose(
    'exec',
    '-T',
    'mqtt',
    'sh',
    '-c',
    'mosquitto_pub -h localhost -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "$0" -m "$1"',
    topic,
    message,
  );
}

let cookie = '';
async function get(path) {
  const res = await fetch(`${api}${path}`, { headers: { cookie } });
  return { status: res.status, body: res.status === 200 ? await res.json() : undefined };
}

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
    },
  ],
  [
    'latest: all 60 sensors, each heard in the last 10 s',
    async () => {
      const { status, body } = await get('/telemetry/latest');
      if (status !== 200) throw new Error(`answered ${String(status)}`);
      const entries = Object.entries(body.sensors);
      const stale = entries.filter(([, r]) => Date.now() - Date.parse(r.receivedAt) > 10_000);
      if (entries.length !== 60) throw new Error(`${String(entries.length)} sensors`);
      if (stale.length) throw new Error(`stale: ${stale.map(([id]) => id).join(', ')}`);
    },
  ],
  [
    'readings are stored: the telemetry table grows',
    async () => {
      const before = Number(sql('SELECT count(*) FROM telemetry'));
      await sleep(3000);
      const after = Number(sql('SELECT count(*) FROM telemetry'));
      if (after - before < 60) throw new Error(`only ${String(after - before)} new rows in 3 s`);
      return `${String(after - before)} new rows in 3 s, ${String(after)} in total`;
    },
  ],
  [
    'history: vessel.mass over the last 5 minutes, raw, in time order',
    async () => {
      const { status, body } = await get('/telemetry/vessel.mass');
      if (status !== 200) throw new Error(`answered ${String(status)}`);
      if (body.resolution !== 'raw' || body.points.length < 5) {
        throw new Error(`${body.resolution}, ${String(body.points.length)} points`);
      }
      const times = body.points.map((p) => Date.parse(p.t));
      if (times.some((t, i) => i > 0 && t < times[i - 1])) throw new Error('not in time order');
      return `${String(body.points.length)} points`;
    },
  ],
  [
    'broken messages are dropped; the backend keeps running and storing',
    async () => {
      const ts = new Date().toISOString();
      const ok = (value, unit) => JSON.stringify({ ts, value, unit, source: 'hw' });
      publish('lab/mixline/mixer/sensors/mass', '{"ts": broken');
      publish('lab/mixline/mixer/sensors/mass', ok(GARBAGE, 'kg')); // wrong unit
      publish('lab/mixline/mixer/sensors/base_pump_on', ok(7, 'bool')); // not 0/1
      publish('lab/mixline/check/sensors/decision', ok(GARBAGE, '')); // unknown code
      publish('lab/mixline/nowhere/sensors/nothing', ok(GARBAGE, 'g')); // unknown topic
      await sleep(1500);
      const health = await fetch(`${api}/health`);
      if (health.status !== 200) throw new Error('backend is not healthy');
      const stored = sql(`SELECT count(*) FROM telemetry WHERE value IN (${String(GARBAGE)}, 7)`);
      if (stored !== '0') throw new Error(`${stored} broken readings were stored`);
      const { body } = await get('/telemetry/latest');
      const age = Date.now() - Date.parse(body.sensors['vessel.mass'].receivedAt);
      if (age > 3000) throw new Error('intake stopped after the broken messages');
    },
  ],
  [
    'a device clock an hour off: logged once for its station',
    async () => {
      const since = new Date().toISOString();
      const ahead = new Date(Date.now() + 3_600_000).toISOString();
      publish(
        'lab/mixline/cabinet/sensors/ambient_temp',
        JSON.stringify({ ts: ahead, value: 26, unit: 'C', source: 'hw' }),
      );
      await sleep(2500); // the simulator's next reading brings the clock back
      const logs = compose('logs', '--no-log-prefix', '--since', since, 'backend');
      if (!/device clock of station "cabinet" is off by/.test(logs)) {
        throw new Error('no clock warning in the backend log');
      }
      if (!/station "cabinet" is back within tolerance/.test(logs)) {
        throw new Error('no "back within tolerance" line');
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
console.log(failed ? `\n${String(failed)} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
