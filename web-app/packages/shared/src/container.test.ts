import { describe, expect, it } from 'vitest';

import { rawMachine } from './__fixtures__/config.js';
import {
  brimVolume,
  containerFieldStatus,
  containerSpec,
  fillHeight,
  radiusAt,
  tubInside,
  volumeUpTo,
} from './container.js';
import { formatIssues, zodIssues } from './issues.js';
import { machineSchema } from './machine.schema.js';

const machine = machineSchema.parse(rawMachine());
const spec = containerSpec(machine.container);
const inside = tubInside(spec);

describe('the container (owner, step 17)', () => {
  it('keeps the measured sizes confirmed and the rest estimated', () => {
    expect(spec).toMatchObject({ baseDiameter: 79, topDiameter: 113, height: 77 });
    for (const field of ['baseDiameter', 'topDiameter', 'height', 'bodyMaterial'] as const) {
      expect(containerFieldStatus(machine.container, field)).toBe('confirmed');
    }
    for (const field of ['capacityMl', 'bodyG', 'lidG', 'rimOverhang', 'nestingStep'] as const) {
      expect(containerFieldStatus(machine.container, field)).toBe('estimated');
    }
  });

  it('holds about the estimated 500 ml up to the lid', () => {
    expect(brimVolume(inside)).toBeGreaterThan(spec.capacityMl * 0.95);
    expect(brimVolume(inside)).toBeLessThan(spec.capacityMl * 1.05);
  });

  it('is a frustum: a cylinder when both radii match', () => {
    const can = { bottomRadius: 10, topRadius: 10, height: 50, floor: 1 };
    expect(volumeUpTo(can, 20)).toBeCloseTo((Math.PI * 100 * 20) / 1000, 9);
    expect(radiusAt(inside, 0)).toBe(inside.bottomRadius);
    expect(radiusAt(inside, inside.height)).toBe(inside.topRadius);
  });

  it('finds how high a fill stands, the inverse of the volume', () => {
    const h = fillHeight(inside, 350);
    expect(volumeUpTo(inside, h)).toBeCloseTo(350, 6);
    // 350 ml stands about 57 mm high in the 77 mm tub, about 99 mm wide.
    expect(h).toBeGreaterThan(55);
    expect(h).toBeLessThan(59);
    expect(2 * radiusAt(inside, h)).toBeCloseTo(99, 0);
    expect(fillHeight(inside, 0)).toBe(0);
    expect(fillHeight(inside, 10_000)).toBe(inside.height);
  });
});

describe('the container in the schema', () => {
  const issues = (breakIt: (c: Record<string, Record<string, unknown>>) => void) => {
    const m = rawMachine();
    breakIt(m.container as Record<string, Record<string, unknown>>);
    const result = machineSchema.safeParse(m);
    return result.success ? '' : formatIssues(zodIssues(result.error, m));
  };

  it('needs every field once: in confirmed or in estimated', () => {
    expect(
      issues((c) => {
        c.confirmed = { ...c.confirmed, lidG: 6 };
      }),
    ).toMatch(/lidG is under both confirmed and estimated/);
    expect(
      issues((c) => {
        delete c.estimated?.bodyG;
      }),
    ).toMatch(/bodyG is missing: put it under confirmed or estimated/);
  });

  it('refuses a tub that is not wider at the top', () => {
    expect(
      issues((c) => {
        c.confirmed = { ...c.confirmed, topDiameter: 80 };
      }),
    ).toMatch(/wider at the top/);
  });
});
