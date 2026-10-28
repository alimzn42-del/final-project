/** Login and sign-up (docs/06-brand.md "Layout"): centred logo and form over a faint facet pattern. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '../brand/Logo';
import styles from './AuthLayout.module.css';
import { LanguageSwitch } from './LanguageSwitch';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <LanguageSwitch />
      </div>
      <main className={styles.card}>
        <div className={styles.brand}>
          <Logo variant="full" size={88} label={t('brand.name')} />
          <p className={styles.wordmark}>{t('brand.name')}</p>
          <p className={styles.tagline}>{t('brand.tagline')}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
