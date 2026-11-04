/**
 * TEST-ONLY: a temporary database for the *.db.test.ts files. Creates an
 * empty database next to the real one, applies every migration with Prisma,
 * and drops it afterwards. Needs `pnpm infra:up`. Excluded from the build.
 *
 * Like the real setup (step 16), the tests connect as a backend role with the
 * app's limited privileges (`url`), not as the owner (`ownerUrl`). The role has
 * its own name and a random password, so it never touches the real one.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { grantAppRole } from '../database/app-role.js';

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

function url(
  env: NodeJS.ProcessEnv,
  database: string,
  login?: { user: string; password: string },
): string {
  const user = encodeURIComponent(login?.user ?? env.POSTGRES_USER ?? '');
  const password = encodeURIComponent(login?.password ?? env.POSTGRES_PASSWORD ?? '');
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
  /** As the backend's role: what the app may do. */
  url: string;
  /** As the database owner: for setting things up, and for testing what the owner may not do. */
  ownerUrl: string;
  /** The backend role's name in this test database. */
  role: string;
  drop(): Promise<void>;
}

/** Creates an empty database and applies every migration to it. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const env = loadRepoEnv();
  const name = `mixline_test_${String(process.pid)}`;
  await admin(env, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin(env, `CREATE DATABASE ${name}`);
  const ownerUrl = url(env, name);
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...env, DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  });
  const role = { name: `${name}_app`, password: randomBytes(18).toString('base64url') };
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await grantAppRole(owner, role);
  } finally {
    await owner.end();
  }
  return {
    name,
    url: url(env, name, { user: role.name, password: role.password }),
    ownerUrl,
    role: role.name,
    drop: async () => {
      await admin(env, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin(env, `DROP ROLE IF EXISTS ${role.name}`);
    },
  };
}
