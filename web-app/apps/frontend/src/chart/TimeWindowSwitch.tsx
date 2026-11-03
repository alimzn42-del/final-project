/**
 * The time window of every chart on the page (plan step 14): one control
 * above the sensors, so all charts cover the same time and can be compared.
 */
import { useTranslation } from 'react-i18next';

import styles from './chart.module.css';
import { CHART_WINDOWS, type ChartWindow } from './window';

export function TimeWindowSwitch({
  value,
  onChange,
}: {
  value: ChartWindow;
  onChange: (minutes: ChartWindow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.switch} role="group" aria-label={t('chart.window')}>
      {CHART_WINDOWS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          aria-pressed={minutes === value}
          onClick={() => {
            onChange(minutes);
          }}
        >
          {t('chart.minutes', { count: minutes })}
        </button>
      ))}
    </div>
  );
}
