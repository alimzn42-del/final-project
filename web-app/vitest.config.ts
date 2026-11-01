import { configDefaults, defineConfig } from 'vitest/config';

// Resolve workspace packages (e.g. @mixline/shared) to their TypeScript
// source through the "source" export condition, so tests never need a build
// first. The other entries are Vite's defaults for Node.
const conditions = ['source', 'module', 'node', 'development|production'];

// One Vitest project per workspace package, so `pnpm test` at the root runs
// every package's tests and reports them under the package name.
export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    projects: [
      { extends: true, test: { name: '@mixline/shared', root: 'packages/shared' } },
      {
        extends: true,
        // *.db.test.ts need Docker: they run with `pnpm test:db` (vitest.db.config.ts).
        test: {
          name: '@mixline/backend',
          root: 'apps/backend',
          exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
        },
      },
      { extends: true, test: { name: '@mixline/simulator', root: 'apps/simulator' } },
      {
        // The web app's own Vite config (React, browser conditions), in a simulated browser.
        extends: './apps/frontend/vite.config.ts',
        test: {
          name: '@mixline/frontend',
          root: 'apps/frontend',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
});
