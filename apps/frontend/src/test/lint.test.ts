// @vitest-environment node
/**
 * Hard rule 6 (CLAUDE.md): no hardcoded UI text. Runs the repo's real ESLint
 * config on two fixtures: one with plain text (must fail), one using t() (must pass).
 */
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const fixture = (name: string) =>
  fileURLToPath(new URL(`./lint-fixtures/${name}`, import.meta.url));

async function lint(file: string) {
  // The fixtures are ignored by `pnpm lint` (they are broken on purpose); lint them explicitly.
  const eslint = new ESLint({ cwd: repo, ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return result?.messages ?? [];
}

describe('the lint rule against hardcoded UI text', () => {
  it('rejects text in JSX and in attributes people read', async () => {
    const messages = await lint(fixture('hardcoded.tsx'));
    const lines = messages
      .filter((m) => m.ruleId === 'i18next/no-literal-string')
      .map((m) => m.line);
    expect(lines).toEqual([5, 6, 7]);
  }, 60_000);

  it('accepts text through t() and technical attributes (className, type, id...)', async () => {
    expect(await lint(fixture('translated.tsx'))).toEqual([]);
  }, 60_000);
});
