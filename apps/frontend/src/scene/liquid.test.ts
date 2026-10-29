import { type Machine, machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import { labToHex, liveLevel, liveMixColour } from './liquid';

const machine: Machine = machineSchema.parse(raw);
const reading = (value: number) => ({
  value,
  ts: '2026-10-29T10:00:00.000Z',
  receivedAt: '2026-10-29T10:00:00.000Z',
  source: 'sim' as const,
});
const liquidOf = (id: string) => {
  const g = machine.components.find((c) => c.id === id)?.geometry;
  if (g?.shape !== 'cylinder' || !g.liquid) throw new Error(`${id} holds no liquid`);
  return g.liquid;
};

describe('L*a*b* to screen colour (white D65)', () => {
  it.each([
    [[100, 0, 0], '#ffffff'],
    [[0, 0, 0], '#000000'],
    [[53.2408, 80.0925, 67.2032], '#ff0000'], // pure red
    [[87.737, -86.1846, 83.1812], '#00ff00'], // pure green
    [[32.297, 79.1875, -107.8602], '#0000ff'], // pure blue
    [[50, 0, 0], '#777777'], // mid grey
  ])('%j -> %s', ([l, a, b], hex) => {
    expect(labToHex(l ?? 0, a ?? 0, b ?? 0)).toBe(hex);
  });

  it('clips colours the screen cannot show', () => {
    expect(labToHex(50, 200, 200)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('live liquids', () => {
  it('the vessel level follows its mass sensor (doc 04: (v - min) / (max - min))', () => {
    const vessel = liquidOf('vessel');
    const max = vessel.levelSource?.max ?? 0;
    expect(liveLevel(vessel, { 'vessel.mass': reading(max / 2) })).toBeCloseTo(0.5);
    expect(liveLevel(vessel, { 'vessel.mass': reading(max * 2) })).toBe(1);
    expect(liveLevel(vessel, { 'vessel.mass': reading(-5) })).toBe(0);
  });

  it('without a reading, the level from machine.json stays', () => {
    expect(liveLevel(liquidOf('bigTank'), {})).toBe(liquidOf('bigTank').level);
  });

  it('the mix colour comes from the camera once L*, a* and b* have all arrived', () => {
    expect(
      liveMixColour(machine, { 'color.L': reading(53.2408), 'color.a': reading(80.0925) }),
    ).toBeUndefined();
    expect(
      liveMixColour(machine, {
        'color.L': reading(53.2408),
        'color.a': reading(80.0925),
        'color.b': reading(67.2032),
      }),
    ).toBe('#ff0000');
  });
});
