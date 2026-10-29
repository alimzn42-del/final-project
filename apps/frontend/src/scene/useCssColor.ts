/**
 * A colour token from tokens.css, for the 3D scene (WebGL cannot read CSS).
 * Read again when the theme changes (a saved choice or the browser's setting).
 */
import { useEffect, useState } from 'react';

const read = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function useCssColor(name: string, fallback: string): string {
  const [value, setValue] = useState(() => read(name, fallback));
  useEffect(() => {
    const update = () => {
      setValue(read(name, fallback));
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, [name, fallback]);
  return value;
}
