import { describe, expect, it } from 'vitest';

import { DYES, parseSimConfig } from './simConfig.js';
import { rawSimConfig, realSimConfig } from './testing.js';

describe('config/simulator.json', () => {
  it('is valid', () => {
    expect(() => realSimConfig()).not.toThrow();
  });

  it("has the owner's 5 colours, in turn, each with all four dyes", () => {
    const recipes = realSimConfig().recipes.list;
    expect(recipes.map((r) => r.id)).toEqual(['green', 'orange', 'violet', 'brown', 'grey']);
    for (const r of recipes) {
      for (const d of DYES) expect(r.dyesGPerKg[d], `${r.id} ${d}`).toBeGreaterThan(0);
    }
  });

  it("has the owner's numbers: about 1 cup in 20 rejected, ΔE ≤ 2.0", () => {
    const config = realSimConfig();
    expect(config.check.shortFillChance).toBe(0.05);
    expect(config.batch.toleranceDeltaE).toBe(2);
  });

  it('names every problem in a broken file', () => {
    const raw = rawSimConfig();
    raw.batch = { ...raw.batch, firstDoseShare: 1.5 };
    raw.pumps = { ...raw.pumps, baseGPerS: -1 };
    const recipes = raw.recipes as { list: { id: string }[] };
    recipes.list.push({ ...recipes.list[0], id: 'green' });
    expect(() => parseSimConfig(raw)).toThrow(
      /simulator\.json is invalid \(3 problem\(s\)\)[\s\S]*recipes\.list: recipe ids must be unique[\s\S]*batch\.firstDoseShare[\s\S]*pumps\.baseGPerS/,
    );
  });
});
