import { afterEach, describe, expect, it, vi } from 'vitest';

import { rememberVisitorLanguage, visitorLanguage } from './language';
import { applyTheme, shownTheme } from './theme';

function browserPrefersLight(light: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: light && query.includes('light') }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  applyTheme(null);
});

describe('theme (owner, step 11)', () => {
  it('follows the browser while nothing is saved', () => {
    applyTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    browserPrefersLight(true);
    expect(shownTheme()).toBe('light');
    browserPrefersLight(false);
    expect(shownTheme()).toBe('dark');
  });

  it('a saved theme wins over the browser', () => {
    browserPrefersLight(true);
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(shownTheme()).toBe('dark');
  });
});

describe('language before login', () => {
  it('is English on a first visit, then the visitor’s last choice', () => {
    expect(visitorLanguage()).toBe('en');
    rememberVisitorLanguage('ar');
    expect(visitorLanguage()).toBe('ar');
  });

  it('ignores a stored value that is not a language', () => {
    localStorage.setItem('mixline.language', 'fr');
    expect(visitorLanguage()).toBe('en');
  });
});
