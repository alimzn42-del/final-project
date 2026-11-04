/**
 * The values on a part's page (doc 03 "Component page", plan step 14): one row
 * per sensor with its latest value, unit, time and state, updating live, and
 * its trend chart. A value from the simulator is marked; an offline sensor
 * keeps its last value, dimmed; a sensor that has sent nothing yet says so.
 * One time window, above the rows, applies to every chart.
 */
import type { LatestReading, MachineComponent, Sensor, State } from '@mixline/shared';
import { useTranslation } from 'react-i18next';

import { useNow } from '../chart/clock';
import { SensorChart } from '../chart/SensorChart';
import { TimeWindowSwitch } from '../chart/TimeWindowSwitch';
import { type ChartWindow, useChartWindow } from '../chart/window';
import { SensorTwin } from '../twin/TwinSlots';
import { cx } from '../ui/cx';
import { formatTime, shownValue } from './format';
import { useLive } from './live';
import { StateChip } from './StateChip';
import styles from './SensorValues.module.css';

export function SensorValues({ part }: { part: MachineComponent }) {
  const { readings, states, clockOffset } = useLive();
  const [minutes, setMinutes] = useChartWindow();
  // The server's time, so a computer with a wrong clock still shows the latest value at the right.
  const now = useNow() + clockOffset;
  return (
    <>
      <TimeWindowSwitch value={minutes} onChange={setMinutes} />
      <ul className={styles.sensors}>
        {part.sensors.map((s) => (
          <SensorRow
            key={s.id}
            sensor={s}
            reading={readings[s.id]}
            state={states?.sensors[s.id]}
            minutes={minutes}
            now={now}
          />
        ))}
      </ul>
    </>
  );
}

function SensorRow({
  sensor,
  reading,
  state,
  minutes,
  now,
}: {
  sensor: Sensor;
  reading: LatestReading | undefined;
  state: State | undefined;
  minutes: ChartWindow;
  now: number;
}) {
  const { t } = useTranslation();
  // Sensor ids are unique in machine.json, so this id is unique on the page.
  const nameId = `sensor-${sensor.id}`;
  return (
    <li
      className={cx(styles.sensor, state === 'offline' && styles.offline)}
      aria-labelledby={nameId}
    >
      <div className={styles.head}>
        <span id={nameId}>{t(sensor.labelKey)}</span>
        <StateChip state={state} />
      </div>
      {reading ? (
        <Reading sensor={sensor} reading={reading} />
      ) : (
        <p className={styles.noData}>{t('live.noData')}</p>
      )}
      <SensorChart sensor={sensor} minutes={minutes} now={now} />
      <SensorTwin />
    </li>
  );
}

function Reading({ sensor, reading }: { sensor: Sensor; reading: LatestReading }) {
  const { t } = useTranslation();
  const shown = shownValue(sensor, reading.value);
  return (
    <p className={styles.reading}>
      {shown.kind === 'number' ? (
        // Left to right in Arabic too, so a minus sign and the unit stay in place.
        <span className={cx('numbers', styles.value)} dir="ltr">
          {shown.text}
          {shown.unit && <span className={styles.unit}>{` ${shown.unit}`}</span>}
        </span>
      ) : (
        <span className={styles.value}>{shown.key && t(shown.key)}</span>
      )}
      {reading.source === 'sim' && <span className={styles.sim}>{t('live.simulated')}</span>}
      <time className={styles.time} dateTime={reading.ts}>
        {t('live.at', { time: formatTime(reading.ts) })}
      </time>
    </p>
  );
}
