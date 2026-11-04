/**
 * Live liquids (doc 02 "Liquids", doc 03; plan step 14):
 * - a tank's level follows its `levelSource` sensor: (value − min) / (max − min), kept in 0..1;
 * - the mix colour follows the camera's L*a*b* reading, converted to screen colour (sRGB) with
 *   the standard daylight white D65 (owner, step 14: easy to change if the camera uses another);
 * - without a reading, machine.json's `level` and `hex` stay in use.
 */
import type { LatestReading, Machine, MachineComponent } from '@mixline/shared';

type Readings = Readonly<Record<string, LatestReading>>;
type Liquid = NonNullable<Extract<MachineComponent['geometry'], { shape: 'cylinder' }>['liquid']>;

export function liveLevel(liquid: Liquid, readings: Readings): number {
  const source = liquid.levelSource;
  const reading = source && readings[source.sensor];
  if (!source || !reading || source.max === source.min) return liquid.level;
  return Math.min(1, Math.max(0, (reading.value - source.min) / (source.max - source.min)));
}

/** The mix colour from the camera's L*, a*, b* readings; undefined until all three arrived. */
export function liveMixColour(machine: Machine, readings: Readings): string | undefined {
  const [l, a, b] = machine.liquids.mix.source.map((id) => readings[id]?.value);
  if (l === undefined || a === undefined || b === undefined) return undefined;
  return labToHex(l, a, b);
}

/** CIE L*a*b* (white D65) to an sRGB hex colour; colours outside the screen's range are clipped. */
export function labToHex(l: number, a: number, b: number): string {
  // L*a*b* to XYZ.
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const EPSILON = 216 / 24389;
  const KAPPA = 24389 / 27;
  const f = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);
  const x = 0.95047 * f(fx);
  const y = 1.0 * (l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA);
  const z = 1.08883 * f(fz);
  // XYZ to linear sRGB, then the sRGB curve.
  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const channel = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return `#${linear.map((c) => channel(c).toString(16).padStart(2, '0')).join('')}`;
}
