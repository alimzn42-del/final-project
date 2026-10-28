// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Web app source files. */
const FRONTEND = ['apps/frontend/src/**/*.{ts,tsx}'];
/** Its tests and test helpers may contain plain text (not the lint fixtures, which test the rule). */
const FRONTEND_TESTS = [
  'apps/frontend/src/**/*.test.{ts,tsx}',
  'apps/frontend/src/test/*.{ts,tsx}',
];

export default defineConfig(
  {
    ignores: [
      '**/dist/',
      '**/coverage/',
      'reference/',
      'apps/backend/src/generated/',
      // Deliberately broken files for the lint test (src/test/lint.test.ts).
      'apps/frontend/src/test/lint-fixtures/',
    ],
  },

  eslint.configs.recommended,
  // Strictest typescript-eslint presets: they use type information to catch
  // real bugs (unhandled promises, unsafe `any`, impossible conditions).
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // Each package's tsconfig.json covers its own files; root config files
        // (this one, vitest.config.ts) fall back to a default project.
        projectService: { allowDefaultProject: ['*.js', '*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // NestJS modules are classes whose meaning lives in their @Module decorator.
  {
    rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
  },

  // Web app: browser code and the rules of React hooks.
  { files: FRONTEND, extends: [reactHooks.configs.flat['recommended-latest']] },
  { files: FRONTEND, languageOptions: { globals: globals.browser } },

  // Hard rule 6 (CLAUDE.md): no hardcoded UI text. Text in JSX, and the attributes people read,
  // must come from i18next (t('key')). Technical attributes (className, href, type...) are not text.
  {
    files: FRONTEND,
    ignores: FRONTEND_TESTS,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: ['alt', 'title', 'placeholder', 'label', 'aria-label', 'aria-description'],
          },
        },
      ],
    },
  },

  // Plain JS files (config, scripts/) have no types to check.
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },

  // Must stay last: turns off rules that would fight Prettier's formatting.
  prettier,
);
