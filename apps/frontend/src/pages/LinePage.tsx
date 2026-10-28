/**
 * /line: the line in 3D (plan step 12). The 3D code (three.js) is loaded only
 * here, so the login page stays small. Devices without WebGL get a message.
 */
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { MachineProvider, useMachine } from '../machine/machine';
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
  const { t } = useTranslation();
  return (
    <MachineProvider>
      <section className={styles.scenePage}>
        <h1 className={styles.title}>{t('page.line')}</h1>
        <div className={sceneStyles.viewport}>
          <LineView />
        </div>
      </section>
    </MachineProvider>
  );
}

function LineView() {
  const { t } = useTranslation();
  const state = useMachine();
  if (state.status === 'loading') return <p className={sceneStyles.message}>{t('ui.loading')}</p>;
  if (state.status === 'failed') {
    return (
      <div className={sceneStyles.message} role="alert">
        <p>{t('ui.loadFailed')}</p>
        <button type="button" className={styles.button} onClick={state.retry}>
          {t('ui.retry')}
        </button>
      </div>
    );
  }
  if (!canShow3D()) return <p className={sceneStyles.message}>{t('scene.noWebgl')}</p>;
  return (
    <Suspense fallback={<p className={sceneStyles.message}>{t('ui.loading')}</p>}>
      <LineScene machine={state.machine} />
    </Suspense>
  );
}
