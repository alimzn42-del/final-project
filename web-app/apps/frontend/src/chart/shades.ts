/**
 * The shades of a state timeline (owner, step 14): one neutral grey per
 * value, never a state colour, so a pump that is off never looks like a fault.
 * A value always has the same shade; the words carry the meaning.
 */
import type { Sensor } from '@mixline/shared';

/** Shades in tokens.css (--band-1 … --band-4): the most values a sensor has (the stack light). */
export const SHADES = 4;

/**
 * A sensor's codes in shade order: code 0 first (Off, Normal, Empty, None,
 * Stopped…: the faintest), then the others as JavaScript orders the keys of
 * valueLabels (whole numbers up from 1, then -1).
 */
export function valueCodes(sensor: Sensor): number[] {
  const codes = Object.keys(sensor.valueLabels ?? {});
  return [...codes.filter((c) => c === '0'), ...codes.filter((c) => c !== '0')].map(Number);
}

/** 1 (faintest) to SHADES. */
export function shadeOf(codes: readonly number[], value: number): number {
  return Math.min(SHADES, Math.max(0, codes.indexOf(value)) + 1);
}
