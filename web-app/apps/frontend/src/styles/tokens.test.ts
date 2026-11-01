// @vitest-environment node
/**
 * docs/06-brand.md: text colours meet WCAG AA (4.5:1) on `bg` and `surface` in
 * both themes, and the two copies of the light theme in tokens.css are equal.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Read from disk: Vitest replaces imported CSS with an empty file.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** The custom properties declared in the first block that follows `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)) {
    if (name && hex) tokens[name] = hex;
  }
  return tokens;
}

const dark = block(':root');
const light = block(":root[data-theme='light']");
const lightFromBrowser = block(":root:not([data-theme='dark'])");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string | undefined, b: string | undefined): number {
  if (!a || !b) throw new Error('missing token');
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('colour tokens', () => {
  it('the light theme is the same whether it comes from the browser or the account', () => {
    expect(lightFromBrowser).toEqual(light);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  describe.each([
    ['dark', dark],
    ['light', light],
  ])('%s theme: WCAG AA (4.5:1) for text', (_name, t) => {
    it.each(['--text', '--text-muted', '--link', '--fault'])('%s on --bg and --surface', (fg) => {
      expect(contrast(t[fg], t['--bg'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[fg], t['--surface'])).toBeGreaterThanOrEqual(4.5);
    });

    it('--on-brand on --brand (button text)', () => {
      expect(contrast(t['--on-brand'], t['--brand'])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
