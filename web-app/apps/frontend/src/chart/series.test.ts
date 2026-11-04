/** The points behind the trend charts: history span, live additions, gaps, thinning, bands. */
import { describe, expect, it } from 'vitest';

import {
  bands,
  historySpan,
  inWindow,
  nearest,
  type Point,
  pointsFrom,
  runs,
  thin,
  withNewer,
} from './series';

const MIN = 60_000;
const p = (t: number, v = 0): Point => ({ t, v });

describe('the history to ask for', () => {
  it('is the window and 10 s before it, so the value at the left edge is known', () => {
    expect(historySpan(5 * MIN)).toBe(5 * MIN + 10_000);
    expect(historySpan(15 * MIN)).toBe(15 * MIN + 10_000);
  });

  it('is never over an hour, so the backend sends raw readings (not the 1-minute summary)', () => {
    expect(historySpan(60 * MIN)).toBe(60 * MIN);
  });

  it('reads raw points, and a summary by its average', () => {
    const t = '2026-10-29T10:00:00.000Z';
    const span = { sensorId: 's', from: t, to: t };
    expect(pointsFrom({ ...span, resolution: 'raw', points: [{ t, v: 3 }] })).toEqual([
      { t: Date.parse(t), v: 3 },
    ]);
    expect(
      pointsFrom({ ...span, resolution: '1m', points: [{ t, min: 1, max: 5, avg: 2 }] }),
    ).toEqual([{ t: Date.parse(t), v: 2 }]);
  });
});

describe('live readings', () => {
  it('are added at the end when newer; one already there is not added twice', () => {
    const points = [p(1000), p(2000)];
    expect(withNewer(points, [p(2000), p(3000)], 0)).toEqual([p(1000), p(2000), p(3000)]);
  });

  it('old points are forgotten, except the last one before the window (its value still holds)', () => {
    const points = [p(1000), p(2000), p(3000), p(4000)];
    expect(withNewer(points, [p(5000)], 3500)).toEqual([p(3000), p(4000), p(5000)]);
  });

  it('nothing new: the same array (no re-render)', () => {
    const points = [p(1000)];
    expect(withNewer(points, [], 0)).toBe(points);
  });
});

describe('the window', () => {
  it('keeps the points inside it and the one just before it', () => {
    const points = [p(0), p(1000), p(2000), p(3000), p(4000)];
    expect(inWindow(points, 1500, 3000)).toEqual([p(1000), p(2000), p(3000)]);
  });
});

describe('missing data', () => {
  it('breaks the line after more than 10 s without a reading', () => {
    const points = [p(0), p(1000), p(12_000), p(13_000)];
    expect(runs(points)).toEqual([
      [p(0), p(1000)],
      [p(12_000), p(13_000)],
    ]);
  });

  it('10 s exactly is not a gap', () => {
    expect(runs([p(0), p(10_000)])).toHaveLength(1);
  });
});

describe('thinning', () => {
  it('keeps at most the lowest and the highest point per column, in time order', () => {
    // 10 columns of 100 ms over one second; column 0 has five points.
    const points = [p(0, 5), p(20, 9), p(40, 1), p(60, 7), p(80, 4), p(150, 3)];
    expect(thin(points, 0, 1000, 10)).toEqual([p(20, 9), p(40, 1), p(150, 3)]);
  });

  it('an hour of 5 Hz readings shrinks to two points per column, and keeps a spike', () => {
    const points = Array.from({ length: 18_000 }, (_, i) => p(i * 200, i === 9000 ? 99 : 1));
    const thinned = thin(points, 0, 3_600_000, 300);
    expect(thinned.length).toBeLessThanOrEqual(600);
    expect(thinned.some((q) => q.v === 99)).toBe(true);
  });
});

describe('timeline bands', () => {
  it('a value holds until the next reading; the same value in a row is one band', () => {
    const points = [p(0, 1), p(5000, 1), p(10_000, 0), p(15_000, 0)];
    expect(bands(points, 0, 18_000)).toEqual([
      { start: 0, from: 0, to: 10_000, value: 1, touchesNext: true },
      { start: 10_000, from: 10_000, to: 18_000, value: 0, touchesNext: false },
    ]);
  });

  it('a value holds 10 s at most: then the band ends and the timeline is empty', () => {
    const points = [p(0, 1), p(60_000, 1)];
    expect(bands(points, 0, 65_000)).toEqual([
      { start: 0, from: 0, to: 10_000, value: 1, touchesNext: false },
      { start: 60_000, from: 60_000, to: 65_000, value: 1, touchesNext: false },
    ]);
  });

  it('is cut at the window, and keeps when its value began (a stable key while the window slides)', () => {
    const points = [p(0, 1), p(5000, 1), p(10_000, 1)];
    expect(bands(points, 3000, 12_000)).toEqual([
      { start: 0, from: 3000, to: 12_000, value: 1, touchesNext: false },
    ]);
  });
});

describe('the nearest point', () => {
  it('is the one closest in time; none for no points', () => {
    const points = [p(0), p(1000), p(3000)];
    expect(nearest(points, 1900)).toEqual(p(1000));
    expect(nearest(points, 2100)).toEqual(p(3000));
    expect(nearest(points, 9999)).toEqual(p(3000));
    expect(nearest([], 0)).toBeUndefined();
  });
});
