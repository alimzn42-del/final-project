/** Protected pages that exist in phase 1 but are empty (doc 03): the worker's tools, the customer area. */
import { useTranslation } from 'react-i18next';

import styles from './pages.module.css';

export function ComingSoonPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className={styles.title}>{t(titleKey)}</h1>
      <p className={styles.muted}>{t('ui.comingLater')}</p>
    </section>
  );
}
