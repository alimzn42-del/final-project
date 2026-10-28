/**
 * Language and theme on screen (doc 03 "Languages", "Theme"; owner, step 11).
 *
 * - Logged in: the user's saved language and theme; changing one saves it.
 * - Before login: the visitor's last language in this browser (else English),
 *   and the browser's theme.
 * - During a forced password change the backend accepts nothing but the
 *   password change (owner, step 9), so a language change stays in this
 *   browser and the theme cannot be changed.
 */
import type { Language, Theme } from '@mixline/shared';
import type { i18n as I18n } from 'i18next';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { switchLanguage } from '../i18n/i18n';
import { useSession } from '../session/session';
import { rememberVisitorLanguage, visitorLanguage } from './language';
import { applyTheme } from './theme';

export interface Preferences {
  language: Language;
  changeLanguage: (lang: Language) => void;
  /** Undefined when the theme cannot be changed (before login, forced password change). */
  changeTheme: ((theme: Theme | null) => Promise<void>) | undefined;
}

const PreferencesContext = createContext<Preferences | undefined>(undefined);

export function PreferencesProvider({ i18n, children }: { i18n: I18n; children: ReactNode }) {
  const session = useSession();
  const { state } = session;
  const user = state.status === 'in' ? state.user : undefined;
  const canSave = user !== undefined && !user.mustChangePassword;

  // The language for this session: the user's saved one, or the visitor's.
  const fromSession = user ? user.locale : visitorLanguage();
  const [chosen, setChosen] = useState<{ key: string; lang: Language } | undefined>(undefined);
  const sessionKey = user ? `${user.id}:${user.locale}` : 'visitor';
  const language = chosen?.key === sessionKey ? chosen.lang : fromSession;

  useEffect(() => {
    void switchLanguage(i18n, language).catch(() => undefined);
  }, [i18n, language]);

  const theme = user?.theme ?? null;
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const preferences: Preferences = {
    language,
    changeLanguage: (lang) => {
      if (canSave) {
        void session.savePreferences({ locale: lang }).catch(() => undefined);
        return;
      }
      if (!user) rememberVisitorLanguage(lang);
      setChosen({ key: sessionKey, lang });
    },
    changeTheme: canSave ? (next) => session.savePreferences({ theme: next }) : undefined,
  };

  return <PreferencesContext value={preferences}>{children}</PreferencesContext>;
}

export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('usePreferences() outside <PreferencesProvider>');
  return preferences;
}
