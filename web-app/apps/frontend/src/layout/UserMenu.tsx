/** The user's name and role; opens theme choice, password change and logout. */
import type { Theme } from '@mixline/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { usePreferences } from '../prefs/preferences';
import { useSession, useUser } from '../session/session';
import styles from './UserMenu.module.css';

/** null: follow the browser's setting again. */
const THEME_CHOICES: readonly (Theme | null)[] = ['dark', 'light', null];

export function UserMenu() {
  const user = useUser();
  const session = useSession();
  const { changeTheme } = usePreferences();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.menu} ref={menu}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="user-menu"
        title={t('menu.account')}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className={styles.name}>{user.fullName ?? user.email}</span>
        <span className={styles.role}>{t(`role.${user.role}`)}</span>
      </button>
      {open && (
        <div id="user-menu" className={styles.panel}>
          {changeTheme && (
            <fieldset className={styles.themes}>
              <legend className={styles.legend}>{t('theme.label')}</legend>
              {THEME_CHOICES.map((choice) => (
                <button
                  key={choice ?? 'system'}
                  type="button"
                  className={styles.choice}
                  aria-pressed={user.theme === choice}
                  onClick={() => {
                    void changeTheme(choice).catch(() => undefined);
                  }}
                >
                  {t(choice ? `theme.${choice}` : 'theme.system')}
                </button>
              ))}
            </fieldset>
          )}
          {!user.mustChangePassword && (
            <Link
              to="/change-password"
              className={styles.item}
              onClick={() => {
                setOpen(false);
              }}
            >
              {t('menu.changePassword')}
            </Link>
          )}
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              void session.logout();
            }}
          >
            {t('menu.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
