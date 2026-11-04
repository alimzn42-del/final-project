import { describe, expect, it } from 'vitest';

import { concentration, dye, Ledger, massOf, OUTSIDE, water } from './ledger.js';
import { seededRandom } from './random.js';

describe('the mass record', () => {
  it('moves liquid with the make-up of what is there', () => {
    const ledger = new Ledger({ vessel: { ...water(990), cyan: 6, yellow: 4 } });
    expect(ledger.move('vessel', 'cup', 100)).toBe(100);
    const cup = ledger.mix('cup');
    expect(cup.water).toBeCloseTo(99);
    expect(cup.cyan).toBeCloseTo(0.6);
    expect(cup.yellow).toBeCloseTo(0.4);
    expect(cup.magenta + cup.black).toBe(0);
    expect(ledger.mass('vessel')).toBeCloseTo(900);
    // Same concentration on both sides.
    const [inCup, inVessel] = [ledger.mix('cup'), ledger.mix('vessel')].map(concentration);
    expect(inCup?.yellow).toBeCloseTo(inVessel?.yellow ?? NaN, 9);
    expect(concentration(ledger.mix('cup')).cyan).toBeCloseTo(6);
  });

  it('never moves more than a place holds', () => {
    const ledger = new Ledger({ tank: dye('black', 5) });
    expect(ledger.move('tank', 'vessel', 8)).toBe(5);
    expect(ledger.mass('tank')).toBe(0);
    expect(ledger.move('tank', 'vessel', 1)).toBe(0);
  });

  it('counts what came from and went outside the line', () => {
    const ledger = new Ledger({ bigTank: water(1000) });
    expect(ledger.mass(OUTSIDE)).toBe(-1000);
    ledger.move('bigTank', 'drainBucket', 300);
    expect(ledger.takeAway('drainBucket')).toBe(300);
    expect(ledger.mass(OUTSIDE)).toBe(-700);
    expect(ledger.total()).toBe(0);
  });

  it('keeps the total over thousands of random moves (the mass balance)', () => {
    const random = seededRandom(7);
    const places = ['bigTank', 'vessel', 'cell', 'cup', 'drainBucket', 'dyeC'];
    const ledger = new Ledger({ bigTank: water(14000), dyeC: dye('cyan', 600) });
    for (let i = 0; i < 5000; i++) {
      const from = places[Math.floor(random() * places.length)] ?? 'vessel';
      const to = places[Math.floor(random() * places.length)] ?? 'vessel';
      ledger.move(from, to, random() * 400);
      if (random() < 0.01) ledger.takeAway('drainBucket');
      if (random() < 0.01) ledger.bring('bigTank', water(500));
      expect(Math.abs(ledger.total())).toBeLessThan(1e-6);
    }
    const inside = places.reduce((sum, p) => sum + ledger.mass(p), 0);
    expect(inside + ledger.mass(OUTSIDE)).toBeCloseTo(0, 6);
  });

  it('forgets empty places, never outside', () => {
    const ledger = new Ledger({ cup: water(300) });
    ledger.moveAll('cup', 'tray');
    ledger.forget('cup');
    ledger.forget(OUTSIDE);
    expect(ledger.placeNames().sort()).toEqual([OUTSIDE, 'tray'].sort());
    expect(massOf(ledger.mix('cup'))).toBe(0);
  });
});

describe('repeatable random numbers', () => {
  it('gives the same sequence for the same seed, in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 1000 }, a);
    expect(Array.from({ length: 1000 }, b)).toEqual(first);
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(first[0]);
    // Roughly uniform: the mean of 1000 draws is near 0.5.
    expect(first.reduce((s, x) => s + x, 0) / 1000).toBeCloseTo(0.5, 1);
  });
});
