/**
 * Labels in English and Arabic (docs/03-ui-spec.md "Languages"). The texts are
 * not bundled into the app: they come from the backend (GET /api/locales/:lang),
 * so a new machine needs only new config files. Keys are flat
 * ("part.dyeTank"), so a dot is part of the key, not nesting. Arabic switches
 * the page to right-to-left; the 3D scene does not mirror.
 */
import type { Language, LocaleDict } from '@mixline/shared';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

/** Default on a first visit (doc 03). */
export const DEFAULT_LANGUAGE: Language = 'en';

export type LoadLocale = (lang: Language) => Promise<LocaleDict>;

export const fetchLocale: LoadLocale = async (lang) => {
  const res = await fetch(`/api/locales/${lang}`);
  if (!res.ok) throw new Error(`labels for "${lang}": HTTP ${String(res.status)}`);
  return (await res.json()) as LocaleDict;
};

export const textDirection = (lang: Language): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

export async function createI18n(): Promise<I18n> {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    resources: {},
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    // React escapes text itself.
    interpolation: { escapeValue: false },
  });
  return i18n;
}

/** Shows the app in `lang`: loads its labels once, then switches the texts and the page direction. */
export async function switchLanguage(
  i18n: I18n,
  lang: Language,
  load: LoadLocale = fetchLocale,
): Promise<void> {
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    i18n.addResourceBundle(lang, 'translation', await load(lang));
  }
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = textDirection(lang);
}
