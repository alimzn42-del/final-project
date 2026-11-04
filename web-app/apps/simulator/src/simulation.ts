/**
 * Simulator v2 as a whole (plan step 15): the plant, the batch program that drives it, and the
 * publishing rules, moved forward in fixed time steps. It turns everything into the messages
 * the hardware will send (doc 04): sensor readings, the retained machine state, and the batch
 * events, refills included. Every message is checked with the shared schemas before it leaves.
 *
 * Pure logic, no network and no real clock: main.ts calls advanceTo(Date.now()); tests run
 * whole batches in fast time with a fixed seed.
 */
import {
  type BatchEvent,
  type BatchEventPayload,
  type BatchStep,
  batchTopic,
  decodeBatchMessage,
  type Lab,
  type Machine,
  type MachineState,
  machineStateSchema,
  type Reading,
  type RefillEventPayload,
  type RefillItem,
  stateTopic,
} from '@mixline/shared';

import { BatchProgram, type Outbox } from './batch.js';
import { bindLine, type Line, type Role } from './bindings.js';
import { type Faults, Plant } from './plant.js';
import type { Program } from './program.js';
import { type Random, seededRandom } from './random.js';
import { Schedule, TICK_MS } from './schedule.js';
import type { Recipe, SimConfig } from './simConfig.js';

export type Message =
  | { kind: 'reading'; topic: string; payload: Reading }
  | { kind: 'state'; topic: string; payload: MachineState }
  | {
      kind: 'batch';
      event: BatchEvent;
      topic: string;
      payload: BatchEventPayload | RefillEventPayload;
    };

export interface SimulationOptions {
  /** Time of the first step, ms since 1970. */
  startMs: number;
  random?: Random;
  faults?: Faults;
  /** Further behind than this (the computer slept), the simulation skips ahead instead. */
  maxLagMs?: number;
}

interface RunningBatch {
  id: string;
  targetLab: [number, number, number];
  step: BatchStep;
  containersDone: number;
}

export class Simulation {
  readonly plant: Plant;
  readonly line: Line;
  private readonly schedule: Schedule;
  private readonly program: Program;
  private readonly maxLagMs: number;
  private timeMs: number;
  private pending: Message[] = [];
  private batch: RunningBatch | undefined;
  private state: MachineState | undefined;

  constructor(
    private readonly machine: Machine,
    config: SimConfig,
    options: SimulationOptions,
  ) {
    const random = options.random ?? seededRandom(options.startMs);
    this.line = bindLine(machine, config);
    this.plant = new Plant(this.line, config, random, options.faults);
    this.schedule = new Schedule(machine, random);
    this.program = new BatchProgram(this.plant, this.line, config, random, this.outbox()).run();
    this.maxLagMs = options.maxLagMs ?? Infinity;
    this.timeMs = options.startMs - TICK_MS;
  }

  /** The simulation's own clock, ms since 1970. */
  get now(): number {
    return this.timeMs;
  }

  /** Moves on to `nowMs` in fixed steps; returns every message to send, oldest first. */
  advanceTo(nowMs: number): Message[] {
    if (nowMs - this.timeMs > this.maxLagMs) this.timeMs = nowMs - TICK_MS;
    while (this.timeMs + TICK_MS <= nowMs) {
      this.timeMs += TICK_MS;
      this.plant.advance(TICK_MS / 1000);
      if (this.state === undefined) this.setState('idle');
      this.program.next();
      const values = new Map<string, number>();
      for (const [role, value] of Object.entries(this.plant.readings()) as [Role, number][]) {
        values.set(this.line.sensors[role].id, value);
      }
      const fast = new Set(this.plant.fastRoles().map((role) => this.line.sensors[role].id));
      for (const { topic, payload } of this.schedule.tick(this.timeMs, values, fast)) {
        this.pending.push({ kind: 'reading', topic, payload });
      }
    }
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** After a (re)connect: every sensor again, and the machine state. */
  reset(): void {
    this.schedule.reset();
    if (this.state) this.pending.push(this.stateMessage(this.state));
  }

  private outbox(): Outbox {
    return {
      started: (recipe, targetLab) => {
        this.startBatch(recipe, targetLab);
      },
      step: (step) => {
        if (!this.batch) return;
        this.batch.step = step;
        this.batchEvent('step');
      },
      containersDone: (count) => {
        if (!this.batch) return;
        this.batch.containersDone = count;
        this.batchEvent('step');
      },
      finished: () => {
        this.batchEvent('finished');
        this.batch = undefined;
        this.setState('idle');
      },
      refill: (items) => {
        this.refill(items);
      },
    };
  }

  private startBatch(_recipe: Recipe, targetLab: Lab): void {
    const round = (v: number) => Math.round(v * 100) / 100;
    this.batch = {
      id: batchId(this.timeMs),
      targetLab: [round(targetLab[0]), round(targetLab[1]), round(targetLab[2])],
      step: 'baseFill',
      containersDone: 0,
    };
    this.setState('running');
    this.batchEvent('started');
  }

  private batchEvent(event: Exclude<BatchEvent, 'refill'>): void {
    const b = this.batch;
    if (!b) return;
    this.send(event, {
      ts: new Date(this.timeMs).toISOString(),
      batchId: b.id,
      step: b.step,
      recipe: { targetLab: b.targetLab },
      containersDone: b.containersDone,
      source: 'sim',
    });
  }

  private refill(items: RefillItem[]): void {
    this.send('refill', {
      ts: new Date(this.timeMs).toISOString(),
      batchId: null,
      items,
      source: 'sim',
    });
  }

  private send(event: BatchEvent, payload: BatchEventPayload | RefillEventPayload): void {
    const checked = decodeBatchMessage(this.machine, event, payload);
    if (!checked.ok) throw new Error(`simulator bug: ${checked.error}`);
    this.pending.push({ kind: 'batch', event, topic: batchTopic(this.machine, event), payload });
  }

  private setState(status: 'idle' | 'running'): void {
    const state = machineStateSchema.parse({
      ts: new Date(this.timeMs).toISOString(),
      mode: 'auto',
      status,
      batchId: status === 'running' ? (this.batch?.id ?? null) : null,
      source: 'sim',
    });
    this.state = state;
    this.pending.push(this.stateMessage(state));
  }

  private stateMessage(state: MachineState): Message {
    return { kind: 'state', topic: stateTopic(this.machine), payload: state };
  }
}

/** A batch id from its start time (UTC), unique across simulator restarts: B-20261104-075812. */
export function batchId(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `B-${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}
