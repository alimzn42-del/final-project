/**
 * TEST-ONLY: a temporary database for the *.db.test.ts files. Creates an
 * empty database next to the real one, applies every migration with Prisma,
 * and drops it afterwards. Needs `pnpm infra:up`. Excluded from the build.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const backendDir = fileURLToPath(new URL('../../', import.meta.url));
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

/** The repo's .env, loaded once (the tests run on the laptop, against Docker). */
export function loadRepoEnv(): NodeJS.ProcessEnv {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
  } catch {
    // no .env: use the environment as it is
  }
  return process.env;
}

function url(env: NodeJS.ProcessEnv, database: string): string {
  const user = encodeURIComponent(env.POSTGRES_USER ?? '');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
  return `postgresql://${user}:${password}@localhost:${env.POSTGRES_PORT ?? '5432'}/${database}`;
}

async function admin(env: NodeJS.ProcessEnv, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: url(env, 'postgres') });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  name: string;
  url: string;
  drop(): Promise<void>;
}

/** Creates an empty database and applies every migration to it. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const env = loadRepoEnv();
  const name = `mixline_test_${String(process.pid)}`;
  await admin(env, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin(env, `CREATE DATABASE ${name}`);
  const databaseUrl = url(env, name);
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  return {
    name,
    url: databaseUrl,
    drop: () => admin(env, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}
