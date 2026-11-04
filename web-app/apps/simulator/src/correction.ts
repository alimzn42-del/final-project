/**
 * The colour side of the batch (plan step 15): the target of a recipe, what the camera sees,
 * and how much dye a correction adds. The models come from shared/color.ts (Beer–Lambert,
 * CIEDE2000); the dye strengths from config/simulator.json.
 *
 * A correction works in absorbance, where dyes simply add up: the missing absorbance per channel
 * (target minus measured) is covered first with more dye in the recipe's own ratios, then any
 * hue left over with the least extra dye. Dye can only be added, never removed, so nothing
 * negative is ever dosed.
 */
import {
  absorbanceToLab,
  deltaE2000,
  type Lab,
  labToAbsorbance,
  mixtureAbsorbance,
  type Rgb,
} from '@mixline/shared';

import { DYES, type Dye, type Recipe, type SimConfig } from './simConfig.js';

export type PerDye = Record<Dye, number>;
export const NO_DYE: PerDye = { cyan: 0, magenta: 0, yellow: 0, black: 0 };

/** Clear water, the reference for the rinse check. */
export const CLEAR_WATER: Lab = [100, 0, 0];

/** The recipe's dyes per kg of mixture (the recipe gives them per kg of base). */
export function recipeConcentration(recipe: Recipe): PerDye {
  const total = 1000 + DYES.reduce((sum, d) => sum + recipe.dyesGPerKg[d], 0);
  return perDye((d) => (recipe.dyesGPerKg[d] / total) * 1000);
}

/**
 * The colour the camera sees through the cell for these concentrations (g/kg of mixture).
 * `strength` scales each dye: a lot that is weaker or stronger than the nominal model.
 */
export function cellLab(config: SimConfig, concentration: PerDye, strength?: PerDye): Lab {
  const effective = perDye((d) => concentration[d] * (strength?.[d] ?? 1));
  return absorbanceToLab(mixtureAbsorbance(effective, config.dyes.absorbance, pathCm(config)));
}

/** The target colour of a recipe: what the nominal model predicts for it. */
export function recipeTarget(config: SimConfig, recipe: Recipe): Lab {
  return cellLab(config, recipeConcentration(recipe));
}

export const deltaE = deltaE2000;

/**
 * How much of each dye (g per kg of mixture) brings `measured` to `target`, by the nominal
 * model. Never negative. `recipe` gives the ratios to top up in first.
 */
export function missingDye(config: SimConfig, recipe: Recipe, measured: Lab, target: Lab): PerDye {
  const path = pathCm(config);
  const columns = DYES.map((d) => scaledRgb(config.dyes.absorbance[d], path));
  const need = subtract(labToAbsorbance(target), labToAbsorbance(measured));

  // 1. More of the recipe, in its own ratios: the best non-negative multiple.
  const ratios = recipeConcentration(recipe);
  const recipeColumn = DYES.reduce<Rgb>(
    (sum, d, i) => add(sum, scaledRgb(columns[i] ?? [0, 0, 0], ratios[d])),
    [0, 0, 0],
  );
  const share = Math.max(0, dot(recipeColumn, need) / dot(recipeColumn, recipeColumn));
  const topUp = perDye((d) => ratios[d] * share);

  // 2. Whatever hue is left, with the least extra dye (non-negative least squares).
  const left = subtract(need, scaledRgb(recipeColumn, share));
  const fix = nonNegativeFit(columns, left);
  return perDye((d, i) => topUp[d] + (fix[i] ?? 0));
}

const pathCm = (config: SimConfig) => config.camera.pathMm / 10;

function perDye(value: (dye: Dye, index: number) => number): PerDye {
  return Object.fromEntries(DYES.map((d, i) => [d, value(d, i)])) as PerDye;
}

const scaledRgb = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];
const add = (x: Rgb, y: Rgb): Rgb => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
const subtract = (x: Rgb, y: Rgb): Rgb => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
const dot = (x: Rgb, y: Rgb) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];

/**
 * Non-negative least squares for 4 dyes and 3 channels: tries every set of up to 3 dyes, solves
 * it exactly by least squares, keeps the sets whose amounts are all ≥ 0, and picks the closest
 * fit (then the least dye). Small enough to try them all.
 */
export function nonNegativeFit(columns: readonly Rgb[], target: Rgb): number[] {
  let best = { error: dot(target, target), total: 0, amounts: columns.map(() => 0) };
  const n = columns.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const set = [...Array(n).keys()].filter((i) => mask & (1 << i));
    if (set.length > 3) continue;
    const solved = leastSquares(
      set.map((i) => columns[i] ?? [0, 0, 0]),
      target,
    );
    if (!solved?.every((x) => x >= 0)) continue;
    const amounts = columns.map(() => 0);
    let fitted: Rgb = [0, 0, 0];
    for (const [k, i] of set.entries()) {
      const x = solved[k] ?? 0;
      amounts[i] = x;
      fitted = add(fitted, scaledRgb(columns[i] ?? [0, 0, 0], x));
    }
    const miss = subtract(target, fitted);
    const error = dot(miss, miss);
    const total = solved.reduce((s, x) => s + x, 0);
    const closer = error < best.error - 1e-12;
    const asClose = Math.abs(error - best.error) <= 1e-12;
    if (closer || (asClose && total < best.total)) best = { error, total, amounts };
  }
  return best.amounts;
}

/** Solves (AᵀA)x = Aᵀb for up to 3 columns; undefined when the columns are not independent. */
function leastSquares(columns: readonly Rgb[], b: Rgb): number[] | undefined {
  const k = columns.length;
  const m = columns.map((ci) => [...columns.map((cj) => dot(ci, cj)), dot(ci, b)]);
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < k; c++) {
    let pivot = c;
    for (let r = c + 1; r < k; r++) {
      if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[pivot]?.[c] ?? 0)) pivot = r;
    }
    const top = m[pivot];
    if (!top || Math.abs(top[c] ?? 0) < 1e-12) return undefined;
    [m[c], m[pivot]] = [top, m[c] ?? top];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const row = m[r];
      const f = (row?.[c] ?? 0) / (top[c] ?? 1);
      if (row) for (let j = c; j <= k; j++) row[j] = (row[j] ?? 0) - f * (top[j] ?? 0);
    }
  }
  return m.map((row, i) => (row[k] ?? 0) / (row[i] ?? 1));
}
