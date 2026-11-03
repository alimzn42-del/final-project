/**
 * How a live value reads on screen (doc 03 "Number and unit display", plan
 * step 14): Western digits in both languages, each analog sensor's own
 * `decimals` so a number does not change width as it moves, no thousands
 * separator; digital and enum codes as words, never as numbers.
 */
import type { Sensor } from '@mixline/shared';

/** Units not shown: counts and raw readings need none, and "bool" only marks a digital sensor. */
const HIDDEN_UNITS = new Set(['', 'bool', 'count', 'raw']);

/** machine.json spells units in plain letters; a few read better with their symbol. */
const UNIT_SYMBOLS: Readonly<Record<string, string>> = { C: '°C' };

/** The unit beside a value, or undefined when none is shown. */
export function displayUnit(unit: string): string | undefined {
  if (HIDDEN_UNITS.has(unit)) return undefined;
  return UNIT_SYMBOLS[unit] ?? unit;
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** "en" in both languages: Arabic also uses Western digits (doc 03). */
export function formatNumber(value: number, decimals: number): string {
  let format = numberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    });
    numberFormats.set(decimals, format);
  }
  return format.format(value);
}

/** An analog value is a number with its unit; a digital or enum value is a word (an i18n key). */
export type ShownValue =
  | { kind: 'number'; text: string; unit: string | undefined }
  | { kind: 'word'; key: string | undefined };

export function shownValue(sensor: Sensor, value: number): ShownValue {
  if (sensor.kind === 'analog') {
    return {
      kind: 'number',
      text: formatNumber(value, sensor.decimals ?? 0),
      unit: displayUnit(sensor.unit),
    };
  }
  // The backend accepts only the codes in valueLabels, so the key is always found.
  return { kind: 'word', key: sensor.valueLabels?.[String(value)] };
}

/** A shown value as plain text, for summaries and readouts: "0.50 A", or the word. */
export function valueText(shown: ShownValue, translate: (key: string) => string): string {
  if (shown.kind === 'word') return shown.key ? translate(shown.key) : '';
  return shown.unit ? `${shown.text} ${shown.unit}` : shown.text;
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

function clock(at: string | number, seconds: boolean, timeZone: string | undefined): string {
  const id = `${String(seconds)} ${timeZone ?? ''}`;
  let format = timeFormats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      ...(seconds && { second: '2-digit' }),
      hourCycle: 'h23',
      ...(timeZone && { timeZone }),
    });
    timeFormats.set(id, format);
  }
  return format.format(new Date(at));
}

/**
 * The time of a reading (ISO text or ms) as HH:MM:SS (24-hour, Western
 * digits), in the browser's time zone unless one is given.
 */
export function formatTime(at: string | number, timeZone?: string): string {
  return clock(at, true, timeZone);
}

/** HH:MM, for the time axis of a chart. */
export function formatClock(at: string | number, timeZone?: string): string {
  return clock(at, false, timeZone);
}
