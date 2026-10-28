/**
 * Form errors in the user's language. The forms check their input with the
 * shared rules (the same zod schemas the backend uses), and each problem the
 * rules report becomes a message key here. The rules' own messages are
 * English and are never shown.
 */
import { MINIMUM_CUSTOMER_AGE } from '@mixline/shared';
import type { TFunction } from 'i18next';

/** The parts of a zod issue the messages need. */
export interface RuleIssue {
  code: string;
  path: readonly PropertyKey[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
}

const PASSWORDS = new Set(['password', 'newPassword']);

/** One message per field: the first problem the rules found. */
export function fieldErrors(
  issues: readonly RuleIssue[],
  values: Record<string, unknown>,
  t: TFunction,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= message(issue, field, values[field], t);
  }
  return errors;
}

function message(issue: RuleIssue, field: string, value: unknown, t: TFunction): string {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return t('error.required');
  }
  switch (issue.code) {
    case 'too_small':
      return PASSWORDS.has(field)
        ? t('error.passwordShort', { min: Number(issue.minimum) })
        : t('error.required');
    case 'too_big':
      return PASSWORDS.has(field)
        ? t('error.passwordLong', { max: Number(issue.maximum) })
        : t('error.tooLong', { max: Number(issue.maximum) });
    case 'invalid_format':
      if (issue.format === 'email') return t('error.email');
      if (field === 'mobile') return t('error.mobile');
      if (field === 'dateOfBirth') return t('error.date');
      return t('error.invalid');
    case 'custom':
      if (field === 'dateOfBirth') {
        return typeof value === 'string' && value < '1900-01-01'
          ? t('error.tooOld')
          : t('error.tooYoung', { age: MINIMUM_CUSTOMER_AGE });
      }
      if (field === 'newPassword') return t('error.samePassword');
      if (field === 'country') return t('error.required');
      return t('error.invalid');
    case 'invalid_value':
    case 'invalid_type':
      return t('error.required');
    default:
      return t('error.invalid');
  }
}
