/** Everything the pages rely on: labels, session, language and theme. The router is added by the caller. */
import type { i18n as I18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PreferencesProvider } from '../prefs/preferences';
import { SessionProvider } from '../session/session';

export function AppProviders({ i18n, children }: { i18n: I18n; children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <SessionProvider>
        <PreferencesProvider i18n={i18n}>{children}</PreferencesProvider>
      </SessionProvider>
    </I18nextProvider>
  );
}
