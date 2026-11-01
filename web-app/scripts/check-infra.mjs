// Checks the local Docker stack (plan step 2). Run with `pnpm infra:check`
// after `pnpm infra:up`. Exits with code 1 if any check fails.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Runs `docker compose <args>` and returns stdout; throws on a non-zero exit. */
function compose(...args) {
  return execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Runs a shell snippet inside a service; extra args become $0, $1... */
function inService(service, script, ...args) {
  return compose('exec', '-T', service, 'sh', '-c', script, ...args);
}

const mqttAuth = '-h localhost -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD"';

const checks = [
  [
    'db and mqtt containers are healthy',
    () => {
      const services = compose('ps', '--format', 'json')
        .split('\n')
        .map((line) => JSON.parse(line));
      for (const name of ['db', 'mqtt']) {
        const s = services.find((x) => x.Service === name);
        if (s?.Health !== 'healthy') throw new Error(`${name}: ${s?.Health ?? 'not running'}`);
      }
    },
  ],
  [
    'TimescaleDB extension is installed in the app database',
    () => {
      const version = inService(
        'db',
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$0"',
        "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'",
      );
      if (!version) throw new Error('extension not found');
      return `version ${version}`;
    },
  ],
  [
    'TimescaleDB telemetry to the internet is off',
    () => {
      const level = inService(
        'db',
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$0"',
        'SHOW timescaledb.telemetry_level',
      );
      if (level !== 'off') throw new Error(`telemetry_level is ${level}`);
    },
  ],
  [
    'MQTT message goes through the broker and comes back',
    () => {
      const message = `check-${randomUUID()}`;
      const received = inService(
        'mqtt',
        `mosquitto_sub ${mqttAuth} -t mixline-check/ping -C 1 -W 5 &
         sleep 1
         mosquitto_pub ${mqttAuth} -t mixline-check/ping -m "$0"
         wait`,
        message,
      );
      if (received !== message) throw new Error(`got "${received}"`);
    },
  ],
  [
    'MQTT refuses anonymous clients',
    () => expectRefused('mosquitto_pub -h localhost -t mixline-check/ping -m x'),
  ],
  [
    'MQTT refuses a wrong password',
    () =>
      expectRefused(
        'mosquitto_pub -h localhost -u "$MQTT_USERNAME" -P wrong -t mixline-check/ping -m x',
      ),
  ],
];

/** Passes only when the running broker itself answers "not authorised"; a
 * stopped broker or any other error must not count as a refusal. */
function expectRefused(script) {
  try {
    inService('mqtt', script);
  } catch (error) {
    const stderr = String(error?.stderr ?? '');
    if (stderr.includes('not authorised')) return;
    throw new Error(`no "not authorised" answer: ${stderr.trim().split('\n')[0] || 'no output'}`, {
      cause: error,
    });
  }
  throw new Error('connection was accepted');
}

let failed = 0;
for (const [name, run] of checks) {
  try {
    const detail = run();
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } catch (error) {
    failed++;
    console.log(
      `FAIL  ${name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;
