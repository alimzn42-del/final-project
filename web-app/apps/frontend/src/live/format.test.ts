/** How live values read on screen (doc 03 "Number and unit display", plan step 14). */
import { machineSchema, type Sensor } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import machineJson from '../../../../config/machine.json';
import { displayUnit, formatNumber, formatTime, shownValue } from './format';

const machine = machineSchema.parse(machineJson);
function sensor(id: string): Sensor {
  const found = machine.components.flatMap((c) => c.sensors).find((s) => s.id === id);
  if (!found) throw new Error(`no sensor ${id} in machine.json`);
  return found;
}

describe('numbers', () => {
  it('always show the same number of decimals, so values do not jump', () => {
    expect(formatNumber(0.5, 2)).toBe('0.50');
    expect(formatNumber(1803, 1)).toBe('1803.0');
    expect(formatNumber(1.236, 2)).toBe('1.24');
    expect(formatNumber(7.6, 0)).toBe('8');
    expect(formatNumber(-12.34, 1)).toBe('-12.3');
  });

  it('have no thousands separator', () => {
    expect(formatNumber(12345.6, 1)).toBe('12345.6');
  });
});

describe('units', () => {
  it('are shown as machine.json spells them, with °C for C', () => {
    expect(displayUnit('g')).toBe('g');
    expect(displayUnit('steps/s')).toBe('steps/s');
    expect(displayUnit('C')).toBe('°C');
  });

  it('are hidden for counts, raw readings, unitless values and digital sensors', () => {
    for (const unit of ['count', 'raw', '', 'bool']) expect(displayUnit(unit)).toBeUndefined();
  });
});

describe('a sensor’s value', () => {
  it('analog: its own decimals and its unit', () => {
    expect(shownValue(sensor('basePump.current'), 0.5)).toEqual({
      kind: 'number',
      text: '0.50',
      unit: 'A',
    });
    expect(shownValue(sensor('vessel.mass'), 1803.04)).toEqual({
      kind: 'number',
      text: '1803.0',
      unit: 'g',
    });
    expect(shownValue(sensor('bigTank.volume'), 10.46)).toEqual({
      kind: 'number',
      text: '10.5',
      unit: 'L',
    });
    expect(shownValue(sensor('reject.count'), 12)).toEqual({
      kind: 'number',
      text: '12',
      unit: undefined,
    });
  });

  it('digital and enum: a word, never the code', () => {
    expect(shownValue(sensor('basePump.on'), 1)).toEqual({ kind: 'word', key: 'value.on' });
    expect(shownValue(sensor('basePump.on'), 0)).toEqual({ kind: 'word', key: 'value.off' });
    expect(shownValue(sensor('check.decision'), 2)).toEqual({ kind: 'word', key: 'value.reject' });
    expect(shownValue(sensor('samplePump.dir'), -1)).toEqual({
      kind: 'word',
      key: 'value.reverse',
    });
  });
});

describe('the time of a reading', () => {
  it('is HH:MM:SS on a 24-hour clock', () => {
    expect(formatTime('2026-10-29T15:04:05.000Z', 'UTC')).toBe('15:04:05');
    expect(formatTime('2026-10-29T00:00:09.900Z', 'UTC')).toBe('00:00:09');
  });

  it('is shown in the given time zone', () => {
    // Damascus is UTC+3 all year.
    expect(formatTime('2026-10-29T15:04:05.000Z', 'Asia/Damascus')).toBe('18:04:05');
  });
});
