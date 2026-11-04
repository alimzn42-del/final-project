import { sensorsByTopic } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import { checkCycle, type Heard } from './cycle.js';
import { seededRandom } from './random.js';
import { TICK_MS } from './schedule.js';
import { Simulation } from './simulation.js';
import { realMachine, realSimConfig } from './testing.js';

const machine = realMachine();
const config = realSimConfig();
const T0 = Date.parse('2026-11-04T08:00:00.000Z');

/** What an MQTT listener hears from the simulator: one batch and the refill after it. */
function listen(seed: number): Heard[] {
  const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(seed) });
  const heard: Heard[] = [];
  let finished = false;
  for (let t = T0; t < T0 + 12 * 60_000; t += TICK_MS) {
    for (const m of sim.advanceTo(t)) {
      // Through JSON, as on the wire.
      heard.push({ topic: m.topic, payload: JSON.parse(JSON.stringify(m.payload)) as unknown });
      if (m.kind === 'batch' && m.event === 'finished') finished = true;
      if (finished && m.kind === 'batch' && m.event === 'refill') return heard;
    }
  }
  return heard;
}

const value = (h: Heard) => (h.payload as { value: number }).value;
const failures = (heard: Heard[]) =>
  checkCycle(machine, config, heard).filter(([, problems]) => problems.length > 0);

describe('the full-cycle check (sim:check --cycle)', () => {
  it.each([1, 2, 3])('passes on a simulated batch (seed %i)', (seed) => {
    const results = checkCycle(machine, config, listen(seed));
    expect(results.filter(([, p]) => p.length)).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(9);
  });

  const heard = listen(1);
  const topicOf = (id: string) => {
    const found = [...sensorsByTopic(machine)].find(([, sensor]) => sensor.id === id);
    if (!found) throw new Error(`no sensor ${id}`);
    return found[0];
  };

  it('catches a dye scale that disagrees with the vessel', () => {
    // From the end of the first cyan dose on, the cyan scale reads 3 g low: that dose seems to
    // take 3 g more from the tank than the vessel received.
    const pump = topicOf('dyeCPump.on');
    const tank = topicOf('dyeC.mass');
    const firstOn = heard.findIndex((h) => h.topic === pump && value(h) === 1);
    const firstOff = heard.findIndex((h, i) => i > firstOn && h.topic === pump && value(h) === 0);
    expect(firstOff).toBeGreaterThan(firstOn);
    const changed = heard.map((h, i) =>
      h.topic === tank && i > firstOff
        ? { ...h, payload: { ...(h.payload as object), value: value(h) - 3 } }
        : h,
    );
    const failed = failures(changed);
    expect(failed.map(([name]) => name)).toEqual([expect.stringMatching(/^every dye dose/)]);
    expect(failed[0]?.[1][0]).toMatch(/^cyan at .*tank dropped .*vessel gained/);
  });

  it('catches a cup that weighs differently at the check station', () => {
    const check = topicOf('check.mass');
    const changed = heard.map((h) =>
      h.topic === check && value(h) > 100
        ? { ...h, payload: { ...(h.payload as object), value: value(h) + 4 } }
        : h,
    );
    expect(
      failures(changed)
        .map(([name]) => name)
        .some((n) => n.startsWith('every fill')),
    ).toBe(true);
  });

  it('says so when no whole batch was heard', () => {
    const half = heard.slice(0, Math.floor(heard.length / 2));
    expect(failures(half)).toEqual([
      ['one full batch (started to finished) was heard', ['no complete batch in the messages']],
    ]);
  });
});
