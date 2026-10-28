/** Pages of logged-in users: the header (docs/06-brand.md "Layout") above the page. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { landingPath } from '../app/landing';
import { Logo } from '../brand/Logo';
import { useUser } from '../session/session';
import styles from './AppShell.module.css';
import { LanguageSwitch } from './LanguageSwitch';
import { UserMenu } from './UserMenu';

export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const { t } = useTranslation();
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to={landingPath(user)} className={styles.brand} title={t('ui.home')}>
          <Logo variant="simple" size={32} />
          <span className={styles.wordmark}>{t('brand.name')}</span>
        </Link>
        <div className={styles.tools}>
          <LanguageSwitch />
          <UserMenu />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
