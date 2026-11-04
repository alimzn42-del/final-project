import { describe, expect, it } from 'vitest';

import { PLACE } from './plant.js';
import { seededRandom } from './random.js';
import { activeRecipes, skipMessage } from './recipes.js';
import { TICK_MS } from './schedule.js';
import { Simulation } from './simulation.js';
import { realMachine, realSimConfig } from './testing.js';

const config = realSimConfig();
const recipes = config.recipes.list;

describe('recipes with a deferred dye are skipped (owner, step 15)', () => {
  it('runs every recipe while no dye is deferred', () => {
    expect(activeRecipes(recipes, new Set())).toEqual({ active: recipes, skipped: [] });
  });

  it('skips the recipes that need a deferred dye, and says why', () => {
    const { active, skipped } = activeRecipes(recipes, new Set(['black']));
    expect(active.map((r) => r.id)).toEqual(['green', 'orange', 'purple']);
    expect(skipped).toEqual([
      { recipe: 'brown', dyes: ['black'] },
      { recipe: 'navy', dyes: ['black'] },
    ]);
    expect(skipMessage({ recipe: 'navy', dyes: ['cyan', 'black'] })).toBe(
      'recipe "navy" skipped: it needs cyan and black, which machine.json marks as deferred',
    );
  });

  it('never doses a deferred dye: black stays untouched over four batches', () => {
    const T0 = Date.parse('2026-11-04T08:00:00.000Z');
    const sim = new Simulation(realMachine(), config, {
      startMs: T0,
      random: seededRandom(5),
      deferredDyes: new Set(['black']),
    });
    expect(sim.skipped.map((s) => s.recipe)).toEqual(['brown', 'navy']);
    const targets: string[] = [];
    let finished = 0;
    for (let t = T0; finished < 4; t += TICK_MS) {
      for (const m of sim.advanceTo(t)) {
        if (m.kind !== 'batch') continue;
        if (m.event === 'started' && 'recipe' in m.payload)
          targets.push(m.payload.recipe.targetLab.join());
        if (m.event === 'finished') finished++;
      }
    }
    // Green, orange, purple, then green again.
    expect(targets[3]).toBe(targets[0]);
    expect(new Set(targets).size).toBe(3);
    expect(sim.plant.stepsTotal.black).toBe(0);
    expect(sim.plant.ledger.mass(PLACE.dyeTank('black'))).toBe(config.supplies.dyeTankFullG);
  });

  it('refuses to start when every recipe needs a deferred dye, listing each skip', () => {
    const start = () =>
      new Simulation(realMachine(), config, {
        startMs: 0,
        deferredDyes: new Set(['cyan', 'magenta']),
      });
    expect(start).toThrow(
      /no recipe can run:\n- recipe "green" skipped[\s\S]*recipe "navy" skipped/,
    );
  });
});
