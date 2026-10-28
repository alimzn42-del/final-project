/**
 * Customer sign-up (doc 03): the backend always creates a customer. The form
 * checks the same shared rules as the backend before sending.
 */
import { dateInSyria, GOVERNORATES, PASSWORD_MIN_LENGTH, signupSchema } from '@mixline/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ApiError, invalidFields } from '../api/http';
import { fieldErrors } from '../forms/errors';
import { Field, PasswordInput, TextInput } from '../forms/Field';
import styles from '../forms/forms.module.css';
import { type CountryCode, DEFAULT_PHONE_COUNTRY, phoneCountries, toE164 } from '../forms/phone';
import { usePreferences } from '../prefs/preferences';
import { useSession } from '../session/session';
import { cx } from '../ui/cx';

const EMPTY = {
  email: '',
  password: '',
  fullName: '',
  /** A country code from the picker (only valid codes are offered). */
  phoneCountry: DEFAULT_PHONE_COUNTRY as string,
  phoneNumber: '',
  dateOfBirth: '',
  governorate: '',
  country: '',
  cityArea: '',
  occupation: '',
  paintPurpose: '',
};
type Values = typeof EMPTY;

export function SignupPage() {
  const session = useSession();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const countries = useMemo(() => phoneCountries(language), [language]);
  const outside = values.governorate === 'outside';

  const set = (field: keyof Values) => (value: string) => {
    setValues((old) => ({ ...old, [field]: value }));
  };

  async function submit() {
    setAlert(undefined);
    const e164 = toE164(values.phoneCountry as CountryCode, values.phoneNumber);
    const input = {
      email: values.email,
      password: values.password,
      fullName: values.fullName,
      mobile: e164 ?? values.phoneNumber.trim(),
      dateOfBirth: values.dateOfBirth,
      governorate: values.governorate || undefined,
      country: outside ? values.country : undefined,
      cityArea: values.cityArea,
      occupation: values.occupation,
      paintPurpose: values.paintPurpose,
      locale: language,
    };
    const parsed = signupSchema.safeParse(input);
    const found = fieldErrors(
      parsed.success ? [] : parsed.error.issues,
      { ...input, mobile: values.phoneNumber },
      t,
    );
    // A number can look international and still not exist in the chosen country.
    if (!e164 && values.phoneNumber.trim()) found.mobile = t('error.mobile');
    setErrors(found);
    if (!parsed.success || Object.keys(found).length) return;

    setBusy(true);
    try {
      await session.signup(parsed.data); // then on to the customer page
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ email: t('auth.signup.emailTaken') });
      } else if (error instanceof ApiError && error.status === 429) {
        setAlert(t('auth.signup.tooMany'));
      } else if (invalidFields(error).length) {
        setErrors(Object.fromEntries(invalidFields(error).map((f) => [f, t('error.invalid')])));
      } else {
        setAlert(
          t(error instanceof ApiError && error.status === 0 ? 'error.network' : 'error.server'),
        );
      }
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
      <h1 className={styles.title}>{t('auth.signup.title')}</h1>
      {alert && (
        <p className={styles.alert} role="alert">
          {alert}
        </p>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.groupTitle}>{t('auth.signup.account')}</legend>
        <Field id="email" label={t('field.email')} error={errors.email}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              type="email"
              autoComplete="email"
              ltr
              value={values.email}
              onChange={set('email')}
            />
          )}
        </Field>
        <Field
          id="password"
          label={t('field.password')}
          error={errors.password}
          hint={t('field.passwordHint', { min: PASSWORD_MIN_LENGTH })}
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
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.groupTitle}>{t('auth.signup.aboutYou')}</legend>
        <Field id="fullName" label={t('field.fullName')} error={errors.fullName}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              autoComplete="name"
              value={values.fullName}
              onChange={set('fullName')}
            />
          )}
        </Field>
        <Field id="mobile" label={t('field.mobile')} error={errors.mobile}>
          {(a11y) => (
            <div className={styles.row}>
              <select
                className={styles.input}
                aria-label={t('field.mobileCountry')}
                value={values.phoneCountry}
                onChange={(e) => {
                  set('phoneCountry')(e.target.value);
                }}
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {/* The code is isolated left to right, so "+963" stays whole in Arabic. */}
                    {`${c.name} ⁦+${c.dial}⁩`}
                  </option>
                ))}
              </select>
              <input
                {...a11y}
                className={cx(styles.input, styles.ltr)}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={values.phoneNumber}
                onChange={(e) => {
                  set('phoneNumber')(e.target.value);
                }}
              />
            </div>
          )}
        </Field>
        <Field id="dateOfBirth" label={t('field.dateOfBirth')} error={errors.dateOfBirth}>
          {(a11y) => (
            <input
              {...a11y}
              className={cx(styles.input, styles.ltr)}
              type="date"
              autoComplete="bday"
              max={dateInSyria()}
              value={values.dateOfBirth}
              onChange={(e) => {
                set('dateOfBirth')(e.target.value);
              }}
            />
          )}
        </Field>
        <Field id="occupation" label={t('field.occupation')} error={errors.occupation} optional>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              autoComplete="organization-title"
              value={values.occupation}
              onChange={set('occupation')}
            />
          )}
        </Field>
        <Field
          id="paintPurpose"
          label={t('field.paintPurpose')}
          error={errors.paintPurpose}
          optional
        >
          {(a11y) => (
            <textarea
              {...a11y}
              className={styles.input}
              value={values.paintPurpose}
              onChange={(e) => {
                set('paintPurpose')(e.target.value);
              }}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.groupTitle}>{t('auth.signup.location')}</legend>
        <Field id="governorate" label={t('field.governorate')} error={errors.governorate}>
          {(a11y) => (
            <select
              {...a11y}
              className={styles.input}
              value={values.governorate}
              onChange={(e) => {
                set('governorate')(e.target.value);
              }}
            >
              <option value="">{t('ui.choose')}</option>
              {GOVERNORATES.map((g) => (
                <option key={g} value={g}>
                  {t(`governorate.${g}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {outside && (
          <Field id="country" label={t('field.country')} error={errors.country}>
            {(a11y) => (
              <TextInput
                a11y={a11y}
                autoComplete="country-name"
                value={values.country}
                onChange={set('country')}
              />
            )}
          </Field>
        )}
        <Field id="cityArea" label={t('field.cityArea')} error={errors.cityArea}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              autoComplete="address-level2"
              value={values.cityArea}
              onChange={set('cityArea')}
            />
          )}
        </Field>
      </fieldset>

      <button className={styles.submit} type="submit" disabled={busy}>
        {t('auth.signup.submit')}
      </button>
      <p className={styles.aside}>
        {t('auth.signup.haveAccount')} <Link to="/login">{t('auth.signup.toLogin')}</Link>
      </p>
    </form>
  );
}
