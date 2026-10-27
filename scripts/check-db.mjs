// Checks the database setup (plan step 7). Run with `pnpm db:check` after `pnpm infra:up`.
// Creates an EMPTY database, runs every migration on it with Prisma, checks the
// result (tables, hypertable, policies, 1-minute summary, email rule, no drift
// between schema.prisma and the database), then deletes it. The real database
// is never touched. Exits with code 1 if any check fails.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const CHECK_DB = 'mixline_check';
const backendDir = fileURLToPath(new URL('../apps/backend/', import.meta.url));
const prismaCli = createRequire(new URL('package.json', `file:///${backendDir}`)).resolve(
  'prisma/build/index.js',
);

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // no .env: use the environment as it is
}
const env = process.env;
const checkUrl = `postgresql://${encodeURIComponent(env.POSTGRES_USER ?? '')}:${encodeURIComponent(
  env.POSTGRES_PASSWORD ?? '',
)}@localhost:${env.POSTGRES_PORT ?? '5432'}/${CHECK_DB}`;

/** Runs SQL in the db container; returns rows as text ("a|b" per line). */
function sql(database, query) {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" -tAqc "$1"',
      database,
      query,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

/** Runs the Prisma CLI of apps/backend against the check database. */
function prisma(...args) {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: backendDir,
    env: { ...env, DATABASE_URL: checkUrl },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const q = (query) => sql(CHECK_DB, query);
const jobsSql = `SELECT application_name || ' ' || config::text FROM timescaledb_information.jobs WHERE job_id >= 1000`;

const checks = [
  [
    'every migration runs on an empty database',
    () => {
      const out = prisma('migrate', 'deploy');
      if (!/successfully applied/.test(out)) throw new Error(out.trim().split('\n').pop());
      return `${q('SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')} migrations`;
    },
  ],
  [
    'schema.prisma and the database match (no drift)',
    () => {
      try {
        prisma(
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          'prisma/schema.prisma',
          '--exit-code',
        );
      } catch (error) {
        throw new Error(
          `Prisma sees a difference: ${String(error.stdout ?? error.message).trim()}`,
          { cause: error },
        );
      }
    },
  ],
  [
    'tables users and telemetry exist; no alarms table (owner, step 7)',
    () => {
      const tables = q(
        `SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );
      if (tables !== '_prisma_migrations,telemetry,users') throw new Error(`tables: ${tables}`);
    },
  ],
  [
    'telemetry is a hypertable on received_at, with the (sensor, time) index only',
    () => {
      const dim = q(
        `SELECT column_name FROM timescaledb_information.dimensions WHERE hypertable_name = 'telemetry'`,
      );
      if (dim !== 'received_at') throw new Error(`partitioned on "${dim}"`);
      const idx = q(
        `SELECT string_agg(indexname, ',') FROM pg_indexes WHERE tablename = 'telemetry'`,
      );
      if (idx !== 'telemetry_sensor_time_idx') throw new Error(`indexes: ${idx}`);
    },
  ],
  [
    'policies: columnstore after 1 day, raw kept 7 days, summary refreshed and kept 1 year',
    () => {
      const jobs = q(jobsSql);
      const want = [
        /Columnstore.*"compress_after": "1 day"/,
        /"drop_after": "7 days"/,
        /Refresh Continuous Aggregate/,
        /"drop_after": "1 year"/,
      ];
      const missing = want.filter((re) => !re.test(jobs));
      if (missing.length) throw new Error(`missing ${missing.join(', ')} in:\n${jobs}`);
    },
  ],
  [
    'the database refuses an email with capitals',
    () => {
      q(
        `INSERT INTO users (email, password_hash, role) VALUES ('ok@example.com', 'x', 'customer')`,
      );
      try {
        q(
          `INSERT INTO users (email, password_hash, role) VALUES ('Bad@Example.com', 'x', 'customer')`,
        );
      } catch {
        return;
      }
      throw new Error('capitals were accepted');
    },
  ],
  [
    '1-minute summary computes min, max, avg and count per sensor',
    () => {
      // Two sensors, readings in one minute 10 minutes ago.
      q(`INSERT INTO telemetry (received_at, device_ts, sensor_id, value, source)
         SELECT b + make_interval(secs => s), b + make_interval(secs => s), id, v, 'sim'
         FROM (SELECT date_trunc('minute', now() - INTERVAL '10 minutes') AS b) t,
              (VALUES ('vessel.mass', 10.0, 1), ('vessel.mass', 20.0, 2), ('vessel.mass', 30.0, 3),
                      ('dyeC.mass', 5.0, 4)) AS r(id, v, s)`);
      q(`CALL refresh_continuous_aggregate('telemetry_1m', NULL, NULL)`);
      const row = q(
        `SELECT min || '|' || max || '|' || avg || '|' || samples FROM telemetry_1m WHERE sensor_id = 'vessel.mass'`,
      );
      if (row !== '10|30|20|3') throw new Error(`vessel.mass summary = ${row || 'none'}`);
      const sensors = q(`SELECT count(DISTINCT sensor_id) FROM telemetry_1m`);
      if (sensors !== '2') throw new Error(`${sensors} sensors in the summary`);
    },
  ],
  [
    'running the jobs: an 8-day-old reading is deleted, a 2-day-old one is compressed',
    () => {
      q(`INSERT INTO telemetry (received_at, device_ts, sensor_id, value, source) VALUES
         (now() - INTERVAL '8 days', now() - INTERVAL '8 days', 'vessel.mass', 1, 'sim'),
         (now() - INTERVAL '2 days', now() - INTERVAL '2 days', 'vessel.mass', 2, 'sim')`);
      const jobId = (pattern) =>
        q(
          `SELECT job_id FROM timescaledb_information.jobs WHERE job_id >= 1000 AND (application_name || ' ' || config::text) ~ '${pattern}'`,
        );
      q(`CALL run_job(${jobId('Columnstore')})`);
      q(`CALL run_job(${jobId('"drop_after": "7 days"')})`);
      const left = q(
        `SELECT count(*) FROM telemetry WHERE received_at < now() - INTERVAL '7 days'`,
      );
      if (left !== '0') throw new Error(`${left} reading(s) older than 7 days left`);
      const kept = q(`SELECT count(*) FROM telemetry WHERE received_at < now() - INTERVAL '1 day'`);
      if (kept !== '1') throw new Error(`2-day-old reading missing`);
      const compressed = q(
        `SELECT bool_and(is_compressed) FROM timescaledb_information.chunks WHERE hypertable_name = 'telemetry' AND range_end < now() - INTERVAL '1 day'`,
      );
      if (compressed !== 't') throw new Error('the 2-day-old chunk is not compressed');
    },
  ],
];

let failed = 0;
try {
  sql('postgres', `DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`);
  sql('postgres', `CREATE DATABASE ${CHECK_DB}`);
  for (const [name, run] of checks) {
    try {
      const detail = run();
      console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL  ${name}: ${message.split('\n').slice(0, 4).join('\n        ')}`);
    }
  }
} finally {
  sql('postgres', `DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`);
}
console.log(
  failed ? `\n${failed} check(s) failed.` : '\nAll checks passed. Check database removed.',
);
process.exitCode = failed ? 1 : 0;
