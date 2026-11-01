/**
 * Test-only helpers: read the real files in config/ and return deep copies,
 * so each test can break its own copy without affecting the others.
 * Excluded from the build (see tsconfig.build.json).
 */
import { readFileSync } from 'node:fs';

const configDir = new URL('../../../../config/', import.meta.url);

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, configDir), 'utf8'));
}

/** The raw machine.json, as plain JSON (not yet validated). */
export function rawMachine(): MachineJson {
  return readJson('machine.json') as MachineJson;
}

export function rawLocales(): { en: Record<string, string>; ar: Record<string, string> } {
  return {
    en: readJson('locales/en.json') as Record<string, string>,
    ar: readJson('locales/ar.json') as Record<string, string>,
  };
}

/** Loose JSON shape so tests can reach in and break things on purpose. */
export interface MachineJson {
  [key: string]: unknown;
  sections: { id: string; labelKey: string; subsections: { id: string; labelKey: string }[] }[];
  components: ComponentJson[];
}

export interface ComponentJson {
  [key: string]: unknown;
  id: string;
  labelKey: string;
  section: string | null;
  subsection: string | null;
  sensors: SensorJson[];
  geometry: Record<string, unknown>;
}

export type SensorJson = Record<string, unknown> & { id: string };

/**
 * TEST-ONLY limits. The real machine.json has no limits: the PLC owns all
 * limits and alarms (docs/04-architecture.md). These made-up values only keep
 * the generic limit and roll-up logic tested; they are not line rules.
 */
export const TEST_LIMITS: Record<string, Record<string, number>> = {
  'dyeC.mass': { warnBelow: 150, faultBelow: 60 },
  'conveyor.slip': { warnAbove: 5, faultAbove: 10 },
  'filling.mass': { warnBelow: 291, warnAbove: 309 },
  'check.mass': { warnBelow: 291, warnAbove: 309 },
  'color.deltaE': { warnAbove: 3, faultAbove: 6 },
  'cabinet.estop': { faultWhen: 1 },
};

/** The real machine.json plus TEST_LIMITS on a few sensors. */
export function rawMachineWithTestLimits(): MachineJson {
  const m = rawMachine();
  for (const [id, limits] of Object.entries(TEST_LIMITS)) sensor(m, id).limits = { ...limits };
  return m;
}

export function component(m: MachineJson, id: string): ComponentJson {
  const c = m.components.find((x) => x.id === id);
  if (!c) throw new Error(`fixture: no component ${id}`);
  return c;
}

export function sensor(m: MachineJson, id: string): SensorJson {
  for (const c of m.components) {
    const s = c.sensors.find((x) => x.id === id);
    if (s) return s;
  }
  throw new Error(`fixture: no sensor ${id}`);
}
