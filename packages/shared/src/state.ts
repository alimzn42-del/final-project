/**
 * State logic (docs/03-ui-spec.md "State colors", docs/04-architecture.md
 * "State from limits"):
 *
 * - A sensor is fault / warning / ok from its limits, or offline when no
 *   message arrived for more than 10 s. `fault*` limits beat `warn*` limits.
 * - A component is the worst state of its sensors; with no sensors it is
 *   `none` (normal look, no badge).
 * - Sub-section, section and line show the worst state of their children,
 *   ignoring `none`. A section's children are its sub-sections plus its own
 *   parts with `subsection: null`. Parents (grouping only) do not roll up.
 * - `pending` is a look, not a state: a pending part still shows its state.
 */
import type { Machine, MachineComponent, Sensor } from './machine.schema.js';

export const STATES = ['fault', 'warning', 'offline', 'ok', 'none'] as const;
export type State = (typeof STATES)[number];

/** Rank from doc 03: 1 is the worst. `none` is not counted. */
export const STATE_RANK: Record<Exclude<State, 'none'>, number> = {
  fault: 1,
  warning: 2,
  offline: 3,
  ok: 4,
};

/** A sensor with no message for longer than this is offline (doc 04). */
export const OFFLINE_AFTER_MS = 10_000;

/**
 * The latest value of a sensor and when the backend RECEIVED it (ms since
 * epoch). Age is measured from receipt, not from the message's own `ts`,
 * because device clocks in an offline lab can be wrong.
 */
export interface LatestValue {
  value: number;
  receivedAt: number;
}

/** State of one value against the sensor's limits. Limits are strict: at the limit is OK. */
export function valueState(sensor: Sensor, value: number): 'fault' | 'warning' | 'ok' {
  const L = sensor.limits ?? {};
  if (
    (L.faultBelow !== undefined && value < L.faultBelow) ||
    (L.faultAbove !== undefined && value > L.faultAbove) ||
    (L.faultWhen !== undefined && value === L.faultWhen)
  ) {
    return 'fault';
  }
  if (
    (L.warnBelow !== undefined && value < L.warnBelow) ||
    (L.warnAbove !== undefined && value > L.warnAbove) ||
    (L.warnWhen !== undefined && value === L.warnWhen)
  ) {
    return 'warning';
  }
  return 'ok';
}

export function sensorState(sensor: Sensor, latest: LatestValue | undefined, now: number): State {
  if (!latest || now - latest.receivedAt > OFFLINE_AFTER_MS) return 'offline';
  return valueState(sensor, latest.value);
}

/** The worst of several states, ignoring `none`; `none` if nothing counts. */
export function worstState(states: Iterable<State>): State {
  let worst: State = 'none';
  for (const s of states) {
    if (s === 'none') continue;
    if (worst === 'none' || STATE_RANK[s] < STATE_RANK[worst]) worst = s;
  }
  return worst;
}

export function componentState(
  c: MachineComponent,
  latest: ReadonlyMap<string, LatestValue>,
  now: number,
): State {
  return worstState(c.sensors.map((s) => sensorState(s, latest.get(s.id), now)));
}

export const subsectionKey = (sectionId: string, subsectionId: string) =>
  `${sectionId}/${subsectionId}`;

export interface MachineStates {
  /** By sensor id. */
  sensors: Map<string, State>;
  /** By component id. */
  components: Map<string, State>;
  /** By `subsectionKey(section, subsection)`. */
  subsections: Map<string, State>;
  /** By section id. */
  sections: Map<string, State>;
  line: State;
}

/** States of every sensor, part, sub-section, section and the line at time `now`. */
export function machineStates(
  machine: Machine,
  latest: ReadonlyMap<string, LatestValue>,
  now: number,
): MachineStates {
  const sensors = new Map<string, State>();
  const components = new Map<string, State>();
  for (const c of machine.components) {
    const states = c.sensors.map((s) => {
      const state = sensorState(s, latest.get(s.id), now);
      sensors.set(s.id, state);
      return state;
    });
    components.set(c.id, worstState(states));
  }

  const stateOf = (c: MachineComponent) => components.get(c.id) ?? 'none';
  const subsections = new Map<string, State>();
  const sections = new Map<string, State>();
  for (const section of machine.sections) {
    const inSection = machine.components.filter((c) => c.section === section.id);
    const children: State[] = [];
    for (const sub of section.subsections) {
      const state = worstState(inSection.filter((c) => c.subsection === sub.id).map(stateOf));
      subsections.set(subsectionKey(section.id, sub.id), state);
      children.push(state);
    }
    children.push(...inSection.filter((c) => c.subsection === null).map(stateOf));
    sections.set(section.id, worstState(children));
  }

  return { sensors, components, subsections, sections, line: worstState(sections.values()) };
}
