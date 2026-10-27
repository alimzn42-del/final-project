/**
 * Values for simulator v1: every sensor sits at its nominal value from
 * machine.json. Analog values get a little noise but never leave the "ok"
 * band, so the whole line shows ok. The looping batch with realistic values
 * comes in simulator v2 (plan step 15).
 */
import type { Sensor } from '@mixline/shared';

/** Units that count whole things: no noise, whole numbers. */
const COUNTING_UNITS = new Set(['count', 'steps']);

/** Noise amplitude as a share of the sensor's simulated range. */
export const NOISE_SHARE = 0.005;

/** A random number in [0, 1). Injected so tests can be repeatable. */
export type Random = () => number;

export function nominal(sensor: Sensor): number {
  return sensor.sim?.nominal ?? 0;
}

/**
 * The band an analog value can move in and still be "ok": inside the sim
 * range and inside every limit. Limits are strict (shared/state.ts), so a
 * value exactly at a limit is still ok.
 */
export function okBand(sensor: Sensor): [number, number] {
  const n = nominal(sensor);
  const L = sensor.limits ?? {};
  const low = Math.max(sensor.sim?.min ?? n, L.warnBelow ?? -Infinity, L.faultBelow ?? -Infinity);
  const high = Math.min(sensor.sim?.max ?? n, L.warnAbove ?? Infinity, L.faultAbove ?? Infinity);
  return [low, high];
}

/** Next value for an analog sensor: nominal plus noise, kept inside the ok band. */
export function analogValue(sensor: Sensor, random: Random): number {
  const n = nominal(sensor);
  if (COUNTING_UNITS.has(sensor.unit)) return Math.round(n);
  const range = (sensor.sim?.max ?? n) - (sensor.sim?.min ?? n);
  const noise = (random() * 2 - 1) * NOISE_SHARE * range;
  const [low, high] = okBand(sensor);
  const value = Math.min(high, Math.max(low, n + noise));
  // One decimal for large ranges (grams, mm), two for small ones (amps, litres).
  const decimals = range >= 100 ? 1 : 2;
  return Number(value.toFixed(decimals));
}
