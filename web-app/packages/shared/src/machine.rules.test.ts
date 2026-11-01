import { describe, expect, it } from 'vitest';

import { component, type MachineJson, rawMachine, sensor } from './__fixtures__/config.js';
import { formatIssues } from './issues.js';
import { checkMachineRules } from './machine.rules.js';
import { machineSchema } from './machine.schema.js';

function ruleIssues(m: MachineJson) {
  return checkMachineRules(machineSchema.parse(m));
}

function expectIssue(breakIt: (m: MachineJson) => void, path: string, message: RegExp) {
  const m = rawMachine();
  breakIt(m);
  const issues = ruleIssues(m);
  expect(issues, formatIssues(issues)).toContainEqual({
    path,
    message: expect.stringMatching(message) as string,
  });
}

describe('machine.json cross-reference rules', () => {
  it('finds no problem in the real config/machine.json', () => {
    expect(formatIssues(ruleIssues(rawMachine()))).toBe('');
  });

  it('rejects two sensors on the same MQTT topic', () => {
    expectIssue(
      (m) => {
        sensor(m, 'dyeM.mass').station = 'dye_c'; // dyeC.mass already has dye_c/mass
      },
      'components[dyeMTank].sensors[dyeM.mass]',
      /MQTT topic …\/dye_c\/sensors\/mass is already used by sensor dyeC\.mass/,
    );
  });

  it('rejects a duplicate component id', () => {
    expectIssue(
      (m) => {
        component(m, 'dyeMTank').id = 'dyeCTank';
      },
      'components[dyeCTank]',
      /duplicate component id/,
    );
  });

  it('rejects a duplicate sensor id', () => {
    expectIssue(
      (m) => {
        sensor(m, 'dyeM.mass').id = 'dyeC.mass';
      },
      'components[dyeMTank].sensors[dyeC.mass]',
      /duplicate sensor id \(also on dyeCTank\)/,
    );
  });

  it('rejects a parent that does not exist', () => {
    expectIssue(
      (m) => {
        component(m, 'camera').parent = 'colourBox';
      },
      'components[camera].parent',
      /unknown component "colourBox"/,
    );
  });

  it('rejects a parent on another page', () => {
    expectIssue(
      (m) => {
        component(m, 'camera').parent = 'vessel';
      },
      'components[camera].parent',
      /different section or subsection/,
    );
  });

  it('rejects a parent loop', () => {
    expectIssue(
      (m) => {
        component(m, 'colorBox').parent = 'camera'; // camera's parent is colorBox
      },
      'components[colorBox].parent',
      /loops back/,
    );
  });

  it('rejects a subsection that is not in the section', () => {
    expectIssue(
      (m) => {
        component(m, 'vessel').subsection = 'feeder';
      },
      'components[vessel].subsection',
      /section "mixingColor" has no subsection "feeder"/,
    );
  });

  it('rejects an unknown section', () => {
    expectIssue(
      (m) => {
        component(m, 'vessel').section = 'mixing';
      },
      'components[vessel].section',
      /unknown section "mixing"/,
    );
  });

  it('rejects a liquid level linked to a missing sensor', () => {
    expectIssue(
      (m) => {
        const liquid = component(m, 'vessel').geometry.liquid as {
          levelSource: { sensor: string };
        };
        liquid.levelSource.sensor = 'vessel.weight';
      },
      'components[vessel].geometry.liquid.levelSource.sensor',
      /unknown sensor "vessel\.weight"/,
    );
  });

  it('rejects a mix color source that is not analog', () => {
    expectIssue(
      (m) => {
        (m.liquids as { mix: { source: string[] } }).mix.source[0] = 'basePump.on';
      },
      'liquids.mix.source[0]',
      /not analog/,
    );
  });

  it('rejects the reserved subsection id "part"', () => {
    expectIssue(
      (m) => {
        const conveyor = m.sections.find((s) => s.id === 'conveyor');
        conveyor?.subsections.push({ id: 'part', labelKey: 'station.tray' });
      },
      'sections[conveyor].subsections[part]',
      /reserved/,
    );
  });
});
