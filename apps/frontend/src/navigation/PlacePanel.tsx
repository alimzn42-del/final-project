/**
 * The slim panel beside the 3D view (docs/06-brand.md "Layout"): what this
 * page leads to, each with its live state chip (step 14), so every page is
 * also reachable without the 3D view. On a part's page: its status, the box
 * it belongs to, the parts inside it, and its sensors.
 */
import type { Machine, MachineComponent, StateSnapshot } from '@mixline/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useLive } from '../live/live';
import { StateChip, stateOf } from '../live/StateChip';
import styles from './navigation.module.css';
import { pageLinks, partPlace, pathOf, type Place, placeFromPath, type Target } from './places';
import { useLabel } from './useLabel';

export function PlacePanel({ machine, place }: { machine: Machine; place: Place }) {
  const { t } = useTranslation();
  const { states } = useLive();
  const links = pageLinks(machine, place);
  if (place.level === 4) {
    return <PartPanel machine={machine} part={place.part} inside={links} states={states} />;
  }
  const heading =
    place.level === 1 ? 'nav.sections' : place.level === 2 ? 'nav.contents' : 'nav.parts';
  return (
    <aside className={styles.panel} aria-labelledby="place-panel">
      <div className={styles.panelHead}>
        <h2 id="place-panel" className={styles.panelTitle}>
          {t(heading)}
        </h2>
        <StateChip state={stateOf(states, place)} />
      </div>
      <LinkList machine={machine} links={links} states={states} />
    </aside>
  );
}

function LinkList({
  machine,
  links,
  states,
}: {
  machine: Machine;
  links: Target[];
  states: StateSnapshot | undefined;
}) {
  const label = useLabel();
  return (
    <ul className={styles.links}>
      {links.map((link) => {
        const place = placeFromPath(machine, link.path.replace(/^\/line\/?/, ''));
        return (
          <li key={link.path}>
            <Link to={link.path}>
              <span>{label(link)}</span>
              {place && <StateChip state={stateOf(states, place)} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PartPanel({
  machine,
  part,
  inside,
  states,
}: {
  machine: Machine;
  part: MachineComponent;
  inside: Target[];
  states: StateSnapshot | undefined;
}) {
  const { t } = useTranslation();
  const label = useLabel();
  const parent = machine.components.find((c) => c.id === part.parent);
  const parentPlace = parent && partPlace(machine, parent);
  return (
    <aside className={styles.panel} aria-labelledby="place-panel">
      <div className={styles.panelHead}>
        <h2 id="place-panel" className={styles.panelTitle}>
          {label(part)}
        </h2>
        <StateChip state={states?.components[part.id]} />
      </div>
      <dl className={styles.facts}>
        <dt>{t('nav.status')}</dt>
        <dd>{t(`status.${part.status}`)}</dd>
        {parent && parentPlace && (
          <>
            <dt>{t('nav.partOf')}</dt>
            <dd>
              <Link to={pathOf(parentPlace)}>{label(parent)}</Link>
            </dd>
          </>
        )}
      </dl>
      {inside.length > 0 && (
        <>
          <h3 className={styles.subTitle}>{t('nav.partsInside')}</h3>
          <LinkList machine={machine} links={inside} states={states} />
        </>
      )}
      <h3 className={styles.subTitle}>{t('nav.sensors')}</h3>
      {part.sensors.length === 0 ? (
        <p className={styles.muted}>{t('nav.noSensors')}</p>
      ) : (
        <>
          <ul className={styles.sensors}>
            {part.sensors.map((s) => (
              <li key={s.id}>
                <span>{t(s.labelKey)}</span>
                {s.unit && s.unit !== 'bool' && (
                  <span className={styles.unit} dir="ltr">
                    {s.unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>{t('nav.liveLater')}</p>
        </>
      )}
    </aside>
  );
}
