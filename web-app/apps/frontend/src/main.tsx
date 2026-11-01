/**
 * The web app's entry point: fonts and colours, then the labels in the
 * visitor's language (from the backend), then the app.
 */
import './styles/fonts';
import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './app/App';
import { AppProviders } from './app/AppProviders';
import { createI18n, switchLanguage } from './i18n/i18n';
import { visitorLanguage } from './prefs/language';

async function start(root: HTMLElement): Promise<void> {
  const i18n = await createI18n();
  try {
    await switchLanguage(i18n, visitorLanguage());
  } catch {
    // Without labels nothing can be written in either language: show the
    // bilingual message that index.html carries for this one case.
    document.getElementById('boot-error')?.removeAttribute('hidden');
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <AppProviders i18n={i18n}>
          <App />
        </AppProviders>
      </BrowserRouter>
    </StrictMode>,
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');
void start(root);
