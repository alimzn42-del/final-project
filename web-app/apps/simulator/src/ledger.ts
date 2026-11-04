/**
 * The mass record (plan step 15): where every gram of liquid is, and what it is made of.
 *
 * Liquid only ever moves from one place to another, so "the dye scale drops by what the vessel
 * gains" holds by construction. What comes from or goes outside the line (a worker refilling a
 * tank, emptying the drain bucket, taking the full tray away) moves to or from the place
 * `outside`, which may go below zero. The sum over every place, outside included, therefore never
 * changes: that is the mass balance the tests check.
 */
import { DYES, type Dye } from './simConfig.js';

/** What a liquid is made of, in grams: water plus each dye. */
export type Mix = Readonly<Record<'water' | Dye, number>>;

const PARTS = ['water', ...DYES] as const;
export const EMPTY: Mix = { water: 0, cyan: 0, magenta: 0, yellow: 0, black: 0 };

export const water = (g: number): Mix => ({ ...EMPTY, water: g });
export const dye = (which: Dye, g: number): Mix => ({ ...EMPTY, [which]: g });

export const massOf = (mix: Mix) => PARTS.reduce((sum, p) => sum + mix[p], 0);

const scaled = (mix: Mix, factor: number): Mix =>
  Object.fromEntries(PARTS.map((p) => [p, mix[p] * factor])) as Mix;

const added = (a: Mix, b: Mix, sign = 1): Mix =>
  Object.fromEntries(PARTS.map((p) => [p, a[p] + sign * b[p]])) as Mix;

/** Grams of each dye per kg of mixture (what the colour model needs). */
export function concentration(mix: Mix): Record<Dye, number> {
  const total = massOf(mix);
  return Object.fromEntries(
    DYES.map((d) => [d, total > 0 ? (mix[d] / total) * 1000 : 0]),
  ) as Record<Dye, number>;
}

export const OUTSIDE = 'outside';

export class Ledger {
  private readonly places = new Map<string, Mix>();

  constructor(initial: Readonly<Record<string, Mix>> = {}) {
    this.places.set(OUTSIDE, EMPTY);
    for (const [place, mix] of Object.entries(initial)) this.bring(place, mix);
  }

  mix(place: string): Mix {
    return this.places.get(place) ?? EMPTY;
  }

  mass(place: string): number {
    return massOf(this.mix(place));
  }

  /**
   * Moves up to `grams` from one place to another, with the composition of what is there.
   * Returns the grams actually moved (never more than the place holds).
   */
  move(from: string, to: string, grams: number): number {
    const source = this.mix(from);
    const available = massOf(source);
    const moved = Math.max(0, Math.min(grams, available));
    if (moved === 0) return 0;
    this.transfer(from, to, scaled(source, moved / available));
    return moved;
  }

  /** Moves everything a place holds (a cup to the tray, the sample back to the vessel). */
  moveAll(from: string, to: string): number {
    return this.move(from, to, this.mass(from));
  }

  /** Brings liquid of a given make-up in from outside the line (a worker refilling). */
  bring(to: string, mix: Mix): void {
    this.transfer(OUTSIDE, to, mix);
  }

  /** Takes everything a place holds out of the line (emptied, taken away). Returns the grams. */
  takeAway(from: string): number {
    const mass = this.mass(from);
    this.transfer(from, OUTSIDE, this.mix(from));
    return mass;
  }

  /** Every place's mass, outside included: the sum never changes. */
  total(): number {
    let sum = 0;
    for (const mix of this.places.values()) sum += massOf(mix);
    return sum;
  }

  /** Forgets places that hold nothing (cups that left the line), except outside. */
  forget(place: string): void {
    if (place !== OUTSIDE && Math.abs(this.mass(place)) < 1e-9) this.places.delete(place);
  }

  placeNames(): string[] {
    return [...this.places.keys()];
  }

  private transfer(from: string, to: string, mix: Mix): void {
    this.places.set(from, added(this.mix(from), mix, -1));
    this.places.set(to, added(this.mix(to), mix));
  }
}
