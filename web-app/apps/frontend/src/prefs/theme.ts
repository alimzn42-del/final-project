/**
 * Dark or light (owner, step 11): the theme saved with the user's account, or
 * the browser's setting when there is none (before login, and for users who
 * never picked one). tokens.css does the rest from the data-theme attribute.
 */
import type { Theme } from '@mixline/shared';

export function applyTheme(saved: Theme | null): void {
  if (saved) document.documentElement.dataset.theme = saved;
  else delete document.documentElement.dataset.theme;
}

/** The theme on screen now: the saved one, or what the browser asks for. */
export function shownTheme(): Theme {
  const saved = document.documentElement.dataset.theme;
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
