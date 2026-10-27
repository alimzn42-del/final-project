import { defineConfig } from 'vitest/config';

// One Vitest project per workspace package, so `pnpm test` at the root runs
// every package's tests and reports them under the package name.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
