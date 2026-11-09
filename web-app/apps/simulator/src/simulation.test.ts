import {
  type BatchEventPayload,
  decodeBatchMessage,
  decodeReading,
  machineStateSchema,
  type RefillEventPayload,
  sensorsByTopic,
} from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import { clearWater } from './correction.js';
import { OUTSIDE } from './ledger.js';
import { PLACE } from './plant.js';
import { seededRandom } from './random.js';
import { TICK_MS } from './schedule.js';
import type { SimConfig } from './simConfig.js';
import { type Message, Simulation, type SimulationOptions } from './simulation.js';
import { realMachine, realSimConfig } from './testing.js';

const machine = realMachine();
const config = realSimConfig();
const byTopic = sensorsByTopic(machine);
const T0 = Date.parse('2026-11-04T08:00:00.000Z');

interface Run {
  sim: Simulation;
  messages: Message[];
  /** Messages with the time they were sent. */
  at: number[];
}

/** Runs the simulation in fast time until `batches` batches have finished. */
function run(
  batches: number,
  options: Partial<SimulationOptions> = {},
  check?: (sim: Simulation) => void,
  settings: SimConfig = config,
): Run {
  const sim = new Simulation(machine, settings, {
    startMs: T0,
    random: seededRandom(1),
    ...options,
  });
  const messages: Message[] = [];
  const at: number[] = [];
  let finished = 0;
  for (let t = T0; finished < batches; t += TICK_MS) {
    if (t - T0 > batches * 10 * 60_000) throw new Error('the batches never finished');
    for (const m of sim.advanceTo(t)) {
      messages.push(m);
      at.push(t);
      if (m.kind === 'batch' && m.event === 'finished') finished++;
    }
    check?.(sim);
  }
  return { sim, messages, at };
}

const batchMessages = (r: Run) =>
  r.messages.flatMap((m, i) =>
    m.kind === 'batch' ? [{ event: m.event, payload: m.payload, t: r.at[i] ?? 0 }] : [],
  );
const events = (r: Run) =>
  batchMessages(r).filter(
    (
      m,
    ): m is {
      event: 'started' | 'step' | 'finished' | 'aborted';
      payload: BatchEventPayload;
      t: number;
    } => m.event !== 'refill',
  );
const refills = (r: Run) =>
  batchMessages(r).flatMap((m) => (m.event === 'refill' ? [m.payload as RefillEventPayload] : []));
/** How many containers each batch filled: its last count (the size is not published). */
const sizes = (r: Run) =>
  events(r)
    .filter((e) => e.event === 'finished')
    .map((e) => e.payload.containersDone);
/** The tuning file with every batch the same size. */
const fixedSize = (containers: number): SimConfig => ({
  ...config,
  order: { ...config.order, containersMin: containers, containersMax: containers },
});

describe('one batch, start to finish (doc 01 batch logic)', () => {
  const one = run(1);

  it('goes through the steps in order, with 0 to 2 corrections', () => {
    const seq = events(one)
      .filter((e, i, all) => e.event !== 'step' || e.payload.step !== all[i - 1]?.payload.step)
      .map((e) => (e.event === 'step' ? e.payload.step : `${e.event}:${e.payload.step}`))
      .join(' ');
    expect(seq).toMatch(
      /^started:baseFill dyeDose mix sample( correct mix sample){0,2} complete mix finalCheck filling rinse finished:rinse$/,
    );
  });

  it("fills the batch's containers, counting each one in the filling step (owner, step 17)", () => {
    const counts = events(one)
      .filter((e) => e.payload.step === 'filling' && e.event === 'step')
      .map((e) => e.payload.containersDone);
    const [size = 0] = sizes(one);
    expect(size).toBeGreaterThanOrEqual(config.order.containersMin);
    expect(size).toBeLessThanOrEqual(config.order.containersMax);
    expect(counts).toEqual(Array.from({ length: size + 1 }, (_, i) => i));
    const done = one.sim.plant.delivered + one.sim.plant.rejects;
    expect(done).toBe(size);
  });

  const minutes = (r: Run) => {
    const e = events(r);
    return ((e.at(-1)?.t ?? 0) - (e[0]?.t ?? 0)) / 60_000;
  };

  it('takes about 5 minutes with 6 containers, longer with more', () => {
    // About 4 in step 15 (owner); about 5 since step 17: 350 g instead of 300 g per container,
    // and the belt waits at its end until a worker takes each container.
    const six = minutes(run(1, {}, undefined, fixedSize(6)));
    expect(six).toBeGreaterThan(4.5);
    expect(six).toBeLessThan(5.8);
    const most = minutes(run(1, {}, undefined, fixedSize(config.order.containersMax)));
    expect(most).toBeGreaterThan(six);
  });

  it('keeps one batch id from started to finished, and the machine state with it', () => {
    const ids = new Set(events(one).map((e) => e.payload.batchId));
    expect(ids.size).toBe(1);
    const [id] = [...ids];
    expect(id).toBe('B-20261104-080005');
    const states = one.messages.flatMap((m) => (m.kind === 'state' ? [m.payload] : []));
    expect(states.map((s) => [s.status, s.batchId])).toEqual([
      ['idle', null],
      ['running', id],
      ['idle', null],
    ]);
  });

  it('sends only messages the shared formats accept, all from source sim', () => {
    for (const m of one.messages) {
      if (m.kind === 'reading') {
        const sensor = byTopic.get(m.topic);
        expect(sensor && decodeReading(sensor, m.payload).ok, m.topic).toBe(true);
      } else if (m.kind === 'state') {
        expect(machineStateSchema.safeParse(m.payload).success).toBe(true);
      } else {
        expect(decodeBatchMessage(machine, m.event, m.payload).ok).toBe(true);
      }
      expect(m.payload.source).toBe('sim');
    }
  });

  it('ends within ΔE 2.0 of the target, and the rinse leaves clear water', () => {
    const readings = (id: string) =>
      one.messages.flatMap((m, i) =>
        m.kind === 'reading' && byTopic.get(m.topic)?.id === id
          ? [{ v: m.payload.value, t: one.at[i] ?? 0 }]
          : [],
      );
    const steps = events(one);
    const filling = steps.find((e) => e.payload.step === 'filling')?.t ?? 0;
    const rinse = steps.find((e) => e.payload.step === 'rinse')?.t ?? 0;
    const atFill = readings('color.deltaE')
      .filter((r) => r.t <= filling)
      .at(-1);
    expect(atFill?.v).toBeLessThanOrEqual(config.batch.toleranceDeltaE);
    // Clear water in the flow cell reads a little below the white patch (owner, step 17).
    const finalL = readings('color.L').at(-1)?.v ?? 0;
    expect(finalL).toBeGreaterThan(clearWater(config)[0] - 1);
    expect(rinse).toBeGreaterThan(filling);
  });
});

describe('masses balance (step 15 acceptance)', () => {
  it('never creates or loses a gram, at any moment of three batches', () => {
    let worst = 0;
    run(3, {}, (sim) => {
      worst = Math.max(worst, Math.abs(sim.plant.ledger.total()));
    });
    expect(worst).toBeLessThan(1e-6);
  });

  it('every dye tank drops by what the vessel gains, and the vessel by what each cup gains', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(3) });
    const ledger = sim.plant.ledger;
    const snapshot = () => ({
      vessel: ledger.mass(PLACE.vessel),
      tanks: (['cyan', 'magenta', 'yellow', 'black'] as const).reduce(
        (s, d) => s + ledger.mass(PLACE.dyeTank(d)),
        0,
      ),
      cups: sim.plant.cups.reduce((s, c) => s + sim.plant.cupMass(c), 0),
      // Cups a worker took from the end of the belt (owner, step 17).
      away: ledger.mass(OUTSIDE),
      rejects: ledger.mass(PLACE.rejectBox),
      cell: ledger.mass(PLACE.cell),
    });
    let before = snapshot();
    let checked = 0;
    // Pumps switched on in one step move liquid in the next, so look at the state before it.
    let quiet = true;
    for (let t = T0; t < T0 + 4 * 60_000; t += TICK_MS) {
      sim.advanceTo(t);
      const now = snapshot();
      if (quiet) {
        // With only dye and filling pumps moving, the vessel's change is exactly their sum.
        const dyeIn = before.tanks - now.tanks;
        const toCups =
          now.cups + now.away + now.rejects - (before.cups + before.away + before.rejects);
        expect(now.vessel - before.vessel).toBeCloseTo(dyeIn - toCups, 6);
        if (dyeIn > 0 || toCups > 0) checked++;
      }
      quiet = !(['base', 'water', 'drain', 'sample'] as const).some((p) => sim.plant.isRunning(p));
      before = now;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('between batches: the service (owner, step 15)', () => {
  // While a cup waits at the end of the belt, the belt stands still (owner, step 17).
  let waitedAtEnd = 0;
  const many = run(20, { random: seededRandom(11) }, (sim) => {
    if (sim.plant.cupAtEnd() === undefined) return;
    waitedAtEnd++;
    expect(sim.plant.motorOn).toBe(false);
  });

  it('sends each refill in one message with batchId null', () => {
    const list = refills(many);
    expect(list.length).toBeGreaterThan(3);
    for (const r of list) expect(r.batchId).toBeNull();
  });

  it('stops the belt while a cup waits at its end, until a worker takes it (owner, step 17)', () => {
    expect(waitedAtEnd).toBeGreaterThan(100);
    const [low, high] = config.outfeed.takeAwayS;
    const ticks = (s: number) => (s * 1000) / TICK_MS;
    const cups = many.sim.plant.delivered;
    expect(waitedAtEnd).toBeGreaterThanOrEqual(cups * ticks(low) - cups);
    expect(waitedAtEnd).toBeLessThanOrEqual(cups * ticks(high) + cups);
  });

  it('draws the size of each batch between the order limits (owner, step 17)', () => {
    const all = sizes(many);
    expect(all).toHaveLength(20);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(config.order.containersMin);
    expect(Math.max(...all)).toBeLessThanOrEqual(config.order.containersMax);
    expect(new Set(all).size).toBeGreaterThan(3);
  });

  it('rejects about 1 cup in 20, and the counts add up', () => {
    const p = many.sim.plant;
    const good = p.delivered;
    const emptiedRejects = refills(many)
      .flatMap((r) => r.items.filter((i) => i.component === 'rejectBox'))
      .reduce((s, i) => s + i.amount, 0);
    const rejected = emptiedRejects + p.rejects;
    const filled = sizes(many).reduce((sum, n) => sum + n, 0);
    expect(good + rejected).toBe(filled);
    expect(rejected).toBeGreaterThanOrEqual(filled / 60);
    expect(rejected).toBeLessThanOrEqual(filled / 8);
  });

  it('refills the big tank, the rinse water, cups and lids before they run out, and says how much', () => {
    const items = refills(many).flatMap((r) => r.items);
    const tank = items.filter((i) => i.component === 'bigTank');
    expect(tank.length).toBeGreaterThan(2);
    for (const i of tank) expect(i).toMatchObject({ action: 'refilled', unit: 'g' });
    const rinse = items.filter((i) => i.component === 'waterContainer');
    expect(rinse.length).toBeGreaterThan(1);
    for (const i of rinse) expect(i).toMatchObject({ action: 'refilled', unit: 'g' });
    expect(items.some((i) => i.component === 'containerMagazine' && i.unit === 'count')).toBe(true);
    expect(items.some((i) => i.component === 'lidMagazine')).toBe(true);
    expect(items.some((i) => i.component === 'drainBucket' && i.action === 'emptied')).toBe(true);
  });

  it('never lets the container magazine run empty (alarms belong to the PLC)', () => {
    const empty = many.messages.filter(
      (m) =>
        m.kind === 'reading' &&
        byTopic.get(m.topic)?.id === 'magazine.empty' &&
        m.payload.value !== 0,
    );
    expect(empty).toEqual([]);
    expect(many.sim.plant.ledger.mass(PLACE.waterContainer)).toBeGreaterThan(0);
  });

  it('the big tank rises by exactly the grams the message names', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(11) });
    let previous = sim.plant.ledger.mass(PLACE.bigTank);
    let seen = 0;
    for (let t = T0; seen < 1; t += TICK_MS) {
      for (const m of sim.advanceTo(t)) {
        if (m.kind !== 'batch' || m.event !== 'refill') continue;
        const item = (m.payload as RefillEventPayload).items.find((i) => i.component === 'bigTank');
        if (!item) continue;
        expect(sim.plant.ledger.mass(PLACE.bigTank) - previous).toBeCloseTo(item.amount, 1);
        seen++;
      }
      previous = sim.plant.ledger.mass(PLACE.bigTank);
    }
  });
});

describe('publishing rates (doc 04)', () => {
  const one = run(1);
  const timesOf = (id: string) =>
    one.messages.flatMap((m, i) =>
      m.kind === 'reading' && byTopic.get(m.topic)?.id === id ? [one.at[i] ?? 0] : [],
    );
  const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] ?? 0));

  it('5 Hz while dosing or filling, 1 Hz otherwise', () => {
    const vessel = gaps(timesOf('vessel.mass'));
    expect(Math.min(...vessel)).toBe(200);
    expect(Math.max(...vessel)).toBe(1000);
    // The cyan tank's scale only speeds up while cyan is dosed.
    const cyan = gaps(timesOf('dyeC.mass'));
    const fastShare = cyan.filter((g) => g === 200).length / cyan.length;
    expect(fastShare).toBeGreaterThan(0.02);
    expect(fastShare).toBeLessThan(0.5);
    // The camera never runs fast: its reading is held between samples.
    expect(new Set(gaps(timesOf('color.L')))).toEqual(new Set([1000]));
  });

  it('digital sensors on change, at least every 5 s', () => {
    const pump = gaps(timesOf('basePump.on'));
    expect(Math.max(...pump)).toBeLessThanOrEqual(5000);
    expect(Math.min(...pump)).toBeLessThan(5000);
  });

  it('stays light for the backend: under 60 readings a second on average', () => {
    const readings = one.messages.filter((m) => m.kind === 'reading').length;
    const seconds = ((one.at.at(-1) ?? 0) - T0) / 1000;
    expect(readings / seconds).toBeLessThan(60);
  });
});

describe('the fault hook (doc 04: not used in phase 1)', () => {
  it('a worn cyan pump needs more cyan steps for the same colour', () => {
    const healthy = run(1).sim;
    const worn = run(1, { faults: { pumpDelivery: { cyan: 0.8 } } }).sim;
    const cyanUsed = (sim: Simulation) =>
      config.supplies.dyeTankFullG - sim.plant.ledger.mass(PLACE.dyeTank('cyan'));
    // The PLC commands more steps; what reaches the vessel stays about the same.
    expect(worn.plant.stepsTotal.cyan).toBeGreaterThan(healthy.plant.stepsTotal.cyan * 1.1);
    expect(Math.abs(cyanUsed(worn) / cyanUsed(healthy) - 1)).toBeLessThan(0.1);
    // The research idea (doc 01): commanded grams and weighed grams now differ.
    const commanded = worn.plant.stepsTotal.cyan * config.pumps.dyeGPerStep;
    expect(cyanUsed(worn)).toBeLessThan(commanded * 0.85);
  });
});

describe('placeholders from the tuning file (owner, step 15)', () => {
  it('the stack light shows the colours config/simulator.json names', () => {
    const changed = { ...config, stackLight: { running: 'red' as const, idle: 'off' as const } };
    const sim = new Simulation(machine, changed, { startMs: T0, random: seededRandom(1) });
    const light = byTopicId('cabinet.stackLight');
    const seen: number[] = [];
    for (let t = T0; t < T0 + 20_000; t += TICK_MS) {
      for (const m of sim.advanceTo(t))
        if (m.kind === 'reading' && m.topic === light) seen.push(m.payload.value);
    }
    // Waiting first (off = 0), then a batch runs (red = 3).
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(3);
  });
});

describe('connection and clock', () => {
  it('sends every sensor and the state again after a reconnect', () => {
    const sim = new Simulation(machine, config, { startMs: T0, random: seededRandom(1) });
    sim.advanceTo(T0 + 10_000);
    sim.reset();
    const again = sim.advanceTo(T0 + 10_000 + TICK_MS);
    expect(again.filter((m) => m.kind === 'reading')).toHaveLength(
      machine.components.flatMap((c) => c.sensors).length,
    );
    expect(again.filter((m) => m.kind === 'state')).toHaveLength(1);
  });

  it('skips ahead after a long pause instead of catching up', () => {
    const sim = new Simulation(machine, config, {
      startMs: T0,
      random: seededRandom(1),
      maxLagMs: 2000,
    });
    sim.advanceTo(T0);
    const late = sim.advanceTo(T0 + 3_600_000);
    expect(late.filter((m) => m.kind === 'reading').length).toBeLessThanOrEqual(60);
    expect(sim.now).toBe(T0 + 3_600_000);
  });
});

function byTopicId(id: string): string {
  const found = [...byTopic].find(([, sensor]) => sensor.id === id);
  if (!found) throw new Error(`no sensor ${id}`);
  return found[0];
}
