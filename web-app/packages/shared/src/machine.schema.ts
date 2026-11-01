/**
 * Zod schema for config/machine.json, the single source of truth for the line
 * (see "machine.json shape" in docs/04-architecture.md).
 *
 * This file checks the SHAPE of the file and the rules that concern one item
 * at a time. Rules that compare items with each other (unique IDs, references
 * between components) live in machine.rules.ts.
 *
 * Every object is strict: an unknown or misspelled key is an error.
 */
import { z } from 'zod';

export const STATUSES = ['confirmed', 'estimated', 'pending'] as const;
export const MATERIALS = [
  'wood',
  'clearPlastic',
  'plastic',
  'metal',
  'acrylic',
  'printed',
  'electronics',
  'rubber',
] as const;
export const SENSOR_KINDS = ['analog', 'digital', 'enum'] as const;
export const ANCHORS = ['bottom', 'center'] as const;

// ---------- building blocks ----------

const id = z.string().min(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a color like #1A2B3C');
const i18nKey = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/, 'expected an i18n key like part.vessel');
/** One segment of an MQTT topic: no "/", no wildcards, no spaces. */
const topicSegment = z
  .string()
  .regex(/^[A-Za-z0-9_]+$/, 'expected letters, digits or "_" only (it is part of an MQTT topic)');
const status = z.enum(STATUSES);
const material = z.enum(MATERIALS);
const positive = z.number().positive();
const fraction = z.number().min(0).max(1);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** valueLabels keys are the integer codes a digital or enum sensor publishes. */
const integerCode = z.string().regex(/^-?\d+$/, 'expected an integer code such as "0" or "-1"');

// ---------- geometry ----------

const levelSource = z
  .strictObject({ sensor: id, min: z.number(), max: z.number() })
  .refine((s) => s.min < s.max, { message: 'min must be below max', path: ['max'] });

const liquidLevel = { level: fraction, levelSource: levelSource.optional() };

/** A liquid takes its color either from `liquids` (base / mix) or from its own hex. */
const liquid = z.union([
  z.strictObject({ colorRef: z.enum(['base', 'mix']), ...liquidLevel }),
  z.strictObject({ colorHex: hexColor, ...liquidLevel }),
]);

const boxGeometry = z
  .strictObject({
    shape: z.literal('box'),
    size: z.tuple([positive, positive, positive]),
    hollow: z.literal(true).optional(),
    wallThickness: positive.optional(),
  })
  .refine((g) => !g.hollow || g.wallThickness !== undefined, {
    message: 'a hollow box needs wallThickness',
    path: ['wallThickness'],
  })
  .refine((g) => g.wallThickness === undefined || 2 * g.wallThickness < Math.min(...g.size), {
    message: 'walls are thicker than the box',
    path: ['wallThickness'],
  });

const cylinderGeometry = z.strictObject({
  shape: z.literal('cylinder'),
  diameter: positive,
  height: positive,
  liquid: liquid.optional(),
});

const geometry = z.discriminatedUnion('shape', [boxGeometry, cylinderGeometry]);

// ---------- sensors ----------

const sim = z
  .strictObject({ min: z.number(), max: z.number(), nominal: z.number() })
  .refine((s) => s.min <= s.nominal && s.nominal <= s.max, {
    message: 'nominal must be between min and max',
    path: ['nominal'],
  });

const limits = z.strictObject({
  warnBelow: z.number().optional(),
  faultBelow: z.number().optional(),
  warnAbove: z.number().optional(),
  faultAbove: z.number().optional(),
  warnWhen: z.number().optional(),
  faultWhen: z.number().optional(),
});

const sensor = z
  .strictObject({
    id,
    station: topicSegment,
    variable: topicSegment,
    unit: z.string(),
    kind: z.enum(SENSOR_KINDS),
    labelKey: i18nKey,
    valueLabels: z.record(integerCode, i18nKey).optional(),
    /** Analog only: digits shown after the decimal point (owner, step 14), so numbers do not jump. */
    decimals: z.number().int().min(0).max(6).optional(),
    measures: z.literal('netLiquid').optional(),
    sim: sim.optional(),
    limits: limits.optional(),
  })
  .superRefine((s, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    const analog = s.kind === 'analog';
    const L = s.limits ?? {};

    // Units: digital sensors publish 1/0 and use the unit "bool" (doc 04).
    if (s.kind === 'digital' && s.unit !== 'bool')
      fail('unit', 'a digital sensor uses unit "bool"');
    if (s.unit === 'bool' && s.kind !== 'digital')
      fail('kind', 'unit "bool" is for digital sensors');

    // Scales publish net liquid mass in grams (doc 04, publishing rules).
    if (s.unit === 'g' && s.measures !== 'netLiquid') {
      fail('measures', 'a mass sensor (unit "g") must say measures: "netLiquid"');
    }
    if (s.measures !== undefined && s.unit !== 'g')
      fail('measures', 'only mass sensors use measures');

    // Decimals are set per sensor (owner, step 14): two sensors with the same unit may differ.
    if (analog && s.decimals === undefined) fail('decimals', 'an analog sensor needs decimals');
    if (!analog && s.decimals !== undefined) {
      fail('decimals', `a ${s.kind} sensor shows words, not decimals`);
    }

    if (analog) {
      if (s.valueLabels) fail('valueLabels', 'analog sensors show numbers, not value labels');
      if (L.warnWhen !== undefined || L.faultWhen !== undefined) {
        fail('limits', 'warnWhen / faultWhen are for digital and enum sensors');
      }
      if (L.warnBelow !== undefined && L.faultBelow !== undefined && L.faultBelow >= L.warnBelow) {
        fail('limits', 'faultBelow must be below warnBelow (fault is the worse case)');
      }
      if (L.warnAbove !== undefined && L.faultAbove !== undefined && L.faultAbove <= L.warnAbove) {
        fail('limits', 'faultAbove must be above warnAbove (fault is the worse case)');
      }
      return;
    }

    // Digital and enum: every code the sensor can publish needs a word (doc 03).
    const below = [L.warnBelow, L.faultBelow, L.warnAbove, L.faultAbove];
    if (below.some((v) => v !== undefined)) {
      fail('limits', 'digital and enum sensors use warnWhen / faultWhen');
    }
    if (!s.valueLabels) {
      fail('valueLabels', `a ${s.kind} sensor needs valueLabels for every code it publishes`);
      return;
    }
    const labelled = new Set(Object.keys(s.valueLabels));
    if (s.sim) {
      for (let code = s.sim.min; code <= s.sim.max; code++) {
        if (!labelled.has(String(code))) fail('valueLabels', `code ${String(code)} has no label`);
      }
    }
    for (const key of ['warnWhen', 'faultWhen'] as const) {
      const code = L[key];
      if (code !== undefined && !labelled.has(String(code))) {
        fail('limits', `${key} code ${String(code)} has no label in valueLabels`);
      }
    }
  });

// ---------- components ----------

const component = z
  .strictObject({
    id,
    type: id,
    labelKey: i18nKey,
    /** Values for {{placeholders}} in the label, each an i18n key itself. */
    labelParams: z.record(z.string().regex(/^\w+$/), i18nKey).optional(),
    /** null = scene only (the table). */
    section: id.nullable(),
    /** null = shown directly on the section page. */
    subsection: id.nullable(),
    /** Grouping only: the part is listed under its parent. */
    parent: id.optional(),
    status,
    anchor: z.enum(ANCHORS).default('bottom'),
    position: vec3,
    rotationDeg: vec3,
    geometry,
    material,
    color: hexColor.optional(),
    notes: z.string().optional(),
    sensors: z.array(sensor),
  })
  .refine((c) => c.section !== null || c.subsection === null, {
    message: 'a component without a section cannot have a subsection',
    path: ['subsection'],
  })
  // Doc 02: rotated parts use the "center" anchor; a rotated bottom anchor is ambiguous.
  .refine((c) => c.rotationDeg.every((r) => r === 0) || c.anchor === 'center', {
    message: 'a rotated component must use anchor "center"',
    path: ['anchor'],
  });

// ---------- the whole file ----------

export const machineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  liquids: z.strictObject({
    base: z.strictObject({ hex: hexColor, opacity: fraction, notes: z.string().optional() }),
    mix: z.strictObject({
      hex: hexColor,
      opacity: fraction,
      /** Sensor ids of the camera's L*, a*, b* readings. */
      source: z.tuple([id, id, id]),
      notes: z.string().optional(),
    }),
  }),
  site: topicSegment,
  machine: topicSegment,
  units: z.strictObject({ length: z.literal('mm'), mass: z.literal('g') }),
  /** Human-readable description of the coordinate frame; not used by code. */
  frame: z.strictObject({
    origin: z.string(),
    x: z.string(),
    y: z.string(),
    z: z.string(),
    position: z.string(),
    cylinderAxis: z.string(),
  }),
  table: z.strictObject({
    width: positive,
    depth: positive,
    heightToFloor: positive,
    status,
  }),
  container: z.strictObject({
    status,
    shape: id,
    topDiameter: positive,
    baseDiameter: positive,
    height: positive,
    lid: id,
    fillTargetG: positive,
    perBatch: z.int().positive(),
    material,
    tareG: z.number().nonnegative(),
    notes: z.string().optional(),
  }),
  conveyor: z
    .strictObject({
      centerlineZ: z.number(),
      surfaceY: z.number(),
      startX: z.number(),
      endX: z.number(),
      beltWidth: positive,
      beltGap: positive,
      status,
      stations: z.array(z.strictObject({ id, x: z.number() })),
    })
    .refine((c) => c.startX < c.endX, { message: 'startX must be below endX', path: ['endX'] }),
  sections: z.array(
    z.strictObject({
      id,
      labelKey: i18nKey,
      subsections: z.array(z.strictObject({ id, labelKey: i18nKey })),
    }),
  ),
  components: z.array(component),
});

/** The machine after parsing (defaults applied, e.g. anchor). */
export type Machine = z.infer<typeof machineSchema>;
export type MachineComponent = Machine['components'][number];
export type Sensor = MachineComponent['sensors'][number];
export type Geometry = MachineComponent['geometry'];
export type Section = Machine['sections'][number];
export type Status = (typeof STATUSES)[number];
export type SensorKind = (typeof SENSOR_KINDS)[number];
