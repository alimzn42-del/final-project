import { describe, expect, it } from 'vitest';

import { component, rawLocales, rawMachine, sensor } from './__fixtures__/config.js';
import { formatIssues } from './issues.js';
import { parseMachineOrThrow, validateMachine } from './validate.js';

describe('validateMachine', () => {
  it('accepts the real machine.json with both locale files', () => {
    const result = validateMachine(rawMachine(), rawLocales());
    expect(result.ok ? '' : formatIssues(result.issues)).toBe('');
    expect(result.ok && result.machine.components.length).toBe(103);
  });

  it('reports problems from every rule set in one run', () => {
    const m = rawMachine();
    const locales = rawLocales();
    sensor(m, 'dyeM.mass').station = 'dye_c'; // duplicate MQTT topic
    component(m, 'camera').parent = 'nothing'; // broken reference
    delete locales.ar['part.camera']; // missing translation

    const result = validateMachine(m, locales);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        'components[dyeMTank].sensors[dyeM.mass]',
        'components[camera].parent',
        'locales.ar["part.camera"]',
        'components[camera].labelKey',
      ]),
    );
  });

  it('stops at shape errors, since cross-checks need a well-formed file', () => {
    const m = rawMachine();
    component(m, 'vessel').position = 'center';
    const result = validateMachine(m);
    expect(result.issues).toEqual([
      { path: 'components[vessel].position', message: expect.any(String) as string },
    ]);
  });

  it('rejects a locale file that is not a flat key -> text map', () => {
    const result = validateMachine(rawMachine(), { en: rawLocales().en, ar: { a: { b: 'c' } } });
    expect(result.issues[0]?.path).toBe('locales.ar.a');
  });

  it('throws one readable error listing every problem', () => {
    const m = rawMachine();
    sensor(m, 'dyeM.mass').station = 'dye_c';
    expect(() => parseMachineOrThrow(m)).toThrow(
      /machine\.json is invalid \(1 problem\(s\)\):\n- components\[dyeMTank\]\.sensors\[dyeM\.mass\]: MQTT topic/,
    );
  });
});
