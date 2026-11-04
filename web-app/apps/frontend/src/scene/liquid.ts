/**
 * Live liquids (doc 02 "Liquids", doc 03; plan step 14):
 * - a tank's level follows its `levelSource` sensor: (value − min) / (max − min), kept in 0..1;
 * - the mix colour follows the camera's L*a*b* reading, converted to screen colour (sRGB) with
 *   the standard daylight white D65 (owner, step 14: easy to change if the camera uses another;
 *   the conversion lives in shared/color.ts, step 15);
 * - without a reading, machine.json's `level` and `hex` stay in use.
 */
import { type LatestReading, labToHex, type Machine, type MachineComponent } from '@mixline/shared';

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
