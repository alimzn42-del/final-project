// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', 'reference/', 'apps/backend/src/generated/'] },

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

  // Plain JS files (config, scripts/) have no types to check.
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },

  // Must stay last: turns off rules that would fight Prettier's formatting.
  prettier,
);
