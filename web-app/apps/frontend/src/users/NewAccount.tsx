/**
 * A manager creates a manager or worker account (owner, step 9): full name, email, role, a
 * temporary password, language, and a department for workers. The same shared rules as the
 * backend check it first.
 */
import {
  createStaffSchema,
  type Department,
  LANGUAGES,
  PASSWORD_MIN_LENGTH,
  STAFF_ROLES,
} from '@mixline/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, invalidFields } from '../api/http';
import { fieldErrors } from '../forms/errors';
import { Field, PasswordInput, TextInput } from '../forms/Field';
import formStyles from '../forms/forms.module.css';
import { useSession } from '../session/session';
import { departmentName, problemKey } from './accounts';
import styles from './users.module.css';

const EMPTY = {
  fullName: '',
  email: '',
  role: 'worker' as (typeof STAFF_ROLES)[number],
  password: '',
  locale: 'en' as (typeof LANGUAGES)[number],
  departmentId: '',
};

export function NewAccount({
  departments,
  onChanged,
}: {
  departments: Department[];
  onChanged: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { call } = useSession();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const worker = values.role === 'worker';

  const set = (field: keyof typeof EMPTY) => (value: string) => {
    setValues((old) => ({ ...old, [field]: value }));
  };

  async function submit() {
    setProblem(undefined);
    const input = {
      ...values,
      departmentId: worker ? values.departmentId || undefined : undefined,
    };
    const parsed = createStaffSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, values, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await call(() => api('POST', '/users', parsed.data));
      setValues(EMPTY);
      onChanged(t('users.created', { name: parsed.data.fullName }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ email: t('error.emailTaken') });
      } else if (invalidFields(error).length) {
        setErrors(Object.fromEntries(invalidFields(error).map((f) => [f, t('error.invalid')])));
      } else {
        setProblem(t(problemKey(error)));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="new-title">
      <h2 id="new-title" className={styles.sectionTitle}>
        {t('users.new')}
      </h2>
      <p className={styles.hint}>{t('users.newHint')}</p>
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="new-fullName" label={t('field.fullName')} error={errors.fullName}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              value={values.fullName}
              onChange={set('fullName')}
              autoComplete="off"
            />
          )}
        </Field>
        <Field id="new-email" label={t('field.email')} error={errors.email}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              type="email"
              ltr
              value={values.email}
              onChange={set('email')}
              autoComplete="off"
            />
          )}
        </Field>
        <Field id="new-role" label={t('field.role')} error={errors.role}>
          {(a11y) => (
            <select
              {...a11y}
              className={formStyles.input}
              value={values.role}
              onChange={(e) => {
                set('role')(e.target.value);
              }}
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {worker && (
          <Field id="new-department" label={t('field.department')} error={errors.departmentId}>
            {(a11y) => (
              <select
                {...a11y}
                className={formStyles.input}
                value={values.departmentId}
                onChange={(e) => {
                  set('departmentId')(e.target.value);
                }}
              >
                <option value="">{t('ui.choose')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {departmentName(d, i18n.language)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field
          id="new-password"
          label={t('field.temporaryPassword')}
          hint={t('field.passwordHint', { count: PASSWORD_MIN_LENGTH })}
          error={errors.password}
        >
          {(a11y) => (
            <PasswordInput
              a11y={a11y}
              value={values.password}
              onChange={set('password')}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field id="new-locale" label={t('field.language')} error={errors.locale}>
          {(a11y) => (
            <select
              {...a11y}
              className={formStyles.input}
              value={values.locale}
              onChange={(e) => {
                set('locale')(e.target.value);
              }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`lang.${lang}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {problem && (
          <p className={formStyles.alert} role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={busy}>
          {t('users.create')}
        </button>
      </form>
    </section>
  );
}
