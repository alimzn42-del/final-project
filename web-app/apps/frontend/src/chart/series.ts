/**
 * The points behind a trend chart (plan step 14): a sensor's history from the
 * backend, then its live readings, as { t: ms, v: value } in time order.
 * Pure functions, so the rules are tested without a screen.
 */
import { type HistoryResponse, OFFLINE_AFTER_MS, RAW_HISTORY_MAX_MS } from '@mixline/shared';

export interface Point {
  t: number;
  v: number;
}

/**
 * A value holds until the next reading, for at most this long: the rule that
 * makes a sensor offline (doc 04). Analog sensors publish at 1 Hz or more,
 * digital and enum sensors send a heartbeat every 5 s, so a longer silence is
 * missing data: the line breaks, the timeline leaves a gap.
 */
export const HOLD_MS = OFFLINE_AFTER_MS;

/**
 * How much history to ask for: the window, and a little before it, so the
 * value at the left edge is known; at most an hour, so the backend answers
 * with raw readings, not the 1-minute summary.
 */
export function historySpan(windowMs: number): number {
  return Math.min(windowMs + HOLD_MS, RAW_HISTORY_MAX_MS);
}

/** The backend's answer as points (a summary, only for spans over an hour, by its average). */
export function pointsFrom(res: HistoryResponse): Point[] {
  if (res.resolution === 'raw') return res.points.map((p) => ({ t: Date.parse(p.t), v: p.v }));
  return res.points.map((p) => ({ t: Date.parse(p.t), v: p.avg }));
}

/** Index of the first point at or after `t`. */
export function indexAt(points: readonly Point[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((points[mid]?.t ?? Infinity) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Adds the points newer than the last one, and forgets those before
 * `keepFrom`, except the last of them: its value may still hold there.
 */
export function withNewer(
  points: readonly Point[],
  added: readonly Point[],
  keepFrom: number,
): readonly Point[] {
  const last = points.at(-1)?.t ?? -Infinity;
  const newer = added.filter((p) => p.t > last);
  const start = Math.max(0, indexAt(points, keepFrom) - 1);
  if (newer.length === 0 && start === 0) return points;
  return [...points.slice(start), ...newer];
}

/** The points for the window [from, to]: those inside, and the one just before `from`. */
export function inWindow(points: readonly Point[], from: number, to: number): readonly Point[] {
  const start = Math.max(0, indexAt(points, from) - 1);
  return points.slice(start, indexAt(points, to + 1));
}

/** Runs of points with no silence longer than HOLD_MS: the line breaks between runs. */
export function runs(points: readonly Point[]): Point[][] {
  const out: Point[][] = [];
  let run: Point[] = [];
  for (const p of points) {
    const prev = run.at(-1);
    if (prev && p.t - prev.t > HOLD_MS) {
      out.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length) out.push(run);
  return out;
}

/**
 * At most two points per column of the chart: the lowest and the highest, in
 * time order. An hour of 5 Hz readings stays light to draw, and no spike is lost.
 */
export function thin(points: readonly Point[], from: number, to: number, columns: number): Point[] {
  const width = (to - from) / columns;
  const out: Point[] = [];
  let column = NaN;
  let low: Point | undefined;
  let high: Point | undefined;
  const flush = () => {
    if (!low || !high) return;
    if (low === high) out.push(low);
    else out.push(...(low.t < high.t ? [low, high] : [high, low]));
  };
  for (const p of points) {
    const c = Math.floor((p.t - from) / width);
    if (c !== column || !low || !high) {
      flush();
      column = c;
      low = p;
      high = p;
    } else if (p.v < low.v) {
      low = p;
    } else if (p.v > high.v) {
      high = p;
    }
  }
  flush();
  return out;
}

/** One stretch of a timeline where a digital or enum sensor kept one value. */
export interface Band {
  /** When the value began (not cut at the window's edge): a key that stays as the window slides. */
  start: number;
  from: number;
  to: number;
  value: number;
  /** The next band starts where this one ends (the two are drawn with a thin gap between). */
  touchesNext: boolean;
}

/** The stretches of the timeline inside [from, to]; missing data (over HOLD_MS) is no band. */
export function bands(points: readonly Point[], from: number, to: number): Band[] {
  const out: Band[] = [];
  points.forEach((p, i) => {
    const next = points[i + 1];
    const begin = Math.max(p.t, from);
    const end = Math.min(next?.t ?? Infinity, p.t + HOLD_MS, to);
    if (end <= begin) return;
    const prev = out.at(-1);
    if (prev?.value === p.v && prev.to === begin) {
      prev.to = end;
      return;
    }
    out.push({ start: p.t, from: begin, to: end, value: p.v, touchesNext: false });
  });
  out.forEach((band, i) => {
    band.touchesNext = out[i + 1]?.from === band.to;
  });
  return out;
}

/** The point nearest to `t`. */
export function nearest(points: readonly Point[], t: number): Point | undefined {
  const i = indexAt(points, t);
  const before = points[i - 1];
  const after = points[i];
  if (!before) return after;
  if (!after) return before;
  return t - before.t <= after.t - t ? before : after;
}
