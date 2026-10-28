/** Line › section › sub-section › part (doc 03: breadcrumbs on every page); the last is the page title. */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import styles from './navigation.module.css';
import { breadcrumbs, type Place } from './places';
import { useLabel } from './useLabel';

export function Breadcrumbs({ place }: { place: Place }) {
  const { t } = useTranslation();
  const label = useLabel();
  const crumbs = breadcrumbs(place);
  return (
    <nav aria-label={t('nav.breadcrumbs')} className={styles.crumbs}>
      <ol className={styles.trail}>
        {crumbs.map((crumb, i) =>
          i < crumbs.length - 1 ? (
            <li key={crumb.path} className={styles.crumb}>
              <Link to={crumb.path}>{label(crumb)}</Link>
            </li>
          ) : (
            <li key={crumb.path} className={styles.crumb} aria-current="page">
              <h1 className={styles.current}>{label(crumb)}</h1>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
