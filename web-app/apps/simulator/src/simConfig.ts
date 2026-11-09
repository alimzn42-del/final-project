/**
 * The simulator's tuning file, config/simulator.json (plan step 15): recipes, the colour model's
 * dye strengths, flow rates and timings. Kept apart from machine.json (owner, step 15), which
 * stays the description of the line itself. Every number is an estimate.
 */
import { formatIssues, zodIssues } from '@mixline/shared';
import { readJsonFile } from '@mixline/shared/node';
import { z } from 'zod';

export const DYES = ['cyan', 'magenta', 'yellow', 'black'] as const;
export type Dye = (typeof DYES)[number];

/** cabinet.stackLight's codes by value word (machine.json; checked by the sensor table). */
export const STACK_LIGHT_CODES = { off: 0, green: 1, yellow: 2, red: 3 } as const;
const STACK_LIGHTS = [
  'off',
  'green',
  'yellow',
  'red',
] as const satisfies readonly (keyof typeof STACK_LIGHT_CODES)[];

const perDye = <T extends z.ZodType>(value: T) =>
  z.strictObject({ cyan: value, magenta: value, yellow: value, black: value });

const positive = z.number().positive();
const atLeastZero = z.number().nonnegative();
const share = z.number().gt(0).max(1);
const notes = z.string().optional();

const recipeSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'a short id like "green"'),
  /** Grams of each dye per kg of base; 0 = the recipe does not use that dye. */
  dyesGPerKg: perDye(atLeastZero).refine((d) => DYES.some((dye) => d[dye] > 0), {
    message: 'a recipe needs at least one dye',
  }),
});

export const simConfigSchema = z.strictObject({
  notes,
  recipes: z.strictObject({
    list: z
      .array(recipeSchema)
      .min(1)
      .refine((list) => new Set(list.map((r) => r.id)).size === list.length, {
        message: 'recipe ids must be unique',
      })
      .refine((list) => DYES.every((d) => list.filter((r) => r.dyesGPerKg[d] > 0).length >= 2), {
        message: 'every dye pump must appear in at least two recipes (owner, step 15)',
      }),
    notes,
  }),
  /** Owner, step 17: until orders exist, each batch fills a random number of containers. */
  order: z
    .strictObject({
      containersMin: z.int().positive(),
      containersMax: z.int().positive(),
      fillG: positive,
      notes,
    })
    .refine((o) => o.containersMin <= o.containersMax, {
      message: 'containersMin must not be above containersMax',
      path: ['containersMax'],
    }),
  batch: z.strictObject({
    firstPortionG: positive,
    heelG: atLeastZero,
    firstDoseShare: share,
    correctionShare: share,
    maxCorrections: z.int().nonnegative(),
    toleranceDeltaE: positive,
    pauseS: atLeastZero,
    notes,
  }),
  rinse: z.strictObject({
    waterG: positive,
    times: z.int().nonnegative(),
    mixS: atLeastZero,
    emptyBelowG: positive,
    residueG: atLeastZero,
    clearDeltaE: positive,
    notes,
  }),
  dyes: z.strictObject({
    absorbance: perDye(z.tuple([atLeastZero, atLeastZero, atLeastZero])),
    lotSpread: z.number().min(0).lt(1),
    notes,
  }),
  camera: z.strictObject({
    /** Liquid depth from the window to the white back (the light crosses it twice). */
    depthMm: positive,
    windowTransmission: share,
    glare: z.number().min(0).lt(1),
    cellG: positive,
    noise: atLeastZero,
    whiteRef: z.number().min(0).max(255),
    notes,
  }),
  pumps: z.strictObject({
    baseGPerS: positive,
    waterGPerS: positive,
    drainGPerS: positive,
    fillingGPerS: positive,
    sampleGPerS: positive,
    currentA: positive,
    dyeStepsPerS: positive,
    dyeGPerStep: positive,
    dyeLoad: atLeastZero,
    notes,
  }),
  mixer: z.strictObject({ rpm: positive, rampS: positive, runS: atLeastZero, notes }),
  stations: z.strictObject({ servoS: positive, settleS: atLeastZero, pressS: positive, notes }),
  /** Owner, step 17: a worker takes each container from the end of the belt. */
  outfeed: z.strictObject({
    takeAwayS: z.tuple([atLeastZero, atLeastZero]).refine(([low, high]) => low <= high, {
      message: 'the first number is the smallest',
    }),
    notes,
  }),
  check: z.strictObject({
    toleranceG: positive,
    shortFillChance: z.number().min(0).max(1),
    shortFillG: z.tuple([positive, positive]).refine(([low, high]) => low <= high, {
      message: 'the first number is the smallest',
    }),
    notes,
  }),
  supplies: z.strictObject({
    bigTankFullG: positive,
    bigTankKeepG: atLeastZero,
    waterContainerFullG: positive,
    dyeTankFullG: positive,
    dyeTankKeepG: atLeastZero,
    cupsFull: z.int().positive(),
    lidsFull: z.int().positive(),
    drainBucketFullG: positive,
    rejectBoxFull: z.int().positive(),
    serviceS: atLeastZero,
    notes,
  }),
  /** Placeholder until the PLC defines the lights: the value words of cabinet.stackLight. */
  stackLight: z.strictObject({
    running: z.enum(STACK_LIGHTS),
    idle: z.enum(STACK_LIGHTS),
    notes,
  }),
  noise: z.strictObject({
    scaleG: atLeastZero,
    levelMm: atLeastZero,
    currentA: atLeastZero,
    share: atLeastZero,
    notes,
  }),
});
export type SimConfig = z.infer<typeof simConfigSchema>;
export type Recipe = z.infer<typeof recipeSchema>;

/** Checks the tuning file; throws one error listing every problem. */
export function parseSimConfig(data: unknown, name = 'simulator.json'): SimConfig {
  const parsed = simConfigSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = zodIssues(parsed.error, data);
  throw new Error(
    `${name} is invalid (${String(issues.length)} problem(s)):\n${formatIssues(issues)}`,
  );
}

export function loadSimConfig(path: string): SimConfig {
  return parseSimConfig(readJsonFile(path), path);
}
