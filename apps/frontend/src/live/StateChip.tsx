/**
 * A state chip (docs/06-brand.md: state chips; doc 03 "State colors"): a dot in
 * the state's colour and its name. "none" (a part without sensors) shows nothing.
 * The chip pulses once when its state changes (none with reduced motion).
 */
import { type State, type StateSnapshot, subsectionKey } from '@mixline/shared';
import { useTranslation } from 'react-i18next';

import type { Place } from '../navigation/places';
import { cx } from '../ui/cx';
import styles from './StateChip.module.css';

export function StateChip({ state }: { state: State | undefined }) {
  const { t } = useTranslation();
  if (!state || state === 'none') return null;
  // A new key on each change replays the pulse animation.
  return (
    <span key={state} className={cx(styles.chip, styles[state])}>
      <span className={styles.dot} aria-hidden="true" />
      {t(`state.${state}`)}
    </span>
  );
}

/** The state of a page's subject: the line, a section, a sub-section or a part (rolled up by the backend). */
export function stateOf(states: StateSnapshot | undefined, place: Place): State | undefined {
  if (!states) return undefined;
  switch (place.level) {
    case 1:
      return states.line;
    case 2:
      return states.sections[place.section.id];
    case 3:
      return states.subsections[subsectionKey(place.section.id, place.subsection.id)];
    case 4:
      return states.components[place.part.id];
  }
}
