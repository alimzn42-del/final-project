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

    it('timeline bands: each word reads on its band (4.5:1)', () => {
      for (const n of [1, 2, 3, 4]) {
        expect(
          contrast(t[`--band-ink-${String(n)}`], t[`--band-${String(n)}`]),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('timeline bands: the faintest still stands out from the panel (2:1), and each step is darker or lighter in turn', () => {
      expect(contrast(t['--band-1'], t['--surface'])).toBeGreaterThanOrEqual(2);
      const away = [1, 2, 3, 4].map((n) => contrast(t[`--band-${String(n)}`], t['--surface']));
      expect(away).toEqual([...away].sort((a, b) => a - b));
    });

    it('the line chart (brand blue) stands out from the panel (3:1)', () => {
      expect(contrast(t['--brand'], t['--surface'])).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('the charts never use state colours (owner, step 14)', () => {
  it('chart.module.css has no --ok, --warning, --fault or --offline', () => {
    const chartCss = readFileSync(new URL('../chart/chart.module.css', import.meta.url), 'utf8');
    // Comments may name them (the file says why they are not used); rules may not.
    const rules = chartCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/var\(--(ok|warning|fault|offline)\)/);
  });
});
