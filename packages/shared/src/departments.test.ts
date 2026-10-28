import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { rawLocales } from './__fixtures__/config.js';
import { checkDepartments, departmentsFileSchema } from './departments.js';

const realFile = () =>
  JSON.parse(
    readFileSync(new URL('../../../config/departments.json', import.meta.url), 'utf8'),
  ) as unknown;

describe('config/departments.json', () => {
  it('is valid and has a label in both languages for each department', () => {
    const file = departmentsFileSchema.parse(realFile());
    expect(file.departments.map((d) => d.id)).toEqual(['maintenance', 'production', 'quality']);
    expect(checkDepartments(file, rawLocales())).toEqual([]);
    const { ar } = rawLocales();
    expect(file.departments.map((d) => ar[d.labelKey])).toEqual(['الصيانة', 'الإنتاج', 'الجودة']);
  });

  it('reports a duplicate id and a missing Arabic label', () => {
    const locales = rawLocales();
    delete locales.ar['department.quality'];
    const issues = checkDepartments(
      {
        departments: [
          { id: 'quality', labelKey: 'department.quality' },
          { id: 'quality', labelKey: 'department.quality' },
        ],
      },
      locales,
    );
    expect(issues).toContainEqual({
      path: 'departments[quality]',
      message: 'duplicate department id',
    });
    expect(issues).toContainEqual({
      path: 'departments[quality].labelKey',
      message: '"department.quality" is missing in ar.json',
    });
  });

  it('refuses an empty list and a badly formed id', () => {
    expect(departmentsFileSchema.safeParse({ departments: [] }).success).toBe(false);
    expect(
      departmentsFileSchema.safeParse({
        departments: [{ id: 'Quality Control', labelKey: 'department.quality' }],
      }).success,
    ).toBe(false);
  });
});
