import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './pages.module.css';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className={styles.center}>
      <h1 className={styles.title}>{t('ui.pageNotFound')}</h1>
      <Link to="/">{t('ui.goHome')}</Link>
    </main>
  );
}
