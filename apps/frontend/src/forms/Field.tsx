/**
 * One labelled form field with its hint and error, linked for screen readers
 * (aria-describedby, aria-invalid). The input itself is passed as a render
 * function so any kind of input fits.
 */
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cx } from '../ui/cx';
import styles from './forms.module.css';

export interface InputA11y {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean;
  children: (a11y: InputA11y) => ReactNode;
}

export function Field({ id, label, error, hint, optional = false, children }: FieldProps) {
  const { t } = useTranslation();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}>{t('ui.optional')}</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/** A one-line input. `ltr`: written left to right in Arabic too (emails, phone numbers, dates). */
export function TextInput({
  a11y,
  value,
  onChange,
  type = 'text',
  autoComplete,
  ltr = false,
}: {
  a11y: InputA11y;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'date';
  autoComplete?: string;
  ltr?: boolean;
}) {
  return (
    <input
      {...a11y}
      className={cx(styles.input, ltr && styles.ltr)}
      type={type}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

/** A password input with a show / hide button. */
export function PasswordInput({
  a11y,
  value,
  onChange,
  autoComplete,
}: {
  a11y: InputA11y;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.password}>
      <input
        {...a11y}
        className={styles.input}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      <button
        type="button"
        className={styles.reveal}
        aria-pressed={shown}
        aria-controls={a11y.id}
        onClick={() => {
          setShown((s) => !s);
        }}
      >
        {t(shown ? 'field.hidePassword' : 'field.showPassword')}
      </button>
    </div>
  );
}
