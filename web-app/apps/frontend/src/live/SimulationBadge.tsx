/**
 * The SIMULATION badge in the header (doc 03 "Simulated data", plan step 14):
 * shown while at least one sensor's latest reading came from the simulator,
 * with how many, out of every sensor of the line. It stays when the simulator
 * stops: the values on screen are still the simulated ones. Violet, a colour
 * used nowhere else in the app (owner, step 14, docs/06-brand.md).
 */
import { useTranslation } from 'react-i18next';

import { InHeader } from '../layout/headerSlot';
import { useLive } from './live';
import { simulatedCount } from './liveData';
import styles from './SimulationBadge.module.css';

export function SimulationBadge({ total }: { total: number }) {
  const { t } = useTranslation();
  const { readings } = useLive();
  const simulated = simulatedCount(readings);
  if (simulated === 0) return null;
  return (
    <InHeader place="status">
      <span className={styles.badge}>
        <span className={styles.word}>{t('ui.simulation')}</span>
        {/* Phones show "12/60"; screen readers always get the full count. */}
        <span className={styles.full}>{t('live.simulatedCount', { simulated, count: total })}</span>
        <span className={styles.short} dir="ltr" aria-hidden="true">
          {`${String(simulated)}/${String(total)}`}
        </span>
      </span>
    </InHeader>
  );
}
