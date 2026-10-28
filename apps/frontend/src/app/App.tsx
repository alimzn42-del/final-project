/** The app's pages (docs/03-ui-spec.md "Suggested routes"). */
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router';

import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { LinePage } from '../pages/LinePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SignupPage } from '../pages/SignupPage';
import { useSession } from '../session/session';
import styles from './App.module.css';
import { Landing, RequireUser, VisitorsOnly } from './guards';
import { STAFF } from './landing';

export function App() {
  const { state, retry } = useSession();
  const { t } = useTranslation();

  if (state.status === 'loading') {
    return <p className={styles.status}>{t('ui.loading')}</p>;
  }
  if (state.status === 'unreachable') {
    return (
      <div className={styles.status} role="alert">
        <p>{t('ui.loadFailed')}</p>
        <button type="button" className={styles.retry} onClick={retry}>
          {t('ui.retry')}
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<VisitorsOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route element={<RequireUser />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>
      <Route element={<RequireUser roles={STAFF} />}>
        <Route path="/line/*" element={<LinePage />} />
        <Route path="/worker" element={<ComingSoonPage titleKey="page.worker" />} />
      </Route>
      <Route element={<RequireUser roles={['customer']} />}>
        <Route path="/customer" element={<ComingSoonPage titleKey="page.customer" />} />
      </Route>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
