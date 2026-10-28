import { describe, expect, it } from 'vitest';

import { createDepartmentSchema, renameDepartmentSchema } from './departments.js';

describe('department rules', () => {
  it('a new department needs both names, trimmed', () => {
    expect(createDepartmentSchema.parse({ nameEn: ' Packaging ', nameAr: ' التغليف ' })).toEqual({
      nameEn: 'Packaging',
      nameAr: 'التغليف',
    });
    expect(createDepartmentSchema.safeParse({ nameEn: 'Packaging' }).success).toBe(false);
    expect(createDepartmentSchema.safeParse({ nameEn: ' ', nameAr: 'التغليف' }).success).toBe(
      false,
    );
  });

  it('a rename gives one or both names, nothing else', () => {
    expect(renameDepartmentSchema.parse({ nameAr: 'الصيانة الفنية' })).toEqual({
      nameAr: 'الصيانة الفنية',
    });
    expect(renameDepartmentSchema.safeParse({}).success).toBe(false);
    expect(renameDepartmentSchema.safeParse({ nameEn: 'X', id: 'y' }).success).toBe(false);
  });
});
