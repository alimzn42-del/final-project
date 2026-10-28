/** Lint fixture: the same form with every text through i18next. The lint rule must accept it. */
import { useTranslation } from 'react-i18next';

export function Translated() {
  const { t } = useTranslation();
  return (
    <form className="login" id="login-form">
      <p>{t('auth.welcome')}</p>
      <input type="email" autoComplete="email" placeholder={t('auth.email')} />
      <button type="button" aria-label={t('ui.close')} />
    </form>
  );
}
