/**
 * One entry point for apps: validates machine.json (and the locale files when
 * given) and returns every problem at once. The backend refuses to start on
 * any issue; tests use it to prove the config files are consistent.
 */
import { formatIssues, type Issue, zodIssues } from './issues.js';
import { checkLocales, type Locales, localeSchema } from './locales.js';
import { checkMachineRules } from './machine.rules.js';
import { type Machine, machineSchema } from './machine.schema.js';

export type ValidationResult =
  { ok: true; machine: Machine; issues: [] } | { ok: false; issues: Issue[] };

export function validateMachine(
  data: unknown,
  locales?: { en: unknown; ar: unknown },
): ValidationResult {
  const parsed = machineSchema.safeParse(data);
  // The cross-checks need a well-formed machine, so a shape error stops here.
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error, data) };

  const issues = checkMachineRules(parsed.data);
  if (locales) {
    const en = localeSchema.safeParse(locales.en);
    const ar = localeSchema.safeParse(locales.ar);
    if (!en.success) issues.push(...prefixed('locales.en', zodIssues(en.error, locales.en)));
    if (!ar.success) issues.push(...prefixed('locales.ar', zodIssues(ar.error, locales.ar)));
    if (en.success && ar.success) {
      const dicts: Locales = { en: en.data, ar: ar.data };
      issues.push(...checkLocales(parsed.data, dicts));
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, machine: parsed.data, issues: [] };
}

/** Like validateMachine, but throws one readable error listing every issue. */
export function parseMachineOrThrow(
  data: unknown,
  locales?: { en: unknown; ar: unknown },
): Machine {
  const result = validateMachine(data, locales);
  if (result.ok) return result.machine;
  throw new Error(
    `machine.json is invalid (${String(result.issues.length)} problem(s)):\n${formatIssues(result.issues)}`,
  );
}

function prefixed(prefix: string, issues: Issue[]): Issue[] {
  return issues.map((i) => ({ ...i, path: i.path === '(root)' ? prefix : `${prefix}.${i.path}` }));
}
