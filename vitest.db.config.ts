import { defineConfig } from 'vitest/config';

// Tests that need the real database (Docker: `pnpm infra:up` first).
// Run with `pnpm test:db`; `pnpm test` leaves them out, so it never needs Docker.
const conditions = ['source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    name: 'database',
    include: ['apps/backend/src/**/*.db.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
