/**
 * Change my password. Forced while the password is temporary (owner, step 9);
 * the user's other devices are logged out (owner, step 11).
 */
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from '@mixline/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ApiError, invalidFields } from '../api/http';
import { landingPath } from '../app/landing';
import { fieldErrors } from '../forms/errors';
import { Field, PasswordInput } from '../forms/Field';
import styles from '../forms/forms.module.css';
import { useSession, useUser } from '../session/session';
import pageStyles from './pages.module.css';

export function ChangePasswordPage() {
  const session = useSession();
  const user = useUser();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const forced = user.mustChangePassword;

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((old) => ({ ...old, [field]: value }));
  };

  async function submit() {
    setAlert(undefined);
    setDone(false);
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, values, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await session.changePassword(parsed.data);
      setValues({ currentPassword: '', newPassword: '' });
      setDone(true);
      // A temporary password is gone: on to the page the user came for.
      if (forced)
        void navigate(landingPath({ ...user, mustChangePassword: false }), { replace: true });
    } catch (error) {
      if (invalidFields(error).includes('currentPassword')) {
        setErrors({ currentPassword: t('auth.password.wrongCurrent') });
      } else if (error instanceof ApiError && error.status === 429) {
        setAlert(t('auth.login.tooMany'));
      } else if (!(error instanceof ApiError && error.status === 401)) {
        setAlert(
          t(error instanceof ApiError && error.status === 0 ? 'error.network' : 'error.server'),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={pageStyles.narrow}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className={styles.title}>{t('menu.changePassword')}</h1>
        {forced && <p className={styles.notice}>{t('auth.password.forced')}</p>}
        {done && (
          <p className={styles.notice} role="status">
            {t('auth.password.done')}
          </p>
        )}
        {alert && (
          <p className={styles.alert} role="alert">
            {alert}
          </p>
        )}
        <Field
          id="currentPassword"
          label={t('field.currentPassword')}
          error={errors.currentPassword}
        >
          {(a11y) => (
            <PasswordInput
              a11y={a11y}
              value={values.currentPassword}
              onChange={set('currentPassword')}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Field
          id="newPassword"
          label={t('field.newPassword')}
          error={errors.newPassword}
          hint={t('field.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        >
          {(a11y) => (
            <PasswordInput
              a11y={a11y}
              value={values.newPassword}
              onChange={set('newPassword')}
              autoComplete="new-password"
            />
          )}
        </Field>
        <button className={styles.submit} type="submit" disabled={busy}>
          {t('auth.password.submit')}
        </button>
      </form>
    </div>
  );
}
