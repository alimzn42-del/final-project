/**
 * Worker departments (owner, step 9), from config/departments.json so the list
 * can change without code. Later a department will decide which sections a
 * worker can open (open item in docs/05-roadmap.md); for now it is a label.
 */
import { z } from 'zod';

import type { Issue } from './issues.js';
import { LANGUAGES, type Locales } from './locales.js';

export const departmentsFileSchema = z.strictObject({
  departments: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'expected an id like "maintenance"'),
        labelKey: z.string().regex(/^department\.[A-Za-z0-9]+$/, 'expected department.<id>'),
      }),
    )
    .min(1, 'at least one department'),
});
export type DepartmentsFile = z.infer<typeof departmentsFileSchema>;
export type Department = DepartmentsFile['departments'][number];

/** Unique ids, and a label in both locale files for each department. */
export function checkDepartments(file: DepartmentsFile, locales: Locales): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const d of file.departments) {
    const path = `departments[${d.id}]`;
    if (seen.has(d.id)) issues.push({ path, message: 'duplicate department id' });
    seen.add(d.id);
    for (const lang of LANGUAGES) {
      if (!(d.labelKey in locales[lang])) {
        issues.push({
          path: `${path}.labelKey`,
          message: `"${d.labelKey}" is missing in ${lang}.json`,
        });
      }
    }
  }
  return issues;
}
