/**
 * Prepares the database: applies every migration as the database owner, then creates or updates
 * the backend's own role and its privileges (app-role.ts). Run by the migrate container
 * (docker-compose.yml) and by `pnpm db:migrate` on the laptop. Exits with code 1 on any problem.
 *
 * Settings: DATABASE_URL or POSTGRES_* for the owner (as prisma.config.ts), and DB_APP_USER /
 * DB_APP_PASSWORD for the backend's role (see .env.example).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { APP_ROLE_NAME, DEFAULT_APP_ROLE, grantAppRole } from './app-role.js';

const backendDir = fileURLToPath(new URL('../../', import.meta.url));
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

/** The owner's address, the same rule as prisma.config.ts. */
function ownerUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const part = (v: string | undefined) => encodeURIComponent(v ?? '');
  const host = env.POSTGRES_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  return `postgresql://${part(env.POSTGRES_USER)}:${part(env.POSTGRES_PASSWORD)}@${host}:${port}/${env.POSTGRES_DB ?? ''}`;
}

async function main(env: NodeJS.ProcessEnv): Promise<void> {
  const name = (env.DB_APP_USER ?? '') === '' ? DEFAULT_APP_ROLE : (env.DB_APP_USER ?? '');
  const password = env.DB_APP_PASSWORD ?? '';
  if (!APP_ROLE_NAME.test(name)) throw new Error('DB_APP_USER: lower-case letters, digits and _');
  if (password.length < 12) throw new Error('DB_APP_PASSWORD: set it in .env (12+ characters)');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env,
    stdio: 'inherit',
  });

  const owner = new pg.Client({ connectionString: ownerUrl(env) });
  await owner.connect();
  try {
    await grantAppRole(owner, { name, password });
  } finally {
    await owner.end();
  }
  console.log(`database role "${name}": privileges granted (audit log: read and add only)`);
}

main(process.env).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
