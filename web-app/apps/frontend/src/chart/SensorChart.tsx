/**
 * A sensor's trend chart on its part's page (doc 03 "Component page", plan
 * step 14): a line for an analog sensor, a state timeline for a digital or
 * enum one, over the chosen window up to `now`. While the history reloads
 * (another window, a reconnect), the previous chart stays, dimmed.
 */
import type { Sensor } from '@mixline/shared';
import { useTranslation } from 'react-i18next';

import { cx } from '../ui/cx';
import styles from './chart.module.css';
import { LineChart } from './LineChart';
import { inWindow } from './series';
import { StateTimeline } from './StateTimeline';
import { useSeries } from './useSeries';
import type { ChartWindow } from './window';

export function SensorChart({
  sensor,
  minutes,
  now,
}: {
  sensor: Sensor;
  minutes: ChartWindow;
  /** The server's time now (ms): the chart's right edge. */
  now: number;
}) {
  const { t } = useTranslation();
  const windowMs = minutes * 60_000;
  const series = useSeries(sensor.id, windowMs);
  const from = now - windowMs;

  if (series.status === 'failed') {
    return (
      <div className={cx(styles.box, styles.message)} role="alert">
        <span>{t('chart.failed')}</span>
        <button type="button" className={styles.retry} onClick={series.retry}>
          {t('ui.retry')}
        </button>
      </div>
    );
  }
  // The first load: nothing to show yet.
  if (series.status === 'loading' && series.points.length === 0) {
    return <div className={cx(styles.box, styles.message)}>{t('ui.loading')}</div>;
  }

  const props = {
    sensor,
    points: inWindow(series.points, from, now),
    from,
    to: now,
    name: t(sensor.labelKey),
    windowText: t('chart.minutes', { count: minutes }),
  };
  const reloading = series.status === 'loading';
  return (
    <div className={cx(styles.chart, reloading && styles.reloading)} aria-busy={reloading}>
      {sensor.kind === 'analog' ? <LineChart {...props} /> : <StateTimeline {...props} />}
    </div>
  );
}
