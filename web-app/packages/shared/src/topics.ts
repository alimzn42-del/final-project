/**
 * MQTT topic strings (fixed format, docs/04-architecture.md):
 *
 *   <site>/<machine>/<station>/sensors/<variable>
 *   <site>/<machine>/<station>/twin/<variable>        (later)
 *   <site>/<machine>/<station>/health/<component>     (later)
 *   <site>/<machine>/state
 *   <site>/<machine>/batch/<event>
 *
 * Every app builds and parses topics through these helpers, never by hand.
 */
import type { Machine, Sensor } from './machine.schema.js';

export const BATCH_EVENTS = ['started', 'step', 'finished', 'aborted'] as const;
export type BatchEvent = (typeof BATCH_EVENTS)[number];

/** The `<site>/<machine>` prefix every topic starts with. */
export interface TopicRoot {
  site: string;
  machine: string;
}

export type ParsedTopic =
  | { kind: 'sensor'; station: string; variable: string }
  | { kind: 'twin'; station: string; variable: string }
  | { kind: 'health'; station: string; component: string }
  | { kind: 'state' }
  | { kind: 'batch'; event: BatchEvent };

export const sensorTopic = (root: TopicRoot, s: Pick<Sensor, 'station' | 'variable'>) =>
  `${root.site}/${root.machine}/${s.station}/sensors/${s.variable}`;

export const twinTopic = (root: TopicRoot, s: Pick<Sensor, 'station' | 'variable'>) =>
  `${root.site}/${root.machine}/${s.station}/twin/${s.variable}`;

export const healthTopic = (root: TopicRoot, station: string, component: string) =>
  `${root.site}/${root.machine}/${station}/health/${component}`;

export const stateTopic = (root: TopicRoot) => `${root.site}/${root.machine}/state`;

export const batchTopic = (root: TopicRoot, event: BatchEvent) =>
  `${root.site}/${root.machine}/batch/${event}`;

/** MQTT subscription patterns (`+` = any one segment). */
export const subscriptions = (root: TopicRoot) => ({
  sensors: `${root.site}/${root.machine}/+/sensors/+`,
  state: stateTopic(root),
  batch: `${root.site}/${root.machine}/batch/+`,
});

/**
 * Reads a topic string. Returns undefined for anything that is not one of the
 * five forms of this site and machine (including unknown batch events).
 */
export function parseTopic(root: TopicRoot, topic: string): ParsedTopic | undefined {
  const parts = topic.split('/');
  if (parts[0] !== root.site || parts[1] !== root.machine) return undefined;
  if (parts.some((p) => p === '')) return undefined;
  const rest = parts.slice(2);

  if (rest.length === 1 && rest[0] === 'state') return { kind: 'state' };

  if (rest.length === 2 && rest[0] === 'batch') {
    const event = rest[1];
    return isBatchEvent(event) ? { kind: 'batch', event } : undefined;
  }

  if (rest.length === 3) {
    const [station, type, name] = rest as [string, string, string];
    if (type === 'sensors') return { kind: 'sensor', station, variable: name };
    if (type === 'twin') return { kind: 'twin', station, variable: name };
    if (type === 'health') return { kind: 'health', station, component: name };
  }
  return undefined;
}

function isBatchEvent(value: string | undefined): value is BatchEvent {
  return (BATCH_EVENTS as readonly (string | undefined)[]).includes(value);
}

/**
 * Lookup table topic -> sensor for one machine, used by the backend to find
 * which sensor an incoming message belongs to. Topics are unique (step 3 rules).
 */
export function sensorsByTopic(machine: Machine): Map<string, Sensor> {
  const map = new Map<string, Sensor>();
  for (const c of machine.components) {
    for (const s of c.sensors) map.set(sensorTopic(machine, s), s);
  }
  return map;
}
