import { describe, expect, it } from 'vitest';

import { component, type MachineJson, rawMachine, sensor } from './__fixtures__/config.js';
import { formatIssues, type Issue, zodIssues } from './issues.js';
import { machineSchema } from './machine.schema.js';

/** Parses a (possibly broken) machine and returns readable issues. */
function shapeIssues(m: MachineJson): Issue[] {
  const result = machineSchema.safeParse(m);
  return result.success ? [] : zodIssues(result.error, m);
}

/** Breaks a copy of the real file and expects exactly this issue among the results. */
function expectIssue(breakIt: (m: MachineJson) => void, path: string, message: RegExp) {
  const m = rawMachine();
  breakIt(m);
  const issues = shapeIssues(m);
  expect(issues, formatIssues(issues)).toContainEqual({
    path,
    message: expect.stringMatching(message) as string,
  });
}

describe('machine.json schema', () => {
  it('accepts the real config/machine.json', () => {
    const issues = shapeIssues(rawMachine());
    expect(formatIssues(issues)).toBe('');
  });

  it('fills in the default anchor', () => {
    const m = rawMachine();
    delete component(m, 'vessel').anchor;
    const parsed = machineSchema.parse(m);
    expect(parsed.components.find((c) => c.id === 'vessel')?.anchor).toBe('bottom');
  });

  it('rejects an unknown or misspelled key', () => {
    expectIssue(
      (m) => {
        component(m, 'vessel').postion = [0, 0, 0];
      },
      'components[vessel]',
      /unrecognized key.*postion/i,
    );
  });

  it('rejects a bad color', () => {
    expectIssue(
      (m) => {
        component(m, 'cabinet').color = 'grey';
      },
      'components[cabinet].color',
      /#1A2B3C/,
    );
  });

  it('rejects a liquid with both colorRef and colorHex', () => {
    expectIssue(
      (m) => {
        const liquid = component(m, 'vessel').geometry.liquid as Record<string, unknown>;
        liquid.colorHex = '#FFFFFF';
      },
      'components[vessel].geometry.liquid',
      /invalid input/i,
    );
  });

  it('rejects a hollow box without wallThickness', () => {
    expectIssue(
      (m) => {
        delete component(m, 'cabinet').geometry.wallThickness;
      },
      'components[cabinet].geometry.wallThickness',
      /needs wallThickness/,
    );
  });

  it('rejects a rotated component with a bottom anchor', () => {
    expectIssue(
      (m) => {
        component(m, 'rollerDrive').anchor = 'bottom';
      },
      'components[rollerDrive].anchor',
      /rotated component must use anchor "center"/,
    );
  });

  it('rejects a station name that would break the MQTT topic', () => {
    expectIssue(
      (m) => {
        sensor(m, 'vessel.mass').station = 'mix/er';
      },
      'components[vessel].sensors[vessel.mass].station',
      /MQTT topic/,
    );
  });

  it('rejects a digital sensor whose unit is not "bool"', () => {
    expectIssue(
      (m) => {
        sensor(m, 'basePump.on').unit = 'A';
      },
      'components[basePump].sensors[basePump.on].unit',
      /digital sensor uses unit "bool"/,
    );
  });

  it('rejects an enum sensor with a code that has no label', () => {
    expectIssue(
      (m) => {
        const labels = sensor(m, 'check.decision').valueLabels as Record<string, string>;
        delete labels['2'];
      },
      'components[checkPlatform].sensors[check.decision].valueLabels',
      /code 2 has no label/,
    );
  });

  it('rejects a mass sensor that does not say it measures net liquid', () => {
    expectIssue(
      (m) => {
        delete sensor(m, 'vessel.mass').measures;
      },
      'components[vessel].sensors[vessel.mass].measures',
      /netLiquid/,
    );
  });

  it('rejects a nominal value outside the simulated range', () => {
    expectIssue(
      (m) => {
        (sensor(m, 'dyeC.mass').sim as Record<string, number>).nominal = 900;
      },
      'components[dyeCTank].sensors[dyeC.mass].sim.nominal',
      /between min and max/,
    );
  });

  it('rejects a fault limit that is milder than its warning limit (optional field, test values)', () => {
    expectIssue(
      (m) => {
        sensor(m, 'dyeC.mass').limits = { warnBelow: 150, faultBelow: 200 };
      },
      'components[dyeCTank].sensors[dyeC.mass].limits',
      /faultBelow must be below warnBelow/,
    );
  });

  it('rejects a wrong schema version', () => {
    expectIssue(
      (m) => {
        m.schemaVersion = 2;
      },
      'schemaVersion',
      /expected 1/i,
    );
  });
});
