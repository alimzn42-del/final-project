/**
 * The users page, /users, managers only (owner, step 16): staff accounts, a new account, and the
 * departments. Every change is checked and recorded by the backend (lockout, audit log); the page
 * says what happened in a status line and loads the lists again.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { InHeader } from '../layout/headerSlot';
import pageStyles from '../pages/pages.module.css';
import { useAccounts } from './accounts';
import { Departments } from './Departments';
import { NewAccount } from './NewAccount';
import { StaffList } from './StaffList';
import styles from './users.module.css';

export function UsersPage() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const [said, setSaid] = useState('');

  const changed = (message: string) => {
    setSaid(message);
    accounts.reload();
  };

  return (
    <section className={styles.page}>
      <InHeader>
        <h1 className={pageStyles.headerTitle}>{t('page.users')}</h1>
      </InHeader>
      <p className={styles.said} role="status">
        {said}
      </p>
      {accounts.status === 'failed' && (
        <div className={styles.failed} role="alert">
          <p>{t('ui.loadFailed')}</p>
          <button type="button" className={styles.button} onClick={accounts.reload}>
            {t('ui.retry')}
          </button>
        </div>
      )}
      {accounts.status === 'loading' ? (
        <p className={pageStyles.muted}>{t('ui.loading')}</p>
      ) : (
        <>
          <StaffList
            staff={accounts.staff}
            departments={accounts.departments}
            onChanged={changed}
          />
          <NewAccount departments={accounts.departments} onChanged={changed} />
          <Departments departments={accounts.departments} onChanged={changed} />
        </>
      )}
    </section>
  );
}
