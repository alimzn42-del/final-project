/** /line and below: the 3D line and its levels arrive in plan steps 12 to 14. */
import { useTranslation } from 'react-i18next';

import styles from './pages.module.css';

export function LinePage() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className={styles.title}>{t('page.line')}</h1>
      <p className={styles.muted}>{t('ui.underConstruction')}</p>
    </section>
  );
}
