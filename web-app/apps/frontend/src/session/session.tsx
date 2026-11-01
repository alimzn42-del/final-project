/**
 * Who is logged in. The session itself is an httpOnly cookie the page cannot
 * read; the app only asks the backend (GET /api/auth/me) and keeps the answer.
 * Logout ends the session on the server too (owner, step 11).
 */
import type {
  ChangePasswordInput,
  Language,
  LoginInput,
  PublicUser,
  SignupInput,
  Theme,
} from '@mixline/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, ApiError } from '../api/http';

export type SessionState =
  | { status: 'loading' }
  /** The backend did not answer; the app offers to try again. */
  | { status: 'unreachable' }
  /** `ended`: the session ended while in use (401), so the login page says so. */
  | { status: 'out'; ended: boolean }
  | { status: 'in'; user: PublicUser };

export interface Session {
  state: SessionState;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  /** Saves the language and/or theme with the account. */
  savePreferences: (preferences: { locale?: Language; theme?: Theme | null }) => Promise<void>;
  /** Asks the backend again after it could not be reached. */
  retry: () => void;
  /** Runs an API call that needs the session; a 401 ends it (the login page says so). Stable. */
  call: <T>(request: () => Promise<T>) => Promise<T>;
  /**
   * Asks the backend again who is logged in (after the live connection was closed by the server:
   * a session that ended, a changed role or password). Stable.
   */
  refresh: () => void;
}

const SessionContext = createContext<Session | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    api<PublicUser>('GET', '/auth/me').then(
      (user) => {
        if (current) setState({ status: 'in', user });
      },
      (error: unknown) => {
        if (!current) return;
        const loggedOut = error instanceof ApiError && error.status === 401;
        setState(loggedOut ? { status: 'out', ended: false } : { status: 'unreachable' });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const refresh = useCallback(() => {
    api<PublicUser>('GET', '/auth/me').then(
      (user) => {
        setState({ status: 'in', user });
      },
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 401)
          setState({ status: 'out', ended: true });
      },
    );
  }, []);

  /** Runs a call that needs a session; a 401 means it ended elsewhere (logout, password change). */
  const withSession = useCallback(async <T,>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        setState({ status: 'out', ended: true });
      throw error;
    }
  }, []);

  const session: Session = {
    state,
    login: async (input) => {
      setState({ status: 'in', user: await api<PublicUser>('POST', '/auth/login', input) });
    },
    signup: async (input) => {
      setState({ status: 'in', user: await api<PublicUser>('POST', '/auth/signup', input) });
    },
    logout: async () => {
      try {
        await api('POST', '/auth/logout');
      } finally {
        setState({ status: 'out', ended: false });
      }
    },
    changePassword: (input) =>
      withSession(async () => {
        setState({
          status: 'in',
          user: await api<PublicUser>('POST', '/auth/change-password', input),
        });
      }),
    savePreferences: (preferences) =>
      withSession(async () => {
        setState({ status: 'in', user: await api<PublicUser>('PATCH', '/auth/me', preferences) });
      }),
    call: withSession,
    refresh,
    retry: () => {
      setState({ status: 'loading' });
      setAttempt((n) => n + 1);
    },
  };

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession() outside <SessionProvider>');
  return session;
}

/** The logged-in user (only inside pages that require one). */
export function useUser(): PublicUser {
  const { state } = useSession();
  if (state.status !== 'in') throw new Error('useUser() without a logged-in user');
  return state.user;
}
