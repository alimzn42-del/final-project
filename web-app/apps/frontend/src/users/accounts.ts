/**
 * The users page's data (owner, step 16): the staff accounts and the departments, loaded together
 * and loaded again after every change, so the page always shows what the backend has. Every call
 * goes through the session, so a session that ended (for example a manager gave this manager a
 * new temporary password) sends the user to the login page.
 */
import { ACCOUNT_CODES, type Department, type StaffMember } from '@mixline/shared';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../api/http';
import { useSession } from '../session/session';

export interface Accounts {
  status: 'loading' | 'failed' | 'ready';
  staff: StaffMember[];
  departments: Department[];
  /** Loads both lists again. */
  reload: () => void;
}

export function useAccounts(): Accounts {
  const { call } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Omit<Accounts, 'reload'>>({
    status: 'loading',
    staff: [],
    departments: [],
  });

  useEffect(() => {
    let current = true;
    call(() =>
      Promise.all([api<StaffMember[]>('GET', '/users'), api<Department[]>('GET', '/departments')]),
    ).then(
      ([staff, departments]) => {
        if (current) setLoaded({ status: 'ready', staff, departments });
      },
      () => {
        // Keep what is on screen; say the lists could not be loaded.
        if (current) setLoaded((old) => ({ ...old, status: 'failed' }));
      },
    );
    return () => {
      current = false;
    };
  }, [call, attempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return { ...loaded, reload };
}

/** A department's name in the page's language. */
export const departmentName = (d: Department | undefined, language: string) =>
  d ? (language === 'ar' ? d.nameAr : d.nameEn) : '';

/** Why an action failed, as a label key (the backend's code first, then the status). */
export function problemKey(error: unknown): string {
  if (!(error instanceof ApiError)) return 'error.server';
  const code = (error.body as { code?: unknown } | undefined)?.code;
  if (code === ACCOUNT_CODES.cannotDisableSelf) return 'users.cannotDisableSelf';
  if (code === ACCOUNT_CODES.lastActiveManager) return 'users.lastManager';
  if (error.status === 404) return 'users.gone';
  if (error.status === 0) return 'error.network';
  return 'error.server';
}

/** The number of workers in a department that could not be deleted (409), if that was why. */
export function workersBlocking(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const body = error.body as { code?: unknown; workers?: unknown } | undefined;
  return body?.code === 'DEPARTMENT_HAS_WORKERS' && typeof body.workers === 'number'
    ? body.workers
    : undefined;
}
