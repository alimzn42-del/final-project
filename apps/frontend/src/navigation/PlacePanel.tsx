/**
 * The slim panel beside the 3D view (docs/06-brand.md "Layout"): what this
 * page leads to, so every page is also reachable without the 3D view. On a
 * part's page: its status, the box it belongs to, the parts inside it, and
 * its sensors (live values and charts arrive in step 14).
 */
import type { Machine, MachineComponent } from '@mixline/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './navigation.module.css';
import { pageLinks, partPlace, pathOf, type Place, type Target } from './places';
import { useLabel } from './useLabel';

export function PlacePanel({ machine, place }: { machine: Machine; place: Place }) {
  const { t } = useTranslation();
  const links = pageLinks(machine, place);
  if (place.level === 4) return <PartPanel machine={machine} part={place.part} inside={links} />;
  const heading =
    place.level === 1 ? 'nav.sections' : place.level === 2 ? 'nav.contents' : 'nav.parts';
  return (
    <aside className={styles.panel} aria-labelledby="place-panel">
      <h2 id="place-panel" className={styles.panelTitle}>
        {t(heading)}
      </h2>
      <LinkList links={links} />
    </aside>
  );
}

function LinkList({ links }: { links: Target[] }) {
  const label = useLabel();
  return (
    <ul className={styles.links}>
      {links.map((link) => (
        <li key={link.path}>
          <Link to={link.path}>{label(link)}</Link>
        </li>
      ))}
    </ul>
  );
}

function PartPanel({
  machine,
  part,
  inside,
}: {
  machine: Machine;
  part: MachineComponent;
  inside: Target[];
}) {
  const { t } = useTranslation();
  const label = useLabel();
  const parent = machine.components.find((c) => c.id === part.parent);
  const parentPlace = parent && partPlace(machine, parent);
  return (
    <aside className={styles.panel} aria-labelledby="place-panel">
      <h2 id="place-panel" className={styles.panelTitle}>
        {label(part)}
      </h2>
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
          <LinkList links={inside} />
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
