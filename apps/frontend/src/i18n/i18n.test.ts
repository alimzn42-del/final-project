import { describe, expect, it, vi } from 'vitest';

import { createI18n, switchLanguage, textDirection } from './i18n';

const dicts = {
  en: { 'part.dyeTank': '{{color}} dye tank', 'ui.simulation': 'SIMULATION' },
  ar: { 'part.dyeTank': 'خزان الصبغة {{color}}', 'ui.simulation': 'محاكاة' },
};

describe('i18n', () => {
  it('reads flat keys with dots, and fills placeholders', async () => {
    const i18n = await createI18n();
    await switchLanguage(i18n, 'en', (lang) => Promise.resolve(dicts[lang]));
    expect(i18n.t('ui.simulation')).toBe('SIMULATION');
    expect(i18n.t('part.dyeTank', { color: 'Cyan' })).toBe('Cyan dye tank');
  });

  it('Arabic switches the page to right-to-left; English back to left-to-right', async () => {
    const i18n = await createI18n();
    const load = vi.fn((lang: 'en' | 'ar') => Promise.resolve(dicts[lang]));
    await switchLanguage(i18n, 'ar', load);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.t('ui.simulation')).toBe('محاكاة');

    await switchLanguage(i18n, 'en', load);
    expect(document.documentElement.dir).toBe('ltr');
    await switchLanguage(i18n, 'ar', load);
    expect(load).toHaveBeenCalledTimes(2); // each language is loaded once
  });

  it('only Arabic is right-to-left', () => {
    expect([textDirection('ar'), textDirection('en')]).toEqual(['rtl', 'ltr']);
  });
});
