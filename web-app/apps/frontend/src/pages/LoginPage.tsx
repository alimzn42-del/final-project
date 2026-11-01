/** Login with email and password; links to the customer sign-up. */
import { loginSchema } from '@mixline/shared';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ApiError } from '../api/http';
import { fieldErrors } from '../forms/errors';
import { Field, PasswordInput, TextInput } from '../forms/Field';
import styles from '../forms/forms.module.css';
import { useSession } from '../session/session';

export function LoginPage() {
  const session = useSession();
  const { t } = useTranslation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const ended = session.state.status === 'out' && session.state.ended;

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((old) => ({ ...old, [field]: value }));
  };

  async function submit() {
    setAlert(undefined);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, values, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await session.login(parsed.data); // the page then moves to the user's landing page
    } catch (error) {
      setAlert(loginProblem(error, t));
      setBusy(false);
    }
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className={styles.title}>{t('auth.login.title')}</h1>
      {ended && (
        <p className={styles.notice} role="status">
          {t('auth.sessionEnded')}
        </p>
      )}
      {alert && (
        <p className={styles.alert} role="alert">
          {alert}
        </p>
      )}
      <Field id="email" label={t('field.email')} error={errors.email}>
        {(a11y) => (
          <TextInput
            a11y={a11y}
            type="email"
            autoComplete="username"
            ltr
            value={values.email}
            onChange={set('email')}
          />
        )}
      </Field>
      <Field id="password" label={t('field.password')} error={errors.password}>
        {(a11y) => (
          <PasswordInput
            a11y={a11y}
            value={values.password}
            onChange={set('password')}
            autoComplete="current-password"
          />
        )}
      </Field>
      <button className={styles.submit} type="submit" disabled={busy}>
        {t('auth.login.submit')}
      </button>
      <p className={styles.aside}>
        {t('auth.login.newCustomer')} <Link to="/signup">{t('auth.login.toSignup')}</Link>
      </p>
    </form>
  );
}

function loginProblem(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('error.server');
  if (error.status === 401) return t('auth.login.wrong');
  if (error.status === 429) return t('auth.login.tooMany');
  if (error.status === 0) return t('error.network');
  return t('error.server');
}
