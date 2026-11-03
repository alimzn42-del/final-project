/**
 * An analog sensor's trend (plan step 14): a 2 px line in brand blue (blue is
 * the brand, never a state), three round value ticks, time labels under it,
 * and a dot on the latest value while the sensor is live. The line breaks
 * where data is missing. Time runs left to right in both languages, the
 * latest value at the right (owner, step 14).
 */
import { useTranslation } from 'react-i18next';

import { formatNumber, formatTime, shownValue, valueText } from '../live/format';
import styles from './chart.module.css';
import { useHoverTime } from './hover';
import { type ChartProps, Readout, TimeAxis } from './parts';
import { valueScale } from './scale';
import { HOLD_MS, nearest, type Point, runs, thin } from './series';

/** viewBox units across: about one per pixel column, and points are thinned to it. */
const WIDTH = 300;
const HEIGHT = 100;
/** Keeps the line clear of the top and bottom edges (6 px of the 4rem plot). */
const INSET = 9.375;

const num = (n: number) => n.toFixed(2);

/** A zero-length stroke with round caps draws a round dot that the plot's stretching does not distort. */
const dot = (x: number, y: number) => `M${num(x)},${num(y)}h0`;

export function LineChart({ sensor, points, from, to, name, windowText }: ChartProps) {
  const { t } = useTranslation();
  const hover = useHoverTime(from, to);
  const text = (v: number) => valueText(shownValue(sensor, v), t);
  const x = (time: number) => ((time - from) / (to - from)) * WIDTH;

  let lowest = Infinity;
  let highest = -Infinity;
  for (const p of points) {
    if (p.t < from) continue;
    lowest = Math.min(lowest, p.v);
    highest = Math.max(highest, p.v);
  }
  const empty = lowest > highest;
  const scale = valueScale(empty ? 0 : lowest, empty ? 0 : highest, sensor.decimals ?? 0);
  const y = (v: number) =>
    INSET + (1 - (v - scale.min) / (scale.max - scale.min)) * (HEIGHT - 2 * INSET);
  const path = (run: Point[]) => {
    const [first, ...rest] = thin(run, from, to, WIDTH);
    if (!first) return '';
    const start = `M${num(x(first.t))},${num(y(first.v))}`;
    return rest.length
      ? start + rest.map((p) => `L${num(x(p.t))},${num(y(p.v))}`).join('')
      : `${start}h0`;
  };

  const last = points.at(-1);
  const live = last && to - last.t <= HOLD_MS ? last : undefined;
  const pointed = hover.at === undefined ? undefined : nearest(points, hover.at);
  const near =
    pointed && hover.at !== undefined && Math.abs(pointed.t - hover.at) <= HOLD_MS
      ? pointed
      : undefined;
  let readout = '';
  if (near) readout = `${text(near.v)} ${t('live.at', { time: formatTime(near.t) })}`;
  else if (hover.at !== undefined) {
    readout = `${t('chart.gap')} ${t('live.at', { time: formatTime(hover.at) })}`;
  }
  const crosshair = near ? x(near.t) : hover.at === undefined ? undefined : x(hover.at);

  const summary = empty
    ? t('chart.emptySummary', { name, window: windowText })
    : t('chart.lineSummary', {
        name,
        window: windowText,
        min: text(lowest),
        max: text(highest),
      });

  return (
    <div className={styles.lineChart} dir="ltr">
      <div className={styles.valueAxis} aria-hidden="true">
        {!empty &&
          [...scale.ticks]
            .reverse()
            .map((tick) => <span key={tick}>{formatNumber(tick, scale.decimals)}</span>)}
      </div>
      <div className={styles.plotArea}>
        <div
          className={styles.plot}
          role="img"
          tabIndex={0}
          aria-label={summary}
          data-chart="line"
          {...hover.handlers}
        >
          <svg
            className={styles.svg}
            viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {!empty &&
              scale.ticks.map((tick) => (
                <line
                  key={tick}
                  className={styles.grid}
                  x1={0}
                  x2={WIDTH}
                  y1={y(tick)}
                  y2={y(tick)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            <path
              className={styles.line}
              d={runs(points).map(path).join('')}
              vectorEffect="non-scaling-stroke"
              data-line=""
            />
            {live && (
              <>
                <path
                  className={styles.dotRing}
                  d={dot(x(live.t), y(live.v))}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  className={styles.dot}
                  d={dot(x(live.t), y(live.v))}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {crosshair !== undefined && (
              <line
                className={styles.crosshair}
                x1={crosshair}
                x2={crosshair}
                y1={0}
                y2={HEIGHT}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {empty && <p className={styles.empty}>{t('chart.noData')}</p>}
        </div>
        <Readout text={readout} pointerShare={(crosshair ?? 0) / WIDTH} />
      </div>
      <TimeAxis from={from} to={to} />
    </div>
  );
}
