/**
 * Which recipes the simulator can run (owner, step 16): a recipe that needs a dye whose pump is
 * not installed (machine.json `installed: false`) is skipped, and the skip is logged. The rest run
 * in their order from config/simulator.json.
 */
import { DYES, type Dye, type Recipe } from './simConfig.js';

/** The dyes a recipe uses (more than 0 g/kg), in the shelf order. */
export function dyesOf(recipe: Recipe): Dye[] {
  return DYES.filter((d) => recipe.dyesGPerKg[d] > 0);
}

export interface Skipped {
  recipe: string;
  /** The dyes it needs whose pump is not installed. */
  dyes: Dye[];
}

export function activeRecipes(
  recipes: readonly Recipe[],
  notInstalled: ReadonlySet<Dye>,
): { active: Recipe[]; skipped: Skipped[] } {
  const active: Recipe[] = [];
  const skipped: Skipped[] = [];
  for (const recipe of recipes) {
    const missing = dyesOf(recipe).filter((d) => notInstalled.has(d));
    if (missing.length) skipped.push({ recipe: recipe.id, dyes: missing });
    else active.push(recipe);
  }
  return { active, skipped };
}

/** The log line for a skipped recipe. */
export const skipMessage = (s: Skipped) =>
  `recipe "${s.recipe}" skipped: it needs ${s.dyes.join(' and ')}, and machine.json says that pump is not installed`;
