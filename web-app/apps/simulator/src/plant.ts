/**
 * The physical line, simulated (plan step 15). Pumps move liquid between places in the mass
 * record (ledger.ts); the mixer, the conveyor and the station servos move; cups travel the belt;
 * and every sensor reads what is really there, plus a little noise. The batch program (batch.ts)
 * drives it the way the PLC will.
 *
 * Owner, step 17: until the tray is built, each cup stops at the end of the belt. While the end
 * sensor sees it the belt stands still (the PLC's interlock), and a worker takes it away after a
 * random delay; then the belt finishes its move.
 *
 * Fault hook (doc 04): `Faults` changes the hidden truth (a worn dye pump delivers less per step,
 * a weak dye colours less, a scale reads off), so later work can test whether the twin notices.
 * Phase 1 runs without faults.
 */
import { deltaE2000, type Lab } from '@mixline/shared';

import { dyeRole, type Line, type Role } from './bindings.js';
import { cellLab, CLEAR_WATER, NO_DYE, type PerDye } from './correction.js';
import { concentration, dye, Ledger, water } from './ledger.js';
import { jitter, type Random } from './random.js';
import { DYES, type Dye, type SimConfig, STACK_LIGHT_CODES } from './simConfig.js';

/** Places in the mass record. */
export const PLACE = {
  bigTank: 'bigTank',
  waterContainer: 'waterContainer',
  vessel: 'vessel',
  cell: 'sampleCell',
  drainBucket: 'drainBucket',
  rejectBox: 'rejectBox',
  dyeTank: (d: Dye) => `dyeTank:${d}`,
  cup: (id: number) => `cup:${String(id)}`,
} as const;

export type Pump = 'base' | 'water' | 'drain' | 'filling' | 'sample' | Dye;

export interface Faults {
  /** Delivered ÷ calibrated grams per step, per dye pump (a worn pump is below 1). */
  pumpDelivery?: Partial<PerDye>;
  /** Colouring strength ÷ nominal, per dye (a weak dye is below 1), on top of its lot. */
  dyeStrength?: Partial<PerDye>;
  /** Grams added to a scale's reading (drift). */
  scaleOffsetG?: Partial<Record<'vessel' | 'filling' | 'check' | Dye, number>>;
}

interface Flow {
  from: string;
  to: string;
  gPerS: number;
  leftG: number;
}

export interface Cup {
  id: number;
  /** Position along the belt, mm. */
  x: number;
  /** Lifted on a station's platform: the belt slides under it. */
  lifted: boolean;
  /** The lid dropped on it at the check station (owner, step 17). */
  lid: boolean;
}

export class Plant {
  readonly ledger: Ledger;
  timeS = 0;

  /** Liquid pumps running now, by pump. */
  private readonly flows = new Map<Pump, Flow>();
  /** Until when each analog sensor publishes at 5 Hz (see fastRoles). */
  private readonly fastUntilS = new Map<Role, number>();
  /** Steps of each dye pump's current (or last) dose. */
  readonly dyeSteps: Record<Dye, { left: number; done: number }>;
  /** Every step each dye pump has made since the start. */
  readonly stepsTotal: PerDye = { ...NO_DYE };
  sampleDir: -1 | 0 | 1 = 0;
  mixerTarget = 0;
  mixerRpm = 0;
  private beltLeftMm = 0;
  cups: Cup[] = [];
  private nextCupId = 1;
  /** The infeed gate (a solenoid) is open: it releases one cup. */
  gateOpen = false;
  fillingUp = false;
  checkUp = false;
  /** The lid press reached the end of its stroke: its end switch is pressed. */
  pressAtEnd = false;
  /** check.decision: 0 none, 1 pass, 2 reject. */
  decision: 0 | 1 | 2 = 0;
  cupsInMagazine: number;
  lids: number;
  rejects = 0;
  /** Cups a worker took from the end of the belt (they passed the check). */
  delivered = 0;
  /** When the worker takes the cup now waiting at the end of the belt. */
  private takeAwayAtS: number | undefined;
  camera: { lab: Lab; deltaE: number } = { lab: CLEAR_WATER, deltaE: 0 };
  /** Each dye lot's real strength ÷ the nominal model (drawn at every dye refill). */
  readonly lot: PerDye = { ...NO_DYE };
  /** A batch is running (the stack light's colour). */
  batchRunning = false;

  constructor(
    private readonly line: Line,
    private readonly config: SimConfig,
    private readonly random: Random,
    private readonly faults: Faults = {},
  ) {
    const s = config.supplies;
    this.ledger = new Ledger({
      [PLACE.bigTank]: water(s.bigTankFullG),
      [PLACE.waterContainer]: water(s.waterContainerFullG),
      ...Object.fromEntries(DYES.map((d) => [PLACE.dyeTank(d), dye(d, s.dyeTankFullG)])),
    });
    this.dyeSteps = Object.fromEntries(DYES.map((d) => [d, { left: 0, done: 0 }])) as Record<
      Dye,
      { left: number; done: number }
    >;
    for (const d of DYES) this.newLot(d);
    this.cupsInMagazine = s.cupsFull;
    this.lids = s.lidsFull;
  }

  // ---- commands (what the PLC switches) ----

  /** Runs a pump that moves `grams` from one place to another, then stops by itself. */
  pump(
    pump: 'base' | 'water' | 'drain' | 'filling' | 'sample',
    from: string,
    to: string,
    grams: number,
  ): void {
    const p = this.config.pumps;
    const gPerS = {
      base: p.baseGPerS,
      water: p.waterGPerS,
      drain: p.drainGPerS,
      filling: p.fillingGPerS,
      sample: p.sampleGPerS,
    }[pump];
    if (grams > 0) this.flows.set(pump, { from, to, gPerS, leftG: grams });
    if (pump === 'sample') this.sampleDir = from === PLACE.vessel ? 1 : -1;
  }

  /** Doses one dye by volume: `steps` of its stepper pump (doc 02). */
  dose(which: Dye, steps: number): void {
    this.dyeSteps[which] = { left: Math.max(0, Math.round(steps)), done: 0 };
  }

  isRunning(pump: Pump): boolean {
    return DYES.includes(pump as Dye) ? this.dyeSteps[pump as Dye].left > 0 : this.flows.has(pump);
  }

  moveBelt(mm: number): void {
    this.beltLeftMm = mm;
  }

  /** The belt still has some of its move to make (it may be waiting at the end stop). */
  get beltMoving(): boolean {
    return this.beltLeftMm > 0;
  }

  /** The motor runs: the belt has a move to make and no cup waits at the end stop. */
  get motorOn(): boolean {
    return this.beltMoving && this.cupAtEnd() === undefined;
  }

  /** The feeder drops one cup from the magazine onto the belt. */
  releaseCup(): Cup {
    const cup = { id: this.nextCupId++, x: this.line.stations.feeder, lifted: false, lid: false };
    this.cupsInMagazine--;
    this.cups.push(cup);
    return cup;
  }

  cupAt(x: number): Cup | undefined {
    return this.cups.find((c) => Math.abs(c.x - x) < 1);
  }

  /** The cup waiting at the end stop, if any (the end sensor sees it). */
  cupAtEnd(): Cup | undefined {
    return this.cups.find((c) => c.x >= this.line.stations.end - 1e-6);
  }

  /** One lid drops from the lid magazine onto the cup (owner, step 17: while it is lifted). */
  dropLid(cup: Cup): void {
    cup.lid = true;
    this.lids--;
  }

  /** The pusher sends a cup down the chute into the reject box. */
  reject(cup: Cup): void {
    this.ledger.moveAll(PLACE.cup(cup.id), PLACE.rejectBox);
    this.ledger.forget(PLACE.cup(cup.id));
    this.cups = this.cups.filter((c) => c !== cup);
    this.rejects++;
  }

  /** The camera reads the liquid in the sample cell. */
  measure(target: Lab): { lab: Lab; deltaE: number } {
    const strength = Object.fromEntries(
      DYES.map((d) => [d, this.lot[d] * (this.faults.dyeStrength?.[d] ?? 1)]),
    ) as PerDye;
    const exact = cellLab(this.config, concentration(this.ledger.mix(PLACE.cell)), strength);
    const n = this.config.camera.noise;
    const lab: Lab = [
      Math.min(100, exact[0] + jitter(this.random, n)),
      exact[1] + jitter(this.random, n),
      exact[2] + jitter(this.random, n),
    ];
    this.camera = { lab, deltaE: deltaE2000(lab, target) };
    return this.camera;
  }

  /** A new dye lot after a refill: up to lotSpread weaker or stronger than nominal. */
  newLot(which: Dye): void {
    this.lot[which] = 1 + jitter(this.random, this.config.dyes.lotSpread);
  }

  /** What a cup on the line holds, in grams (net). */
  cupMass(cup: Cup): number {
    return this.ledger.mass(PLACE.cup(cup.id));
  }

  // ---- time ----

  advance(dtS: number): void {
    for (const [pump, flow] of this.flows) {
      const moved = this.ledger.move(flow.from, flow.to, Math.min(flow.gPerS * dtS, flow.leftG));
      flow.leftG -= moved;
      if (flow.leftG <= 1e-9 || moved === 0) {
        this.flows.delete(pump);
        if (pump === 'sample') this.sampleDir = 0;
      }
    }

    const p = this.config.pumps;
    for (const d of DYES) {
      const job = this.dyeSteps[d];
      if (job.left <= 0) continue;
      const steps = Math.min(Math.round(p.dyeStepsPerS * dtS), job.left);
      const grams = steps * p.dyeGPerStep * (this.faults.pumpDelivery?.[d] ?? 1);
      this.ledger.move(PLACE.dyeTank(d), PLACE.vessel, grams);
      job.left -= steps;
      job.done += steps;
      this.stepsTotal[d] += steps;
    }

    const ramp = (this.config.mixer.rpm / this.config.mixer.rampS) * dtS;
    this.mixerRpm += Math.max(-ramp, Math.min(ramp, this.mixerTarget - this.mixerRpm));

    this.moveCups(dtS);
    this.takeAway();
    this.timeS += dtS;
  }

  /** The belt moves the cups on it; one reaching the end stop stops there, and so does the belt. */
  private moveCups(dtS: number): void {
    if (!this.motorOn) return;
    const end = this.line.stations.end;
    const riding = this.cups.filter((c) => !c.lifted);
    const toEnd = Math.min(...riding.map((c) => end - c.x));
    const mm = Math.min(this.config.conveyor.mmPerS * dtS, this.beltLeftMm, toEnd);
    this.beltLeftMm -= mm;
    for (const cup of riding) cup.x = Math.min(end, cup.x + mm);
    if (this.beltLeftMm < 1e-9) this.beltLeftMm = 0;
  }

  /** A worker takes the cup at the end of the belt, a random few seconds after it arrived. */
  private takeAway(): void {
    const cup = this.cupAtEnd();
    if (!cup) return;
    const [low, high] = this.config.outfeed.takeAwayS;
    this.takeAwayAtS ??= this.timeS + low + (high - low) * this.random();
    if (this.timeS < this.takeAwayAtS) return;
    this.ledger.takeAway(PLACE.cup(cup.id));
    this.ledger.forget(PLACE.cup(cup.id));
    this.cups = this.cups.filter((c) => c !== cup);
    this.delivered++;
    this.takeAwayAtS = undefined;
  }

  // ---- what the sensors read ----

  /**
   * Doc 04: analog sensors publish at 5 Hz while dosing or filling. These are the ones the moving
   * liquid changes: the scales on both ends, the big tank's level, and the running pump's
   * signals. Draining and sampling are neither, so they stay at 1 Hz. They stay fast for one
   * second after the pump stops, so the settled end value goes out at once.
   */
  fastRoles(): Role[] {
    const fast: Role[] = [];
    if (this.flows.has('base')) {
      fast.push('vesselMass', 'basePumpCurrent', 'bigTankLevel', 'bigTankVolume');
    }
    // The rinse water container has no sensor: only the vessel and the pump's current.
    if (this.flows.has('water')) fast.push('vesselMass', 'waterPumpCurrent');
    for (const d of DYES) {
      if (this.dyeSteps[d].left <= 0) continue;
      fast.push('vesselMass', dyeRole(d, 'Mass'), dyeRole(d, 'PumpSteps'));
      fast.push(dyeRole(d, 'PumpSpeed'), dyeRole(d, 'PumpLoad'));
    }
    if (this.flows.has('filling')) fast.push('vesselMass', 'fillingMass');
    // The check station weighs each filled cup while its platform is up.
    if (this.checkUp) fast.push('checkMass');
    for (const role of fast) this.fastUntilS.set(role, this.timeS + 1);
    return [...this.fastUntilS].filter(([, until]) => until >= this.timeS).map(([role]) => role);
  }

  /** A scale's reading: the net liquid on it, its drift (fault hook) and noise. */
  weigh(which: 'vessel' | 'filling' | 'check' | Dye): number {
    const lifted = (x: number) => this.cups.find((c) => c.lifted && Math.abs(c.x - x) < 1);
    // Tared with the empty cup: the liquid, and the lid once it dropped on (owner, step 17).
    const onPlatform = (up: boolean, x: number) => {
      const cup = up ? lifted(x) : undefined;
      return cup ? this.cupMass(cup) + (cup.lid ? this.line.container.lidG : 0) : 0;
    };
    const net =
      which === 'vessel'
        ? this.ledger.mass(PLACE.vessel)
        : which === 'filling'
          ? onPlatform(this.fillingUp, this.line.stations.filling)
          : which === 'check'
            ? onPlatform(this.checkUp, this.line.stations.check)
            : this.ledger.mass(PLACE.dyeTank(which));
    const offset = this.faults.scaleOffsetG?.[which] ?? 0;
    return net + offset + jitter(this.random, this.config.noise.scaleG);
  }

  readings(): Partial<Record<Role, number>> {
    const { config, line, random } = this;
    const n = config.noise;
    const around = (v: number) => v * (1 + jitter(random, n.share));
    const pumpCurrent = (on: boolean) =>
      on ? config.pumps.currentA + jitter(random, n.currentA) : 0;
    const bit = (b: boolean) => (b ? 1 : 0);

    const tankG = this.ledger.mass(PLACE.bigTank);
    const levelMm = (tankG * 1000) / line.bigTankAreaMm2;
    const measuredLevel = Math.max(0, levelMm + jitter(random, n.levelMm));

    const values: Partial<Record<Role, number>> = {
      bigTankLevel: measuredLevel,
      bigTankVolume: (measuredLevel * line.bigTankAreaMm2) / 1e6,
      magazineEmpty: bit(this.cupsInMagazine <= 0),
      vesselMass: this.weigh('vessel'),
      mixerRpm: this.mixerRpm > 0 ? around(this.mixerRpm) : 0,
      basePumpOn: bit(this.flows.has('base')),
      basePumpCurrent: pumpCurrent(this.flows.has('base')),
      waterPumpOn: bit(this.flows.has('water')),
      waterPumpCurrent: pumpCurrent(this.flows.has('water')),
      drainPumpOn: bit(this.flows.has('drain')),
      drainPumpCurrent: pumpCurrent(this.flows.has('drain')),
      fillingPumpOn: bit(this.flows.has('filling')),
      colorL: this.camera.lab[0],
      colorA: this.camera.lab[1],
      colorB: this.camera.lab[2],
      colorDeltaE: this.camera.deltaE,
      colorWhiteRef: config.camera.whiteRef + jitter(random, 0.5),
      samplePumpOn: bit(this.sampleDir !== 0),
      samplePumpDir: this.sampleDir,
      conveyorOn: bit(this.motorOn),
      feederPresent: bit(this.cupAt(line.stations.feeder) !== undefined),
      feederGate: bit(this.gateOpen),
      fillingPresent: bit(this.cupAt(line.stations.filling) !== undefined),
      fillingPlatformUp: bit(this.fillingUp),
      // Net liquid (machine.json `measures: netLiquid`): tared with the empty cup on it.
      fillingMass: this.weigh('filling'),
      checkPresent: bit(this.cupAt(line.stations.check) !== undefined),
      checkPlatformUp: bit(this.checkUp),
      // Net: gross weight minus the empty container (machine.json container bodyG).
      checkMass: this.weigh('check'),
      checkDecision: this.decision,
      pressEnd: bit(this.pressAtEnd),
      // A counter the PLC keeps: it commands every reject (owner, step 17).
      rejectCount: this.rejects,
      beltEndPresent: bit(this.cupAtEnd() !== undefined),
      estop: 0,
      // Placeholder until the PLC defines the lights: the colours come from the tuning file.
      stackLight:
        STACK_LIGHT_CODES[this.batchRunning ? config.stackLight.running : config.stackLight.idle],
    };
    for (const d of DYES) {
      const job = this.dyeSteps[d];
      const on = job.left > 0;
      values[dyeRole(d, 'Mass')] = this.weigh(d);
      values[dyeRole(d, 'PumpOn')] = bit(on);
      values[dyeRole(d, 'PumpSteps')] = job.done;
      values[dyeRole(d, 'PumpSpeed')] = on ? around(config.pumps.dyeStepsPerS) : 0;
      values[dyeRole(d, 'PumpLoad')] = on ? around(config.pumps.dyeLoad) : 0;
    }
    return values;
  }
}
