/**
 * Containers on the belt (owner, step 17, option b): the scene follows each container along the
 * belt. Which sensors a station has comes from machine.json (`conveyor.stations[].container`
 * and `conveyor.runningSensor`), never from this file.
 *
 * - A container appears where a station's sensor sees one that is not there yet (at the feeder,
 *   or anywhere when the page opens mid-batch).
 * - While the belt runs, every container slides at the belt's speed (`conveyor.speedMmPerS`):
 *   estimated, not measured, from the times the belt started and stopped. It never passes the
 *   end stop, one container radius before the belt's end.
 * - When the belt stops, a station's sensor puts the container near it exactly on the station.
 * - It takes its fill from a station's scale while lifted there (until its lid is on), and its lid
 *   from the station's lid rule; it keeps both on its way.
 * - It goes when a station's sensor stops seeing it while the belt stands still: pushed to the
 *   reject bin, or taken from the end of the belt.
 *
 * Pure logic, so it is tested without a 3D view. Times are the line's (the readings' `ts`), ms.
 */
import { containerSpec, type LatestReading, type Machine } from '@mixline/shared';

type Readings = Readonly<Record<string, LatestReading>>;

export interface TrackedTub {
  id: number;
  /** Where it was when the belt last stopped (or where a sensor saw it), mm along the belt. */
  x: number;
  ml: number;
  lid: boolean;
  /** When a station's sensor last saw it. */
  seenAt: number;
}

export interface Belt {
  tubs: readonly TrackedTub[];
  nextId: number;
  /** When the belt started, while it runs. */
  movingSince: number | null;
  /** What each station's sensor read last time. */
  present: Readonly<Record<string, boolean>>;
}

export const EMPTY_BELT: Belt = { tubs: [], nextId: 1, movingSince: null, present: {} };

/** A container nobody has seen for this long is dropped (the page lost track of it). */
export const FORGET_AFTER_MS = 90_000;

export interface TubView {
  id: number;
  /** Where the container's bottom centre is (machine.json frame, mm). */
  position: [number, number, number];
  ml: number;
  lid: boolean;
}

/** How far a container can go: the end stop, one container radius before the belt's end. */
export function endStop(machine: Machine): number {
  return machine.conveyor.endX - containerSpec(machine.container).topDiameter / 2;
}

/** Where a container is at `nowMs`: it slides with the belt while the belt runs. */
export function xAt(machine: Machine, belt: Belt, tub: TrackedTub, nowMs: number): number {
  if (belt.movingSince === null) return tub.x;
  const moved = (machine.conveyor.speedMmPerS * Math.max(0, nowMs - belt.movingSince)) / 1000;
  return Math.min(endStop(machine), tub.x + moved);
}

/** Half the smallest gap between two stations: how far from a station a sensor can claim a tub. */
function reach(machine: Machine): number {
  const xs = machine.conveyor.stations
    .filter((s) => s.container)
    .map((s) => s.x)
    .sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? x));
  return (gaps.length ? Math.min(...gaps) : 300) / 2 - 10;
}

/** The belt after a new set of readings. */
export function follow(machine: Machine, belt: Belt, readings: Readings, nowMs: number): Belt {
  const { conveyor } = machine;
  const value = (id: string | undefined) => (id === undefined ? undefined : readings[id]?.value);
  let tubs = belt.tubs.map((t) => ({ ...t }));
  let { movingSince, nextId } = belt;

  const run = readings[conveyor.runningSensor];
  const running = run?.value === 1;
  const runAt = run ? Date.parse(run.ts) : nowMs;
  if (running && movingSince === null) movingSince = runAt;
  if (!running && movingSince !== null) {
    // The belt stopped: every container stays where it took them.
    const stopped: Belt = { ...belt, movingSince };
    tubs = tubs.map((t) => ({ ...t, x: xAt(machine, stopped, t, runAt) }));
    movingSince = null;
  }

  const present: Record<string, boolean> = {};
  const near = reach(machine);
  const end = endStop(machine);
  for (const station of conveyor.stations) {
    const view = station.container;
    if (!view) continue;
    const sees = value(view.present) === 1;
    const saw = belt.present[station.id] ?? false;
    present[station.id] = sees;
    const closest = tubs
      .filter((t) => Math.abs(t.x - station.x) <= near)
      .sort((a, b) => Math.abs(a.x - station.x) - Math.abs(b.x - station.x))[0];
    const onIt = closest !== undefined && Math.abs(closest.x - station.x) < 1;

    // It left without the belt: pushed off while the belt stood still, or taken from the end
    // stop (nothing leaves there with the belt, which may start again at once).
    if (!sees && saw && onIt && (!running || station.x >= end - 1)) {
      tubs = tubs.filter((t) => t !== closest);
      continue;
    }
    if (running || !sees) continue;
    const tub = closest ?? { id: nextId++, x: station.x, ml: 0, lid: false, seenAt: nowMs };
    if (!closest) tubs.push(tub);
    tub.x = station.x;
    tub.seenAt = nowMs;
    const raised = view.raised !== undefined && value(view.raised) === 1;
    const mass = value(view.mass);
    if (raised && mass !== undefined && !tub.lid) tub.ml = Math.max(0, mass);
    if (view.lid === 'always' || (view.lid && value(view.lid.sensor) === view.lid.code)) {
      tub.lid = true;
    }
  }

  // A container nobody has seen for a long time, with the belt still, is not followed any more.
  if (movingSince === null) tubs = tubs.filter((t) => nowMs - t.seenAt <= FORGET_AFTER_MS);
  return { tubs, nextId, movingSince, present };
}

/** The containers to draw at `nowMs`. */
export function tubsOnBelt(
  machine: Machine,
  belt: Belt,
  readings: Readings,
  nowMs: number,
  /** Whether a station's sensor is drawn on this page and its data is not stale. */
  visible: (sensorId: string) => boolean,
): TubView[] {
  const { conveyor } = machine;
  const stations = conveyor.stations.filter((s) => s.container);
  return belt.tubs.flatMap((tub) => {
    const x = xAt(machine, belt, tub, nowMs);
    const nearest = [...stations].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const view = nearest?.container;
    if (!nearest || !view || !visible(view.present)) return [];
    const atStation = belt.movingSince === null && Math.abs(x - nearest.x) < 1;
    const raised = atStation && view.raised !== undefined && readings[view.raised]?.value === 1;
    return [
      {
        id: tub.id,
        position: [x, conveyor.surfaceY + (raised ? conveyor.liftMm : 0), conveyor.centerlineZ],
        ml: tub.ml,
        lid: tub.lid,
      },
    ];
  });
}
