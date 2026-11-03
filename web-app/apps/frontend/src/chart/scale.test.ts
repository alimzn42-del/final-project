/** Chart axes: round value ticks that do not magnify noise, and time ticks. */
import { describe, expect, it } from 'vitest';

import { niceStep, timeTicks, valueScale } from './scale';

const MIN = 60_000;

describe('round steps', () => {
  it('are 1, 2, 2.5 or 5 × 10^k, with the decimals their ticks need', () => {
    expect(niceStep(0.07)).toEqual({ size: 0.1, decimals: 1 });
    expect(niceStep(1.5)).toEqual({ size: 2, decimals: 0 });
    expect(niceStep(2.2)).toEqual({ size: 2.5, decimals: 1 });
    expect(niceStep(0.22)).toEqual({ size: 0.25, decimals: 2 });
    expect(niceStep(15)).toEqual({ size: 20, decimals: 0 });
    expect(niceStep(24)).toEqual({ size: 25, decimals: 0 });
    expect(niceStep(5)).toEqual({ size: 5, decimals: 0 });
  });
});

describe('the value axis', () => {
  it('three round ticks that cover every value', () => {
    const s = valueScale(1790, 1820, 1);
    expect(s.ticks).toEqual([1780, 1800, 1820]);
    expect(s.min).toBeLessThanOrEqual(1790);
    expect(s.max).toBeGreaterThanOrEqual(1820);
  });

  it('never narrower than 20 steps of the last decimal, so noise does not look like a swing', () => {
    // Pump current, 2 decimals: at least 0.2 A tall, though the values move 0.02 A.
    const s = valueScale(0.5, 0.52, 2);
    expect(s.max - s.min).toBeGreaterThanOrEqual(0.2);
    // A count that never moves (0 decimals): at least 20 tall.
    const flat = valueScale(12, 12, 0);
    expect(flat.max - flat.min).toBeGreaterThanOrEqual(20);
    expect(flat.min).toBeLessThanOrEqual(12);
    expect(flat.max).toBeGreaterThanOrEqual(12);
  });

  it('works below zero (colour a*, b*)', () => {
    const s = valueScale(-3.4, -1.2, 1);
    expect(s.min).toBeLessThanOrEqual(-3.4);
    expect(s.max).toBeGreaterThanOrEqual(-1.2);
    expect(s.ticks[1] - s.ticks[0]).toBeCloseTo(s.ticks[2] - s.ticks[1]);
  });
});

describe('the time axis', () => {
  const end = Date.parse('2026-10-29T10:00:30.000Z');

  it.each([
    [5, 1],
    [15, 5],
    [60, 15],
  ])('%i minutes: a label every %i minutes, on round minutes', (window, every) => {
    const ticks = timeTicks(end - window * MIN, end);
    // Labels too close to an edge are left out, so 15 minutes may show two.
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const t of ticks) expect(t % (every * MIN)).toBe(0);
    for (const [a, b] of ticks.slice(1).map((t, i) => [ticks[i] ?? 0, t])) {
      expect((b ?? 0) - (a ?? 0)).toBe(every * MIN);
    }
  });

  it('no label so close to an edge that it would be cut', () => {
    const from = Date.parse('2026-10-29T09:55:05.000Z');
    const to = from + 5 * MIN;
    for (const t of timeTicks(from, to)) {
      expect(t - from).toBeGreaterThanOrEqual(0.06 * 5 * MIN);
      expect(to - t).toBeGreaterThanOrEqual(0.06 * 5 * MIN);
    }
  });
});
