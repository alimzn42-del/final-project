import { type Machine, machineSchema, sensorsByTopic } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import { PLACE } from './plant.js';
import { seededRandom } from './random.js';
import { activeRecipes, skipMessage } from './recipes.js';
import { TICK_MS } from './schedule.js';
import { Simulation } from './simulation.js';
import { rawMachine, realMachine, realSimConfig } from './testing.js';

const config = realSimConfig();
const recipes = config.recipes.list;

/** The real machine.json with these parts marked `installed: false`. */
function withoutParts(...ids: string[]): Machine {
  const raw = rawMachine();
  for (const c of raw.components as { id: string; installed?: boolean }[]) {
    if (ids.includes(c.id)) c.installed = false;
  }
  return machineSchema.parse(raw);
}

describe('recipes that need a pump not installed are skipped (owner, step 16)', () => {
  it('runs every recipe while every pump is installed (as now)', () => {
    expect(activeRecipes(recipes, new Set())).toEqual({ active: recipes, skipped: [] });
    expect(new Simulation(realMachine(), config, { startMs: 0 }).skipped).toEqual([]);
  });

  it('skips the recipes that need it, and says why', () => {
    const { active, skipped } = activeRecipes(recipes, new Set(['black']));
    expect(active.map((r) => r.id)).toEqual(['green', 'orange', 'purple']);
    expect(skipped).toEqual([
      { recipe: 'brown', dyes: ['black'] },
      { recipe: 'navy', dyes: ['black'] },
    ]);
    expect(skipMessage({ recipe: 'navy', dyes: ['cyan', 'black'] })).toBe(
      'recipe "navy" skipped: it needs cyan and black, and machine.json says that pump is not installed',
    );
  });

  it('reads it from machine.json: black pump not installed, black never dosed, its sensors silent', () => {
    const T0 = Date.parse('2026-11-04T08:00:00.000Z');
    const machine = withoutParts('dyeKPump');
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(5) });
    expect(sim.skipped.map((s) => s.recipe)).toEqual(['brown', 'navy']);
    const byTopic = sensorsByTopic(machine);
    const heard = new Set<string>();
    const targets: string[] = [];
    let finished = 0;
    for (let t = T0; finished < 4; t += TICK_MS) {
      for (const m of sim.advanceTo(t)) {
        if (m.kind === 'reading') heard.add(byTopic.get(m.topic)?.id ?? m.topic);
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
    // A part that is not there sends nothing; the black tank's own scale still does.
    expect([...heard].filter((id) => id.startsWith('dyeKPump.'))).toEqual([]);
    expect(heard.has('dyeK.mass')).toBe(true);
    expect(heard.size).toBe(60 - 4);
  });

  it('refuses to start when every recipe needs a pump not installed, listing each skip', () => {
    const start = () =>
      new Simulation(withoutParts('dyeCPump', 'dyeMPump'), config, { startMs: 0 });
    expect(start).toThrow(
      /no recipe can run:\n- recipe "green" skipped[\s\S]*recipe "navy" skipped/,
    );
  });

  it('a part that is designed but not decided ("pending") still runs: only `installed` counts', () => {
    expect(realMachine().components.find((c) => c.id === 'dyeKTank')?.status).toBe('pending');
    expect(new Simulation(realMachine(), config, { startMs: 0 }).skipped).toEqual([]);
  });
});
