/**
 * Node-only helpers that read the config files from disk. Import them from
 * '@mixline/shared/node'; the main '@mixline/shared' entry never touches the
 * file system, so the browser can use it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkDepartments, type DepartmentsFile, departmentsFileSchema } from './departments.js';
import { formatIssues, zodIssues } from './issues.js';
import type { Locales } from './locales.js';
import type { Machine } from './machine.schema.js';
import { parseMachineOrThrow } from './validate.js';

/** Reads and parses a JSON file; the error names the file. */
export function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${path}`, { cause: error });
  }
}

/** Reads and validates machine.json alone; throws one error listing every problem. */
export function loadMachineFile(path: string): Machine {
  return parseMachineOrThrow(readJsonFile(path));
}

/**
 * Reads machine.json and the en/ar locale files and validates them together
 * (schema, cross-references and locale rules); throws one error listing every
 * problem.
 */
export function loadConfigFiles(
  machinePath: string,
  localesDir: string,
): { machine: Machine; locales: Locales } {
  const en = readJsonFile(join(localesDir, 'en.json'));
  const ar = readJsonFile(join(localesDir, 'ar.json'));
  const machine = parseMachineOrThrow(readJsonFile(machinePath), { en, ar });
  // parseMachineOrThrow has checked both files against localeSchema.
  return { machine, locales: { en: en as Locales['en'], ar: ar as Locales['ar'] } };
}

/**
 * Reads and validates config/departments.json against the locale files;
 * throws one error listing every problem.
 */
export function loadDepartmentsFile(path: string, locales: Locales): DepartmentsFile {
  const data = readJsonFile(path);
  const parsed = departmentsFileSchema.safeParse(data);
  const issues = parsed.success
    ? checkDepartments(parsed.data, locales)
    : zodIssues(parsed.error, data);
  if (!parsed.success || issues.length) {
    throw new Error(
      `departments.json is invalid (${String(issues.length)} problem(s)):\n${formatIssues(issues)}`,
    );
  }
  return parsed.data;
}
