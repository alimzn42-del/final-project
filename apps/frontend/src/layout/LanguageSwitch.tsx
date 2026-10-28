/** Switches between English and Arabic; the button shows the other language in its own script. */
import type { Language } from '@mixline/shared';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '../prefs/preferences';
import styles from './LanguageSwitch.module.css';

export function LanguageSwitch() {
  const { language, changeLanguage } = usePreferences();
  const { t } = useTranslation();
  const other: Language = language === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      className={styles.switch}
      lang={other}
      title={t('lang.label')}
      onClick={() => {
        changeLanguage(other);
      }}
    >
      {t(`lang.${other}`)}
    </button>
  );
}
