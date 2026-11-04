/**
 * The batch sequence (plan step 15; doc 01 "Batch logic"), standing in for the PLC program that
 * does not exist yet. It loops forever through the recipes in config/simulator.json that can run
 * (recipes.ts):
 *
 *   wait (idle) → service (between batches) → baseFill → dyeDose → mix → sample
 *   → [correct → mix → sample] up to maxCorrections times → complete → mix → finalCheck
 *   → filling (6 cups: feeder, filling, check, cap or reject, tray) → rinse
 *
 * It reads the scales and the camera the way a PLC would (with their noise) and switches the
 * plant's pumps, mixer, conveyor and servos. It reports what happens to an Outbox, which turns
 * it into the machine state and batch messages (simulation.ts).
 */
import type { BatchStep, Lab, RefillItem } from '@mixline/shared';

import { type Line, PART_TABLE } from './bindings.js';
import {
  CLEAR_WATER,
  deltaE,
  missingDye,
  NO_DYE,
  type PerDye,
  recipeTarget,
} from './correction.js';
import { dye as pureDye, water } from './ledger.js';
import { type Cup, PLACE, type Plant, type Pump } from './plant.js';
import { type Program, together, waitS, waitUntil } from './program.js';
import { between, jitter, type Random } from './random.js';
import { DYES, type Dye, type Recipe, type SimConfig } from './simConfig.js';

const WEIGH_PAUSE_S = 1;

export interface Outbox {
  started(recipe: Recipe, targetLab: Lab): void;
  step(step: BatchStep): void;
  containersDone(count: number): void;
  finished(): void;
  refill(items: RefillItem[]): void;
}

/** What the batch has put in the vessel so far, as the PLC counts it. */
interface Dosed {
  baseG: number;
  dyeG: PerDye;
}

export class BatchProgram {
  constructor(
    private readonly plant: Plant,
    private readonly line: Line,
    private readonly config: SimConfig,
    private readonly random: Random,
    private readonly out: Outbox,
  ) {}

  /** Runs the recipes in turn, forever (the ones with a deferred dye are already left out). */
  *run(recipes: readonly Recipe[]): Program {
    for (let n = 0; ; n++) {
      yield* waitS(this.plant, this.config.batch.pauseS);
      const recipe = recipes[n % recipes.length];
      if (!recipe) return;
      yield* this.service(recipe);
      yield* this.batch(recipe);
    }
  }

  *batch(recipe: Recipe): Program {
    const { config, out, plant } = this;
    const target = recipeTarget(config, recipe);
    const b = config.batch;
    const dosed: Dosed = { baseG: 0, dyeG: { ...NO_DYE } };
    plant.batchRunning = true;
    out.started(recipe, target);

    // baseFill: the first, small portion (doc 01: mix a small amount first).
    dosed.baseG += yield* this.addBase(b.firstPortionG);

    // dyeDose: the recipe's ratio, but only firstDoseShare of it: approach from the light side.
    out.step('dyeDose');
    for (const d of DYES) {
      const grams = (b.firstDoseShare * recipe.dyesGPerKg[d] * dosed.baseG) / 1000;
      dosed.dyeG[d] += yield* this.dose(d, grams);
    }
    out.step('mix');
    yield* this.mix(config.mixer.runS);
    out.step('sample');
    let seen = yield* this.sample(target);

    // correct: add what the camera says is missing, mix, sample again.
    for (let round = 0; round < b.maxCorrections; round++) {
      if (deltaE(seen.lab, target) <= b.toleranceDeltaE) break;
      out.step('correct');
      const vesselKg = this.read('vesselMass') / 1000;
      const missing = missingDye(config, recipe, seen.lab, target);
      for (const d of DYES) {
        dosed.dyeG[d] += yield* this.dose(d, b.correctionShare * missing[d] * vesselKg);
      }
      out.step('mix');
      yield* this.mix(config.mixer.runS);
      out.step('sample');
      seen = yield* this.sample(target);
    }

    // complete: the rest of the batch, in the ratios the vessel now has.
    out.step('complete');
    const totalG = this.line.container.perBatch * this.line.container.fillTargetG + b.heelG;
    const perBaseG = DYES.reduce((sum, d) => sum + dosed.dyeG[d], 0) / dosed.baseG;
    const ratio = { ...dosed.dyeG };
    const baseBefore = dosed.baseG;
    const moreBase = (totalG - this.read('vesselMass')) / (1 + perBaseG);
    dosed.baseG += yield* this.addBase(moreBase);
    for (const d of DYES) {
      dosed.dyeG[d] += yield* this.dose(d, (ratio[d] / baseBefore) * moreBase);
    }
    out.step('mix');
    yield* this.mix(config.mixer.runS);
    out.step('finalCheck');
    yield* this.sample(target);

    out.step('filling');
    yield* this.fillCups();

    out.step('rinse');
    yield* this.rinse();
    plant.batchRunning = false;
    out.finished();
  }

  // ---- the vessel ----

  /** Base pump from the big tank; stops on the vessel's weight (doc 02). Returns the grams added. */
  private *addBase(grams: number): Program<number> {
    const before = this.read('vesselMass');
    this.plant.pump('base', PLACE.bigTank, PLACE.vessel, grams);
    yield* this.untilStopped('base');
    yield* this.settle();
    return this.read('vesselMass') - before;
  }

  /** A dye pump doses by volume: steps × calibrated grams per step (doc 02). Returns the grams. */
  private *dose(which: Dye, grams: number): Program<number> {
    const steps = Math.round(grams / this.config.pumps.dyeGPerStep);
    if (steps <= 0) return 0;
    this.plant.dose(which, steps);
    yield* this.untilStopped(which);
    yield* this.settle();
    return steps * this.config.pumps.dyeGPerStep;
  }

  /** Doc 02: the mixer stops before weighing and before a sample. */
  private *mix(seconds: number): Program {
    const { plant } = this;
    plant.mixerTarget = this.config.mixer.rpm;
    yield* waitUntil(() => plant.mixerRpm >= plant.mixerTarget);
    yield* waitS(plant, seconds);
    plant.mixerTarget = 0;
    yield* waitUntil(() => plant.mixerRpm <= 0);
  }

  /** Sample pump forward fills the cell, the camera reads it, reverse returns it (doc 02). */
  private *sample(target: Lab): Program<{ lab: Lab; deltaE: number }> {
    const { plant } = this;
    plant.pump('sample', PLACE.vessel, PLACE.cell, this.config.camera.cellG);
    yield* this.untilStopped('sample');
    yield* this.settle();
    const seen = plant.measure(target);
    yield* waitS(plant, this.config.stations.settleS);
    plant.pump('sample', PLACE.cell, PLACE.vessel, plant.ledger.mass(PLACE.cell));
    yield* this.untilStopped('sample');
    yield* this.weighPause();
    return seen;
  }

  /** Drain pump until the vessel reads empty; a thin film stays on the walls. */
  private *drain(): Program {
    const { plant } = this;
    const film = this.config.rinse.residueG;
    plant.pump('drain', PLACE.vessel, PLACE.drainBucket, plant.ledger.mass(PLACE.vessel) - film);
    yield* this.untilStopped('drain');
    yield* this.weighPause();
  }

  /** Doc 01: new colour, so drain and rinse twice; the camera confirms clear water. */
  private *rinse(): Program {
    const r = this.config.rinse;
    yield* this.drain();
    for (let time = 1; ; time++) {
      yield* this.addBase(r.waterG);
      yield* this.mix(r.mixS);
      const last = time >= r.times;
      const clear = last && (yield* this.sample(CLEAR_WATER)).deltaE <= r.clearDeltaE;
      yield* this.drain();
      // Two more rinses at most if the water is not clear yet.
      if (clear || time >= r.times + 2) return;
    }
  }

  // ---- the conveyor (doc 02 stations) ----

  /**
   * An indexing belt: all stations work at once on the cups in front of them, then the belt
   * moves one pitch. Cups past the belt's end drop into the tray.
   */
  private *fillCups(): Program {
    const { plant, line } = this;
    const total = line.container.perBatch;
    const startRejects = plant.rejects;
    const startTray = plant.trayCups;
    let released = 0;
    let reported = 0;
    const done = () => plant.rejects - startRejects + (plant.trayCups - startTray);
    const report = () => {
      while (reported < done()) this.out.containersDone(++reported);
    };

    while (done() < total) {
      const atFilling = plant.cupAt(line.stations.filling);
      const atCheck = plant.cupAt(line.stations.check);
      const work: Program[] = [];
      if (released < total) {
        work.push(this.releaseCup());
        released++;
      }
      if (atFilling) work.push(this.fillCup(atFilling));
      if (atCheck) work.push(this.checkCup(atCheck));
      yield* together(...work);
      report();
      if (done() >= total) break;
      plant.moveBelt(line.stations.pitch);
      yield* waitUntil(() => {
        report();
        return !plant.beltMoving;
      });
    }
    report();
  }

  private *releaseCup(): Program {
    const { plant } = this;
    plant.fingersReleasing = true;
    yield* waitS(plant, this.config.stations.servoS);
    plant.releaseCup();
    plant.fingersReleasing = false;
    yield* waitS(plant, this.config.stations.servoS);
  }

  /** Lift and weigh, fill by weight (doc 02); about 1 cup in 20 stops short (owner, step 15). */
  private *fillCup(cup: Cup): Program {
    const { plant, config, line, random } = this;
    yield* this.platform('filling', cup, true);
    const c = config.check;
    const short = random() < c.shortFillChance ? between(random, ...c.shortFillG) : 0;
    const grams = line.container.fillTargetG - short + jitter(random, config.noise.scaleG);
    plant.pump('filling', PLACE.vessel, PLACE.cup(cup.id), grams);
    yield* this.untilStopped('filling');
    yield* this.settle();
    yield* this.platform('filling', cup, false);
  }

  /** Weigh; bad weight: pusher to the reject box; good: lid drops and is pressed (doc 02). */
  private *checkCup(cup: Cup): Program {
    const { plant, config, line } = this;
    plant.decision = 0;
    yield* this.platform('check', cup, true);
    const net = this.read('checkMass');
    const good = Math.abs(net - line.container.fillTargetG) <= config.check.toleranceG;
    plant.decision = good ? 1 : 2;
    // Interlock (doc 02): pressing is forbidden while the platform is up.
    yield* this.platform('check', cup, false);
    yield* waitS(plant, config.stations.servoS);
    if (!good) {
      plant.reject(cup);
      return;
    }
    plant.lids--;
    yield* waitS(plant, config.stations.servoS);
  }

  private *platform(station: 'filling' | 'check', cup: Cup, up: boolean): Program {
    const { plant } = this;
    yield* waitS(plant, this.config.stations.servoS);
    cup.lifted = up;
    if (station === 'filling') plant.fillingUp = up;
    else plant.checkUp = up;
    if (up) yield* this.settle();
  }

  // ---- between batches ----

  /**
   * As if by a worker (owner, step 15): take the full tray away, and refill or empty whatever
   * cannot cover the next batch. One batch/refill message lists it all, by machine.json part id.
   */
  *service(next: Recipe): Program {
    const { plant, config, line } = this;
    const s = config.supplies;
    const r = config.rinse;
    const ledger = plant.ledger;
    const totalG = line.container.perBatch * line.container.fillTargetG + config.batch.heelG;
    const items: RefillItem[] = [];
    const apply: (() => void)[] = [];
    const item = (
      part: keyof typeof PART_TABLE,
      action: 'refilled' | 'emptied',
      amount: number,
      unit: 'g' | 'count',
    ) => {
      const rounded = unit === 'g' ? Math.round(amount * 10) / 10 : Math.round(amount);
      if (rounded > 0) items.push({ component: PART_TABLE[part], action, amount: rounded, unit });
    };

    // Big tank: the whole batch plus its rinse water, and stay above the low float.
    const tankG = ledger.mass(PLACE.bigTank);
    const floatG = (s.bigTankLowFloatMm * line.bigTankAreaMm2) / 1000;
    if (tankG - totalG - r.waterG * (r.times + 2) < floatG * 2) {
      const add = s.bigTankFullG - tankG;
      item('bigTank', 'refilled', add, 'g');
      apply.push(() => {
        ledger.bring(PLACE.bigTank, water(add));
      });
    }
    // Dye tanks: the recipe with room for corrections, and never run the pump dry.
    for (const d of DYES) {
      const tank = PLACE.dyeTank(d);
      const needG = ((next.dyesGPerKg[d] * totalG) / 1000) * 1.5 + s.dyeTankKeepG;
      if (ledger.mass(tank) < needG) {
        const add = s.dyeTankFullG - ledger.mass(tank);
        item(`${d}Tank`, 'refilled', add, 'g');
        apply.push(() => {
          ledger.bring(tank, pureDye(d, add));
          plant.newLot(d);
        });
      }
    }
    if (plant.cupsInMagazine < line.container.perBatch) {
      item('cups', 'refilled', s.cupsFull - plant.cupsInMagazine, 'count');
      apply.push(() => {
        plant.cupsInMagazine = s.cupsFull;
      });
    }
    if (plant.lids < line.container.perBatch) {
      item('lids', 'refilled', s.lidsFull - plant.lids, 'count');
      apply.push(() => {
        plant.lids = s.lidsFull;
      });
    }
    // Drain bucket: room for the heel and every rinse of the next batch.
    const bucketG = ledger.mass(PLACE.drainBucket);
    if (bucketG + config.batch.heelG + r.waterG * (r.times + 2) > s.drainBucketFullG) {
      item('drainBucket', 'emptied', bucketG, 'g');
      apply.push(() => {
        ledger.takeAway(PLACE.drainBucket);
      });
    }
    if (plant.rejects > 0 && plant.rejects + line.container.perBatch > s.rejectBoxFull) {
      item('rejectBox', 'emptied', plant.rejects, 'count');
      apply.push(() => {
        ledger.takeAway(PLACE.rejectBox);
        plant.rejects = 0;
      });
    }
    if (plant.trayCups > 0) {
      item('tray', 'emptied', plant.trayCups, 'count');
      apply.push(() => {
        ledger.takeAway(PLACE.tray);
        plant.trayCups = 0;
      });
    }

    if (items.length === 0) return;
    yield* waitS(plant, s.serviceS);
    for (const change of apply) change();
    this.out.refill(items);
  }

  // ---- helpers ----

  /** What a scale reads now, with its noise (the PLC only knows its sensors). */
  private read(scale: 'vesselMass' | 'checkMass'): number {
    return this.plant.weigh(scale === 'vesselMass' ? 'vessel' : 'check');
  }

  private *untilStopped(pump: Pump): Program {
    yield* waitUntil(() => !this.plant.isRunning(pump));
  }

  private *settle(): Program {
    yield* waitS(this.plant, this.config.stations.settleS);
  }

  /**
   * After liquid flowed in or out of the vessel without a dose (sample back, draining), the
   * vessel scale settles for 1 s before the next dose is weighed, so a settled weight is always
   * read (and published, at 1 Hz) before anything new goes in.
   */
  private *weighPause(): Program {
    yield* waitS(this.plant, WEIGH_PAUSE_S);
  }
}
