import { machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import { MATERIAL_LOOKS, NOT_INSTALLED_OPACITY, partLook } from './looks';

const machine = machineSchema.parse(raw);
const part = (id: string) => {
  const c = machine.components.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

describe('a part not installed yet (owner, step 16)', () => {
  it('is dimmed, in its own colours: never the offline grey', () => {
    const pump = part('dyeKPump');
    const installed = partLook(pump);
    const missing = partLook({ ...pump, installed: false });
    expect(missing.opacity).toBeLessThanOrEqual(NOT_INSTALLED_OPACITY);
    expect(missing.opacity).toBeLessThan(installed.opacity);
    expect(missing.color).toBe(installed.color);
    expect(missing.color).toBe(pump.color ?? MATERIAL_LOOKS[pump.material].color);
  });
});
