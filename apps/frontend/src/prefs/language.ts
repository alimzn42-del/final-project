/**
 * The language before login: the visitor's last choice in this browser, else
 * English (doc 03). After login the user's saved language wins.
 */
import { LANGUAGES, type Language } from '@mixline/shared';

import { DEFAULT_LANGUAGE } from '../i18n/i18n';

const KEY = 'mixline.language';

export function visitorLanguage(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    if ((LANGUAGES as readonly string[]).includes(saved ?? '')) return saved as Language;
  } catch {
    // storage blocked (private window): use the default
  }
  return DEFAULT_LANGUAGE;
}

export function rememberVisitorLanguage(lang: Language): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
}
