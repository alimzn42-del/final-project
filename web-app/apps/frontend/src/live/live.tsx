/**
 * The live connection (socket.io at LIVE_PATH, plan steps 10 and 14), open
 * while a line page is on screen. socket.io reconnects by itself after a
 * network loss; when the server refuses or closes the connection (session
 * ended, role or password changed), the app asks who is logged in now, so the
 * user lands on the right page; when the backend could not check the login,
 * it tries again a little later.
 */
import {
  LIVE_PATH,
  LIVE_REFUSALS,
  type LiveReadings,
  type LiveSnapshot,
  type LiveStates,
} from '@mixline/shared';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

import { useSession } from '../session/session';
import { fromSnapshot, type LiveData, NO_DATA, withReadings, withStates } from './liveData';

/** Wait before trying again when the server could not check the login. */
const RETRY_MS = 5000;

/** What the app needs from a socket.io connection (tests pass a fake one). */
export interface LiveSocket {
  on: (event: string, listener: (...args: never[]) => void) => unknown;
  connect: () => unknown;
  disconnect: () => unknown;
}

export type Connect = () => LiveSocket;

// The page's own address, so the session cookie goes along (nginx, or the Vite proxy).
const connectToServer: Connect = () => io({ path: LIVE_PATH }) as unknown as LiveSocket;

/** How the app connects; tests replace it with a fake connection. */
export const LiveConnectContext = createContext<Connect>(connectToServer);

/** connecting: no data yet; live: up to date; reconnecting: values may be old. */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

export interface Live extends LiveData {
  status: LiveStatus;
}

const LiveContext = createContext<Live>({ ...NO_DATA, status: 'connecting' });

export function LiveProvider({ children }: { children: ReactNode }) {
  const connect = useContext(LiveConnectContext);
  const { refresh } = useSession();
  const [data, setData] = useState<LiveData>(NO_DATA);
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    const socket = connect();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const tryAgainLater = () => {
      clearTimeout(retry);
      retry = setTimeout(() => socket.connect(), RETRY_MS);
    };

    socket.on('snapshot', (snapshot: LiveSnapshot) => {
      setData(fromSnapshot(snapshot));
      setStatus('live');
    });
    socket.on('readings', (batch: LiveReadings) => {
      setData((d) => withReadings(d, batch));
    });
    socket.on('states', (changes: LiveStates) => {
      setData((d) => withStates(d, changes));
    });
    socket.on('disconnect', (reason: string) => {
      setStatus('reconnecting');
      // Closed by the server (the minute's re-check, a logout elsewhere): who is logged in now?
      if (reason === 'io server disconnect') {
        refresh();
        tryAgainLater();
      }
    });
    socket.on('connect_error', (error: Error) => {
      setStatus('reconnecting');
      // Any other error is a network problem: socket.io keeps trying by itself.
      if (!Object.values<string>(LIVE_REFUSALS).includes(error.message)) return;
      // A refusal is final for socket.io: try again later ourselves. Leaving the page (logged
      // out, or sent elsewhere by the guards) cancels it.
      if (error.message !== LIVE_REFUSALS.unavailable) refresh();
      tryAgainLater();
    });

    return () => {
      clearTimeout(retry);
      socket.disconnect();
    };
  }, [connect, refresh]);

  return <LiveContext value={{ ...data, status }}>{children}</LiveContext>;
}

export function useLive(): Live {
  return useContext(LiveContext);
}
