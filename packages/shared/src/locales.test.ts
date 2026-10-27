import { describe, expect, it } from 'vitest';

import { component, type MachineJson, rawLocales, rawMachine } from './__fixtures__/config.js';
import { formatIssues } from './issues.js';
import { checkLocales, componentName, type Locales, translate } from './locales.js';
import { machineSchema } from './machine.schema.js';

function localeIssues(m: MachineJson, locales: Locales = rawLocales()) {
  return checkLocales(machineSchema.parse(m), locales);
}

function expectIssue(
  breakIt: (m: MachineJson, locales: Locales) => void,
  path: string,
  message: RegExp,
) {
  const m = rawMachine();
  const locales = rawLocales();
  breakIt(m, locales);
  const issues = localeIssues(m, locales);
  expect(issues, formatIssues(issues)).toContainEqual({
    path,
    message: expect.stringMatching(message) as string,
  });
}

describe('translate', () => {
  it('translates the param key first, then fills the placeholder (doc 03)', () => {
    const { en, ar } = rawLocales();
    const tank = component(rawMachine(), 'dyeCTank');
    const params = tank.labelParams as Record<string, string>;
    expect(translate(en, tank.labelKey, params)).toBe('Cyan dye tank');
    expect(translate(ar, tank.labelKey, params)).toBe('خزان الصبغة السماوي');
  });

  it('returns undefined when a key or a param is missing', () => {
    expect(translate({ a: 'x {{color}}' }, 'a', { color: 'color.none' })).toBeUndefined();
    expect(translate({}, 'missing')).toBeUndefined();
  });

  it('names a component from machine.json', () => {
    const m = machineSchema.parse(rawMachine());
    const pump = m.components.find((c) => c.id === 'dyeKPump');
    expect(pump && componentName(rawLocales().en, pump)).toBe('Black dye pump');
  });
});

describe('locale rules', () => {
  it('finds no problem in the real machine.json and locale files', () => {
    expect(formatIssues(localeIssues(rawMachine()))).toBe('');
  });

  it('reports a key missing in Arabic', () => {
    expectIssue(
      (_m, locales) => {
        delete locales.ar['part.vessel'];
      },
      'locales.ar["part.vessel"]',
      /missing \(exists in en\)/,
    );
    expectIssue(
      (_m, locales) => {
        delete locales.ar['part.vessel'];
      },
      'components[vessel].labelKey',
      /"part\.vessel" is missing in ar\.json/,
    );
  });

  it('reports a value word missing in both languages', () => {
    expectIssue(
      (m) => {
        const s = component(m, 'checkPlatform').sensors.find((x) => x.id === 'check.decision');
        (s?.valueLabels as Record<string, string>)['2'] = 'value.rejected';
      },
      'components[checkPlatform].sensors[check.decision].valueLabels.2',
      /"value\.rejected" is missing in en\.json/,
    );
  });

  it('reports placeholders that differ between en and ar', () => {
    expectIssue(
      (_m, locales) => {
        locales.ar['part.dyeTank'] = 'خزان الصبغة';
      },
      'locales["part.dyeTank"]',
      /placeholders differ: en \{color\}, ar \{\}/,
    );
  });

  it('reports a missing label param', () => {
    expectIssue(
      (m) => {
        delete component(m, 'dyeCTank').labelParams;
      },
      'components[dyeCTank].labelParams',
      /needs param "color"/,
    );
  });

  it('reports a label param the text does not use', () => {
    expectIssue(
      (m) => {
        component(m, 'vessel').labelParams = { color: 'color.cyan' };
      },
      'components[vessel].labelParams.color',
      /has no \{\{color\}\}/,
    );
  });

  it('reports two parts with the same name on one page, in both languages', () => {
    const breakIt = (m: MachineJson) => {
      component(m, 'dyeMTank').labelParams = { color: 'color.cyan' };
    };
    expectIssue(
      breakIt,
      'components[dyeMTank]',
      /en name "Cyan dye tank" is also used by components\[dyeCTank\] on page mixingColor\/mixing/,
    );
    expectIssue(breakIt, 'components[dyeMTank]', /ar name "خزان الصبغة السماوي"/);
  });

  it('reports a part whose name clashes with a subsection on the section page', () => {
    expectIssue(
      (m) => {
        component(m, 'rollerDrive').labelKey = 'station.feeder';
      },
      'components[rollerDrive]',
      /en name "Feeder" is also used by sections\[conveyor\]\.subsections\[feeder\] on page conveyor/,
    );
  });

  it('reports two sensors with the same name in one values panel', () => {
    expectIssue(
      (m) => {
        const s = component(m, 'basePump').sensors.find((x) => x.id === 'basePump.current');
        if (s) s.labelKey = 'sensor.base_pump_on';
      },
      'components[basePump].sensors[basePump.current]',
      /on the values panel of basePump/,
    );
  });
});
