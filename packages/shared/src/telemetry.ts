/**
 * MQTT message payloads (docs/04-architecture.md, "Payload" and
 * "Machine-wide messages"). The simulator and, later, the real hardware
 * publish exactly these; the backend accepts nothing else.
 */
import { z } from 'zod';

import type { Sensor } from './machine.schema.js';

export const SOURCES = ['sim', 'hw'] as const;
export type Source = (typeof SOURCES)[number];

export const MACHINE_MODES = ['auto', 'manual'] as const;
export const MACHINE_STATUSES = ['idle', 'running', 'paused', 'stopped', 'fault'] as const;
export const BATCH_STEPS = [
  'baseFill',
  'dyeDose',
  'mix',
  'sample',
  'correct',
  'complete',
  'finalCheck',
  'filling',
  'rinse',
] as const;

/** UTC ISO 8601 with a "Z", e.g. 2026-10-27T12:00:00.000Z (no local offsets). */
const utcTimestamp = z.iso.datetime({
  message: 'expected a UTC time like 2026-10-27T12:00:00.000Z',
});
const source = z.enum(SOURCES);

/** `<site>/<machine>/<station>/sensors/<variable>` */
export const readingSchema = z.strictObject({
  ts: utcTimestamp,
  /** Always a number. Digital: 1/0. Enum: the integer code from valueLabels. */
  value: z.number(),
  unit: z.string(),
  source,
});
export type Reading = z.infer<typeof readingSchema>;

/** `<site>/<machine>/state` (retained). */
export const machineStateSchema = z
  .strictObject({
    ts: utcTimestamp,
    mode: z.enum(MACHINE_MODES),
    status: z.enum(MACHINE_STATUSES),
    /** null while no batch exists (idle). */
    batchId: z.string().min(1).nullable(),
    source,
  })
  .refine((s) => !(s.status === 'running' || s.status === 'paused') || s.batchId !== null, {
    message: 'a running or paused line has a batchId',
    path: ['batchId'],
  });
export type MachineState = z.infer<typeof machineStateSchema>;

/** `<site>/<machine>/batch/<event>`, event = started | step | finished | aborted. */
export const batchEventSchema = z.strictObject({
  ts: utcTimestamp,
  batchId: z.string().min(1),
  step: z.enum(BATCH_STEPS),
  recipe: z.strictObject({
    /** Target color as CIE L*a*b*: L in 0..100. */
    targetLab: z.tuple([z.number().min(0).max(100), z.number(), z.number()]),
  }),
  containersDone: z.int().nonnegative(),
  source,
});
export type BatchEventPayload = z.infer<typeof batchEventSchema>;

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Checks one sensor message: the payload format first, then that it matches
 * the sensor in machine.json (same unit; digital = 0/1; enum = a known code).
 */
export function decodeReading(sensor: Sensor, data: unknown): DecodeResult<Reading> {
  const parsed = readingSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    return { ok: false, error: `${sensor.id}: ${where}${first?.message ?? 'invalid payload'}` };
  }
  const r = parsed.data;
  const fail = (error: string): DecodeResult<Reading> => ({
    ok: false,
    error: `${sensor.id}: ${error}`,
  });

  if (r.unit !== sensor.unit) return fail(`unit "${r.unit}" should be "${sensor.unit}"`);
  if (sensor.kind === 'digital' && r.value !== 0 && r.value !== 1) {
    return fail(`digital value ${String(r.value)} should be 0 or 1`);
  }
  if (sensor.kind === 'enum' && !(String(r.value) in (sensor.valueLabels ?? {}))) {
    return fail(`enum value ${String(r.value)} is not a known code`);
  }
  return { ok: true, value: r };
}

/** Parses a JSON message body; MQTT payloads arrive as bytes/text. */
export function parseJson(text: string): DecodeResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'payload is not valid JSON' };
  }
}

/** Default for CLOCK_TOLERANCE_MS (owner, step 6). */
export const DEFAULT_CLOCK_TOLERANCE_MS = 2000;

/**
 * The time a chart shows for a reading (docs/04-architecture.md): the device's
 * own `ts`, unless it differs from when the backend received the message by
 * more than the tolerance; then the received time, because the device clock
 * is off (no battery clock, no internet in the lab).
 */
export function chartTime(deviceTs: number, receivedAt: number, toleranceMs: number): number {
  return Math.abs(deviceTs - receivedAt) > toleranceMs ? receivedAt : deviceTs;
}

/** Charts read raw readings up to this span, and the 1-minute summary beyond it. */
export const RAW_HISTORY_MAX_MS = 60 * 60 * 1000;
/** The longest history one request may ask for. */
export const HISTORY_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** Without from/to, a chart shows the last few minutes (doc 03). */
export const HISTORY_DEFAULT_MS = 5 * 60 * 1000;

export type HistoryResolution = 'raw' | '1m';

export function historyResolution(fromMs: number, toMs: number): HistoryResolution {
  return toMs - fromMs <= RAW_HISTORY_MAX_MS ? 'raw' : '1m';
}

/** GET /api/telemetry/:sensorId answer. Times are ISO 8601 UTC. */
export type HistoryResponse =
  | {
      sensorId: string;
      resolution: 'raw';
      from: string;
      to: string;
      points: { t: string; v: number }[];
    }
  | {
      sensorId: string;
      resolution: '1m';
      from: string;
      to: string;
      points: { t: string; min: number; max: number; avg: number }[];
    };

/** One entry of GET /api/telemetry/latest. `ts` is the chart time. */
export interface LatestReading {
  value: number;
  ts: string;
  receivedAt: string;
  source: Source;
}
