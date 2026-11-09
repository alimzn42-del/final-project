/**
 * Containers on the belt (owner, step 17, option a): a container shows at a station only while
 * the station's sensor sees one. Which sensors a station uses comes from machine.json
 * (`conveyor.stations[].container`), never from this file.
 *
 * Pure logic, so it is tested without a 3D view. A station's fill is the last mass its scale
 * read while weighing (the scale reads 0 once the platform is down), so a memory carries it
 * from one set of readings to the next: `remember` updates it, `tubsOnBelt` reads it.
 */
import type { LatestReading, Machine } from '@mixline/shared';

type Readings = Readonly<Record<string, LatestReading>>;

export interface TubView {
  station: string;
  /** Where the container's bottom centre is (machine.json frame, mm). */
  position: [number, number, number];
  /** What it holds, ml (net grams of water-based liquid). */
  fillMl: number;
  lid: boolean;
}

export interface StationMemory {
  present: boolean;
  ml: number;
}
export type TubMemory = ReadonlyMap<string, StationMemory>;

const valueIn = (readings: Readings) => (id: string | undefined) =>
  id === undefined ? undefined : readings[id]?.value;

/** The memory after these readings: who is there, and each station's last weighed fill. */
export function remember(machine: Machine, readings: Readings, memory: TubMemory): TubMemory {
  const value = valueIn(readings);
  const next = new Map<string, StationMemory>();
  for (const station of machine.conveyor.stations) {
    const view = station.container;
    if (!view) continue;
    const before = memory.get(station.id) ?? { present: false, ml: 0 };
    const present = value(view.present) === 1;
    let ml = before.ml;
    if (view.emptyOnArrival && present && !before.present) ml = 0;
    const weighing = view.massWhile ?? view.raised;
    const mass = value(view.mass);
    if (mass !== undefined && (weighing === undefined || value(weighing) === 1)) {
      ml = Math.max(0, mass);
    }
    next.set(station.id, { present, ml });
  }
  return next;
}

/** The containers to draw now, with the fills from `memory` (already updated). */
export function tubsOnBelt(
  machine: Machine,
  readings: Readings,
  memory: TubMemory,
  /** Whether a sensor's part is drawn on this page and its data is not stale. */
  visible: (sensorId: string) => boolean,
): TubView[] {
  const { conveyor } = machine;
  const value = valueIn(readings);
  const tubs: TubView[] = [];
  for (const station of conveyor.stations) {
    const view = station.container;
    if (!view || value(view.present) !== 1 || !visible(view.present)) continue;
    const raised = view.raised !== undefined && value(view.raised) === 1;
    const lid =
      view.lid === 'always' || (view.lid !== undefined && value(view.lid.sensor) === view.lid.code);
    tubs.push({
      station: station.id,
      position: [
        station.x,
        conveyor.surfaceY + (raised ? conveyor.liftMm : 0),
        conveyor.centerlineZ,
      ],
      fillMl: memory.get(station.id)?.ml ?? 0,
      lid,
    });
  }
  return tubs;
}
