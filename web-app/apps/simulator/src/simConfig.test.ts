import { describe, expect, it } from 'vitest';

import { dyesOf } from './recipes.js';
import { DYES, parseSimConfig } from './simConfig.js';
import { rawSimConfig, realSimConfig } from './testing.js';

describe('config/simulator.json', () => {
  it('is valid', () => {
    expect(() => realSimConfig()).not.toThrow();
  });

  it("has the owner's 5 recipes, each with the minimum dyes it needs", () => {
    const recipes = realSimConfig().recipes.list;
    expect(recipes.map((r) => [r.id, dyesOf(r)])).toEqual([
      ['green', ['cyan', 'yellow']],
      ['orange', ['magenta', 'yellow']],
      ['purple', ['cyan', 'magenta']],
      ['brown', ['magenta', 'yellow', 'black']],
      ['navy', ['cyan', 'magenta', 'black']],
    ]);
  });

  it('uses every dye pump in at least two recipes', () => {
    const recipes = realSimConfig().recipes.list;
    for (const d of DYES) {
      expect(recipes.filter((r) => dyesOf(r).includes(d)).length, d).toBeGreaterThanOrEqual(2);
    }
  });

  it('refuses a recipe list that uses a pump in fewer than two recipes', () => {
    const raw = rawSimConfig();
    const recipes = raw.recipes as { list: { id: string; dyesGPerKg: Record<string, number> }[] };
    // Black only in navy: brown loses it.
    for (const r of recipes.list) if (r.id === 'brown') r.dyesGPerKg.black = 0;
    expect(() => parseSimConfig(raw)).toThrow(/every dye pump must appear in at least two recipes/);
  });

  it("has the owner's numbers: about 1 cup in 20 rejected, ΔE ≤ 2.0", () => {
    const config = realSimConfig();
    expect(config.check.shortFillChance).toBe(0.05);
    expect(config.batch.toleranceDeltaE).toBe(2);
  });

  it("has the owner's order settings: 4 to 10 containers of 350 g (step 17)", () => {
    expect(realSimConfig().order).toMatchObject({
      containersMin: 4,
      containersMax: 10,
      fillG: 350,
    });
  });

  it('refuses an order whose smallest batch is above its largest', () => {
    const raw = rawSimConfig();
    raw.order = { ...raw.order, containersMin: 8, containersMax: 5 };
    expect(() => parseSimConfig(raw)).toThrow(
      /order\.containersMax: containersMin must not be above/,
    );
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
