/** Pieces both chart kinds use: what they are given, the time axis and the readout. */
import type { Sensor } from '@mixline/shared';
import { useTranslation } from 'react-i18next';

import { formatClock } from '../live/format';
import { cx } from '../ui/cx';
import styles from './chart.module.css';
import { timeTicks } from './scale';
import type { Point } from './series';

export interface ChartProps {
  sensor: Sensor;
  /** The points for the window, with the one just before it (series.inWindow). */
  points: readonly Point[];
  from: number;
  to: number;
  /** The sensor's name and the window ("5 min"), for the spoken summary. */
  name: string;
  windowText: string;
}

/** Share of the window, as a CSS percentage: time runs left to right in both languages. */
export function at(time: number, from: number, to: number): string {
  return `${String(((time - from) / (to - from)) * 100)}%`;
}

/** HH:MM labels under the chart (the summary says the same, so screen readers skip them). */
export function TimeAxis({ from, to }: { from: number; to: number }) {
  return (
    <div className={styles.timeAxis} aria-hidden="true">
      {timeTicks(from, to).map((tick) => (
        <span key={tick} style={{ left: at(tick, from, to) }}>
          {formatClock(tick)}
        </span>
      ))}
    </div>
  );
}

/**
 * What the reader points at, over the chart on the side away from the
 * pointer. Always in the page, so screen readers announce each change.
 */
export function Readout({ text, pointerShare }: { text: string; pointerShare: number }) {
  const { i18n } = useTranslation();
  return (
    <p
      className={cx(styles.readout, pointerShare > 0.5 ? styles.readoutStart : styles.readoutEnd)}
      dir={i18n.dir()}
      aria-live="polite"
    >
      {text}
    </p>
  );
}
