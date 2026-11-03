import type { LatestReading, StateSnapshot } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import {
  clockOffset,
  fromSnapshot,
  NO_DATA,
  simulatedCount,
  withReadings,
  withStates,
} from './liveData';

const reading = (value: number, source: 'sim' | 'hw' = 'sim'): LatestReading => ({
  value,
  ts: '2026-10-29T10:00:00.000Z',
  receivedAt: '2026-10-29T10:00:00.100Z',
  source,
});

const states: StateSnapshot = {
  line: 'ok',
  sections: { mixingColor: 'ok', conveyor: 'ok' },
  subsections: { 'mixingColor/color': 'ok' },
  components: { camera: 'ok', vessel: 'ok' },
  sensors: { 'color.L': 'ok', 'vessel.mass': 'ok' },
};

describe('live data', () => {
  it('a snapshot replaces everything', () => {
    const data = fromSnapshot({ readings: { 'vessel.mass': reading(1800) }, states });
    expect(data.readings['vessel.mass']?.value).toBe(1800);
    expect(data.states).toEqual(states);
  });

  it('a batch of readings updates only the sensors in it', () => {
    const data = withReadings(
      fromSnapshot({ readings: { a: reading(1), b: reading(2) }, states }),
      { b: reading(3) },
    );
    expect(data.readings.a?.value).toBe(1);
    expect(data.readings.b?.value).toBe(3);
  });

  it('state changes apply only what changed, at every level', () => {
    const data = withStates(fromSnapshot({ readings: {}, states }), {
      line: 'offline',
      components: { vessel: 'offline' },
      sensors: { 'vessel.mass': 'offline' },
    });
    expect(data.states?.line).toBe('offline');
    expect(data.states?.components).toEqual({ camera: 'ok', vessel: 'offline' });
    expect(data.states?.sections).toEqual(states.sections);
  });

  it('state changes before the first snapshot are ignored (the snapshot follows)', () => {
    expect(withStates(NO_DATA, { line: 'fault' })).toBe(NO_DATA);
  });

  it('the server clock’s lead over the browser’s, from the newest reading in a batch', () => {
    const browserNow = Date.parse('2026-10-29T10:00:00.000Z');
    const at = (receivedAt: string) => ({ ...reading(1), receivedAt });
    // The server is 30 s ahead of this computer.
    expect(
      clockOffset(
        { a: at('2026-10-29T10:00:29.000Z'), b: at('2026-10-29T10:00:30.000Z') },
        browserNow,
      ),
    ).toBe(30_000);
    expect(clockOffset({ a: at('2026-10-29T09:59:58.000Z') }, browserNow)).toBe(-2000);
    expect(clockOffset({}, browserNow)).toBeUndefined();
  });

  it('counts the sensors whose latest reading came from the simulator (owner, step 14)', () => {
    expect(simulatedCount({ a: reading(1), b: reading(2, 'hw'), c: reading(3) })).toBe(2);
    expect(simulatedCount({})).toBe(0);
  });
});
