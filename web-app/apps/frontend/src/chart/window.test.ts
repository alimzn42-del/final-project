/** The remembered time window (owner, step 14) and the timeline shades. */
import { machineSchema } from '@mixline/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import machineJson from '../../../../config/machine.json';
import { SHADES, shadeOf, valueCodes } from './shades';
import { savedWindow, saveWindow } from './window';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the time window', () => {
  it('is 5 minutes until one is chosen; the choice is kept in this browser', () => {
    expect(savedWindow()).toBe(5);
    saveWindow(15);
    expect(localStorage.getItem('mixline.chartWindow')).toBe('15');
    expect(savedWindow()).toBe(15);
  });

  it('a value that is not a window (edited by hand, an old version) falls back to 5', () => {
    localStorage.setItem('mixline.chartWindow', '7');
    expect(savedWindow()).toBe(5);
  });

  it('blocked storage (private window) does not break the page', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => {
      saveWindow(60);
    }).not.toThrow();
    expect(savedWindow()).toBe(5);
  });
});

describe('timeline shades', () => {
  const machine = machineSchema.parse(machineJson);
  const sensors = machine.components.flatMap((c) => c.sensors).filter((s) => s.kind !== 'analog');
  const byId = (id: string) => sensors.find((s) => s.id === id);

  it('code 0 is the faintest; each value keeps its own shade', () => {
    const pump = byId('basePump.on');
    const decision = byId('check.decision');
    if (!pump || !decision) throw new Error('sensors missing from machine.json');
    expect(valueCodes(pump)).toEqual([0, 1]);
    expect(valueCodes(decision).map((c) => shadeOf(valueCodes(decision), c))).toEqual([1, 2, 3]);
  });

  it('every digital and enum sensor in machine.json fits the shades (no two values share one)', () => {
    for (const s of sensors) expect(valueCodes(s).length, s.id).toBeLessThanOrEqual(SHADES);
  });
});
