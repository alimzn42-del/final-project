import { describe, expect, it } from 'vitest';

import {
  cellLab,
  clearWater,
  deltaE,
  missingDye,
  NO_DYE,
  nonNegativeFit,
  type PerDye,
  recipeConcentration,
  recipeTarget,
} from './correction.js';
import { dyesOf } from './recipes.js';
import { DYES, type Recipe } from './simConfig.js';
import { realSimConfig } from './testing.js';

const config = realSimConfig();
const recipe = (id: string): Recipe => {
  const r = config.recipes.list.find((x) => x.id === id);
  if (!r) throw new Error(`no recipe ${id}`);
  return r;
};
const share = (c: PerDye, k: number): PerDye =>
  Object.fromEntries(DYES.map((d) => [d, c[d] * k])) as PerDye;
const plus = (a: PerDye, b: PerDye): PerDye =>
  Object.fromEntries(DYES.map((d) => [d, a[d] + b[d]])) as PerDye;

describe('the flow cell (owner, step 17)', () => {
  it('sends the light through the liquid twice: 10 mm deep is a 20 mm path', () => {
    const c = { ...NO_DYE, cyan: 1 };
    const deeper = { ...config, camera: { ...config.camera, depthMm: 20 } };
    // Beer–Lambert: only path × concentration counts, so twice 10 mm of this dye colours like
    // twice 20 mm of half as much.
    expect(deltaE(cellLab(config, c), cellLab(deeper, share(c, 0.5)))).toBeLessThan(1e-9);
    expect(config.camera.depthMm).toBe(10);
  });

  it('sees clear water against the white patch, a little below white', () => {
    const [l] = clearWater(config);
    expect(l).toBeGreaterThan(95);
    expect(l).toBeLessThan(100);
    expect(cellLab(config, NO_DYE)).toEqual(clearWater(config));
  });
});

describe('the recipes make the colours they are named after', () => {
  const lab = (id: string) => recipeTarget(config, recipe(id));
  it('green, orange, purple, brown, navy', () => {
    const [, ga, gb] = lab('green');
    expect(ga).toBeLessThan(-20);
    expect(gb).toBeGreaterThan(20);
    const [, oa, ob] = lab('orange');
    expect(oa).toBeGreaterThan(15);
    expect(ob).toBeGreaterThan(30);
    const [, pa, pb] = lab('purple');
    expect(pa).toBeGreaterThan(15);
    expect(pb).toBeLessThan(-15);
    const [bl, ba, bb] = lab('brown');
    expect(bl).toBeLessThan(45);
    expect(ba).toBeGreaterThan(10);
    expect(bb).toBeGreaterThan(20);
    const [nl, , nb] = lab('navy');
    expect(nl).toBeLessThan(30);
    expect(nb).toBeLessThan(-25);
  });
});

describe('correction', () => {
  for (const r of config.recipes.list) {
    it(`${r.id}: the first dose is lighter than the target, one correction reaches it`, () => {
      const target = recipeTarget(config, r);
      const full = recipeConcentration(r);
      const first = share(full, config.batch.firstDoseShare);
      const seen = cellLab(config, first);
      // Approach from the light side (doc 01): lighter, and clearly off.
      expect(seen[0]).toBeGreaterThan(target[0]);
      expect(deltaE(seen, target)).toBeGreaterThan(config.batch.toleranceDeltaE);

      const add = missingDye(config, r, seen, target);
      for (const d of DYES) expect(add[d]).toBeGreaterThanOrEqual(0);
      // Only the recipe's own dyes (owner: the minimum dyes it needs).
      for (const d of DYES) if (!dyesOf(r).includes(d)) expect(add[d], d).toBe(0);
      expect(deltaE(cellLab(config, plus(first, add)), target)).toBeLessThan(0.1);
    });
  }

  it('also fixes a dye lot that colours more weakly than the model', () => {
    const r = recipe('green');
    const target = recipeTarget(config, r);
    const weakCyan = { ...NO_DYE, cyan: 0.9, magenta: 1, yellow: 1, black: 1 };
    let dosed = share(recipeConcentration(r), config.batch.firstDoseShare);
    for (let round = 0; round < 2; round++) {
      const seen = cellLab(config, dosed, weakCyan);
      dosed = plus(dosed, missingDye(config, r, seen, target));
    }
    expect(deltaE(cellLab(config, dosed, weakCyan), target)).toBeLessThan(
      config.batch.toleranceDeltaE,
    );
  });

  it('adds nothing when the colour is already right, or too dark', () => {
    const r = recipe('purple');
    const target = recipeTarget(config, r);
    expect(Object.values(missingDye(config, r, target, target)).every((g) => g < 1e-9)).toBe(true);
    const dark = cellLab(config, share(recipeConcentration(r), 1.3));
    for (const g of Object.values(missingDye(config, r, dark, target)))
      expect(g).toBeGreaterThanOrEqual(0);
  });
});

describe('non-negative least squares', () => {
  const columns = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ] as const;

  it('fits a reachable target exactly with the least dye', () => {
    const x = nonNegativeFit(columns, [2, 2, 2]);
    // [1,1,1] × 2 uses 2 units; the three single columns would use 6.
    [0, 0, 0, 2].forEach((v, i) => {
      expect(x[i]).toBeCloseTo(v, 9);
    });
  });

  it('never goes negative', () => {
    const x = nonNegativeFit(columns, [1, -1, 0.5]);
    for (const v of x) expect(v).toBeGreaterThanOrEqual(0);
    expect(x[0]).toBeCloseTo(1);
    expect(x[2]).toBeCloseTo(0.5);
  });
});
