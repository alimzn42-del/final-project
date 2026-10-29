/**
 * The line description (GET /api/machine, managers and workers), loaded once
 * for the line pages. The scene and the navigation are built from it.
 */
import type { Machine } from '@mixline/shared';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { api } from '../api/http';
import { useSession } from '../session/session';

export type MachineState =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; machine: Machine };

const MachineContext = createContext<MachineState | undefined>(undefined);

export function MachineProvider({ children }: { children: ReactNode }) {
  const { call } = useSession();
  const [state, setState] = useState<MachineState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    call(() => api<Machine>('GET', '/machine')).then(
      (machine) => {
        if (current) setState({ status: 'ready', machine });
      },
      () => {
        if (!current) return;
        setState({
          status: 'failed',
          retry: () => {
            setState({ status: 'loading' });
            setAttempt((n) => n + 1);
          },
        });
      },
    );
    return () => {
      current = false;
    };
  }, [call, attempt]);

  return <MachineContext value={state}>{children}</MachineContext>;
}

export function useMachine(): MachineState {
  const state = useContext(MachineContext);
  if (!state) throw new Error('useMachine() outside <MachineProvider>');
  return state;
}
