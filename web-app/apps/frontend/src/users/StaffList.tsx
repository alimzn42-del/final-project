/**
 * The staff accounts (owner, step 16): managers and workers, with what a manager may do to each:
 * move a worker, give a new temporary password, disable or re-enable. The backend enforces every
 * rule (lockout, audit); the page only hides what can never work (disabling yourself) and asks
 * before disabling.
 */
import { type Department, type StaffMember, temporaryPasswordSchema } from '@mixline/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api/http';
import { fieldErrors } from '../forms/errors';
import { Field, PasswordInput } from '../forms/Field';
import formStyles from '../forms/forms.module.css';
import { useSession, useUser } from '../session/session';
import { cx } from '../ui/cx';
import { departmentName, problemKey } from './accounts';
import styles from './users.module.css';

interface Props {
  staff: StaffMember[];
  departments: Department[];
  /** After a change: what to say, then load the lists again. */
  onChanged: (message: string) => void;
}

export function StaffList({ staff, departments, onChanged }: Props) {
  const { t } = useTranslation();
  return (
    <section className={styles.section} aria-labelledby="staff-title">
      <h2 id="staff-title" className={styles.sectionTitle}>
        {t('users.staff')}
      </h2>
      <p className={styles.hint}>{t('users.staffHint')}</p>
      <ul className={styles.list}>
        {staff.map((member) => (
          <StaffRow
            key={member.id}
            member={member}
            departments={departments}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

type Mode = 'idle' | 'password' | 'confirmDisable';

function StaffRow({
  member,
  departments,
  onChanged,
}: {
  member: StaffMember;
  departments: Department[];
  onChanged: Props['onChanged'];
}) {
  const { t, i18n } = useTranslation();
  const { call } = useSession();
  const me = useUser();
  const [mode, setMode] = useState<Mode>('idle');
  const [department, setDepartment] = useState(member.departmentId ?? '');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const isMe = member.id === me.id;
  const name = member.fullName ?? member.email;
  const id = member.id;

  async function act(request: () => Promise<unknown>, done: string) {
    setProblem(undefined);
    setBusy(true);
    try {
      await call(request);
      setMode('idle');
      setPassword('');
      onChanged(done);
    } catch (error) {
      setProblem(t(problemKey(error)));
    } finally {
      setBusy(false);
    }
  }

  function issuePassword() {
    const parsed = temporaryPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setPasswordError(fieldErrors(parsed.error.issues, { password }, t).password);
      return;
    }
    setPasswordError(undefined);
    void act(
      () => api('POST', `/users/${id}/temporary-password`, parsed.data),
      t('users.issued', { name }),
    );
  }

  const status = member.disabledAt
    ? 'disabled'
    : member.mustChangePassword
      ? 'temporary'
      : 'active';
  const moved = departments.find((d) => d.id === department);

  return (
    <li
      className={cx(styles.row, member.disabledAt !== null && styles.disabledRow)}
      aria-labelledby={`staff-${id}`}
    >
      <div className={styles.who}>
        <span id={`staff-${id}`} className={styles.name}>
          {name}
        </span>
        {isMe && <span className={styles.tag}>{t('users.you')}</span>}
        <span className={styles.email} dir="ltr">
          {member.email}
        </span>
      </div>
      <span className={styles.role}>{t(`role.${member.role}`)}</span>
      <span className={styles.status} data-status={status}>
        {t(`users.status.${status}`)}
      </span>

      {member.role === 'worker' && (
        <div className={styles.department}>
          <Field id={`department-${id}`} label={t('field.department')}>
            {(a11y) => (
              <select
                {...a11y}
                className={formStyles.input}
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                }}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {departmentName(d, i18n.language)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {department !== member.departmentId && (
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                void act(
                  () => api('PATCH', `/users/${id}/department`, { departmentId: department }),
                  t('users.moved', { name, department: departmentName(moved, i18n.language) }),
                );
              }}
            >
              {t('users.move')}
            </button>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-expanded={mode === 'password'}
          onClick={() => {
            setMode(mode === 'password' ? 'idle' : 'password');
          }}
        >
          {t('users.newPassword')}
        </button>
        {!isMe &&
          (member.disabledAt ? (
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                void act(() => api('POST', `/users/${id}/enable`), t('users.enabled', { name }));
              }}
            >
              {t('users.enable')}
            </button>
          ) : (
            <button
              type="button"
              className={cx(styles.button, styles.danger)}
              aria-expanded={mode === 'confirmDisable'}
              onClick={() => {
                setMode(mode === 'confirmDisable' ? 'idle' : 'confirmDisable');
              }}
            >
              {t('users.disable')}
            </button>
          ))}
      </div>

      {mode === 'password' && (
        <form
          className={styles.inline}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            issuePassword();
          }}
        >
          <Field
            id={`password-${id}`}
            label={t('field.temporaryPassword')}
            hint={t('users.newPasswordHint')}
            error={passwordError}
          >
            {(a11y) => (
              <PasswordInput
                a11y={a11y}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
            )}
          </Field>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {t('users.issue')}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setMode('idle');
              }}
            >
              {t('ui.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'confirmDisable' && (
        <div className={styles.inline} role="group" aria-labelledby={`confirm-${id}`}>
          <p id={`confirm-${id}`} className={styles.confirm}>
            {t('users.confirmDisable', { name })}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={cx(styles.primary, styles.dangerPrimary)}
              disabled={busy}
              onClick={() => {
                void act(() => api('POST', `/users/${id}/disable`), t('users.disabled', { name }));
              }}
            >
              {t('users.disable')}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setMode('idle');
              }}
            >
              {t('ui.cancel')}
            </button>
          </div>
        </div>
      )}

      {problem && (
        <p className={formStyles.alert} role="alert">
          {problem}
        </p>
      )}
    </li>
  );
}
