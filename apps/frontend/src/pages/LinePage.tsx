/**
 * /line and below (plan steps 12 and 13): the line in 3D at four levels (doc 03
 * "Navigation"), one page per level, each with its own address, breadcrumbs in
 * the header and a list of what it leads to. The 3D code (three.js) is loaded
 * only here, so the login page stays small; without WebGL the list still works.
 */
import type { Machine } from '@mixline/shared';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

import { InHeader } from '../layout/headerSlot';
import { LiveProvider, useLive } from '../live/live';
import { MachineProvider, useMachine } from '../machine/machine';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { PlacePanel } from '../navigation/PlacePanel';
import { pageScene, placeFromPath } from '../navigation/places';
import sceneStyles from '../scene/scene.module.css';
import styles from './pages.module.css';

const LineScene = lazy(() => import('../scene/LineScene'));

/** WebGL is what draws the scene; very old browsers and test environments have none. */
function canShow3D(): boolean {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function LinePage() {
  return (
    <MachineProvider>
      <LiveProvider>
        <LineLoader />
      </LiveProvider>
    </MachineProvider>
  );
}

function LineLoader() {
  const { t } = useTranslation();
  const state = useMachine();
  if (state.status === 'ready') return <LineView machine={state.machine} />;
  return (
    <section className={styles.scenePage}>
      <InHeader>
        <h1 className={styles.headerTitle}>{t('page.line')}</h1>
      </InHeader>
      <div className={sceneStyles.viewport}>
        {state.status === 'loading' ? (
          <p className={sceneStyles.message}>{t('ui.loading')}</p>
        ) : (
          <div className={sceneStyles.message} role="alert">
            <p>{t('ui.loadFailed')}</p>
            <button type="button" className={styles.button} onClick={state.retry}>
              {t('ui.retry')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function LineView({ machine }: { machine: Machine }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rest = useParams()['*'] ?? '';
  const place = useMemo(() => placeFromPath(machine, rest), [machine, rest]);
  // One object per page, so the scene knows when the page changed (camera glide, hover reset).
  const page = useMemo(() => (place ? pageScene(machine, place) : undefined), [machine, place]);
  const show3D = useMemo(() => canShow3D(), []);
  const live = useLive();

  if (!place || !page) {
    return (
      <section className={styles.center}>
        <h1 className={styles.title}>{t('ui.pageNotFound')}</h1>
        <Link to="/line">{t('page.line')}</Link>
      </section>
    );
  }

  return (
    <section className={styles.scenePage}>
      <InHeader>
        <Breadcrumbs place={place} />
      </InHeader>
      {live.status === 'reconnecting' && (
        <p className={styles.notice} role="status">
          {t('live.reconnecting')}
        </p>
      )}
      <div className={styles.sceneLayout}>
        <div className={sceneStyles.viewport}>
          {show3D ? (
            <Suspense fallback={<p className={sceneStyles.message}>{t('ui.loading')}</p>}>
              <LineScene
                machine={machine}
                page={page}
                overview={place.level === 1}
                // Tags on every pending part only from the sub-section down: higher up they overlap.
                allTags={place.level >= 3}
                onNavigate={(path) => {
                  void navigate(path);
                }}
              />
            </Suspense>
          ) : (
            <p className={sceneStyles.message}>{t('scene.noWebgl')}</p>
          )}
        </div>
        <PlacePanel machine={machine} place={place} />
      </div>
    </section>
  );
}
