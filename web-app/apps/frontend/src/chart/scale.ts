/** Axes of the trend charts (plan step 14): round value ticks, and time ticks. */

const MANTISSAS = [1, 2, 2.5, 5];

export interface Step {
  size: number;
  /** Digits after the decimal point that the step's ticks need. */
  decimals: number;
}

/** The smallest step of 1, 2, 2.5 or 5 × 10^k that is at least `raw`. */
export function niceStep(raw: number): Step {
  if (!(raw > 0) || !Number.isFinite(raw)) return { size: 1, decimals: 0 };
  for (let exp = Math.floor(Math.log10(raw)); exp < 400; exp++) {
    for (const m of MANTISSAS) {
      const size = m * 10 ** exp;
      if (size >= raw * (1 - 1e-9)) {
        return { size, decimals: Math.max(0, -exp + (m === 2.5 ? 1 : 0)) };
      }
    }
  }
  return { size: raw, decimals: 0 };
}

export interface ValueScale {
  min: number;
  max: number;
  /** Bottom, middle and top. */
  ticks: [number, number, number];
  decimals: number;
}

/**
 * The vertical range of a line chart: three round ticks around the values,
 * never narrower than 20 steps of the sensor's last decimal (2 g for a scale
 * with 1 decimal), so sensor noise does not look like a big swing.
 */
export function valueScale(lowest: number, highest: number, decimals: number): ValueScale {
  const span = Math.max(highest - lowest, 20 * 10 ** -decimals);
  const middle = (lowest + highest) / 2;
  const bottom = middle - span / 2;
  const top = middle + span / 2;
  let step = niceStep(span / 2);
  for (let i = 0; i < 20; i++) {
    const min = Math.floor(bottom / step.size) * step.size;
    const max = min + 2 * step.size;
    if (max >= top - span * 1e-9) {
      return { min, max, ticks: [min, min + step.size, max], decimals: step.decimals };
    }
    step = niceStep(step.size * 1.000001);
  }
  return { min: bottom, max: top, ticks: [bottom, middle, top], decimals };
}

const TICK_MINUTES = [1, 2, 5, 10, 15, 30, 60];

/**
 * Times to label under a chart: about five per window (every minute for
 * 5 minutes, every 5 for 15, every 15 for 60), on round minutes, none so
 * close to an edge that its label would be cut.
 */
export function timeTicks(from: number, to: number): number[] {
  const span = to - from;
  const minutes = TICK_MINUTES.find((m) => m * 60_000 >= span / 5) ?? 60;
  const every = minutes * 60_000;
  const edge = span * 0.06;
  const ticks: number[] = [];
  for (let t = Math.ceil((from + edge) / every) * every; t <= to - edge; t += every) ticks.push(t);
  return ticks;
}
