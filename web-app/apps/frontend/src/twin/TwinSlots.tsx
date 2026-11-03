/**
 * Reserved places for the digital twin (doc 03 "Component page"; prediction,
 * health and remaining life are later phases, doc 01): a predicted value and
 * a residual for each sensor, a health index and a remaining useful life for
 * each part. Shown disabled now, so the layout does not change when they come.
 */
import { useTranslation } from 'react-i18next';

import styles from './twin.module.css';

const SENSOR_SLOTS = ['twin.predicted', 'twin.residual'];
const PART_SLOTS = ['twin.health', 'twin.rul'];

function Slots({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  return (
    <dl className={styles.slots}>
      {keys.map((key) => (
        <div key={key} className={styles.slot}>
          <dt>{t(key)}</dt>
          <dd>{t('ui.comingLater')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SensorTwin() {
  return <Slots keys={SENSOR_SLOTS} />;
}

export function PartTwin() {
  return <Slots keys={PART_SLOTS} />;
}
