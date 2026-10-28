import { describe, expect, it, vi } from 'vitest';

import ar from '../../../../config/locales/ar.json';
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

  it('picks the Arabic plural form from the number (owner, step 11)', async () => {
    const i18n = await createI18n();
    await switchLanguage(i18n, 'ar', () => Promise.resolve(ar));
    const short = (count: number) => i18n.t('error.passwordShort', { count });
    expect(short(1)).toBe('حرف واحد على الأقل');
    expect(short(2)).toBe('حرفان على الأقل');
    expect(short(8)).toBe('8 أحرف على الأقل');
    expect(short(11)).toBe('11 حرفاً على الأقل');
    expect(short(100)).toBe('100 حرف على الأقل');
    expect(i18n.t('error.tooYoung', { count: 18 })).toBe('يجب ألّا يقل عمرك عن 18 عاماً');
    expect(i18n.t('error.tooLong', { count: 500 })).toBe(
      'النص أطول من المسموح: 500 حرف على الأكثر',
    );
  });

  it('only Arabic is right-to-left', () => {
    expect([textDirection('ar'), textDirection('en')]).toEqual(['rtl', 'ltr']);
  });
});
