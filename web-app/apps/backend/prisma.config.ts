/**
 * Prisma settings (Prisma 7 reads the connection from here, not from
 * schema.prisma). The database address comes from the same POSTGRES_* values
 * that start the database (see .env.example), so the password is written once.
 */
import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env by itself. On the laptop, load the repo's .env;
// in Docker the variables are already set and the file does not exist.
try {
  process.loadEnvFile('../../.env');
} catch {
  // no .env file: use the environment as it is
}

function databaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = env.POSTGRES_USER ?? '';
  const password = env.POSTGRES_PASSWORD ?? '';
  const host = env.POSTGRES_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  const db = env.POSTGRES_DB ?? '';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl(process.env) },
});
