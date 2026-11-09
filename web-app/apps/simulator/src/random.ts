/**
 * Repeatable random numbers. The simulator draws noise, dye lots and short fills from one seeded
 * generator, so a test with a fixed seed sees exactly the same batches every run (owner, step 15).
 */

/** A random number in [0, 1). Injected so tests can be repeatable. */
export type Random = () => number;

/** Mulberry32: a small, fast generator; the same seed always gives the same sequence. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between low and high. */
export const between = (random: Random, low: number, high: number) => low + (high - low) * random();

/** A whole number from low to high, both included. */
export const wholeBetween = (random: Random, low: number, high: number) =>
  Math.min(high, low + Math.floor((high - low + 1) * random()));

/** Noise: a number between −amplitude and +amplitude. */
export const jitter = (random: Random, amplitude: number) => (random() * 2 - 1) * amplitude;
