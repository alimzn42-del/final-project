/** TEST-ONLY: a fake live connection; tests send it the server's events. */
import { vi } from 'vitest';

import type { Connect, LiveSocket } from '../live/live';

export interface FakeLive {
  connect: Connect;
  socket: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  /** As if the server sent `event`. */
  send: (event: string, ...args: unknown[]) => void;
  /** Connections opened so far. */
  opened: () => number;
}

export function fakeLive(): FakeLive {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  let opened = 0;
  const socket = {
    on: (event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, [
        ...(listeners.get(event) ?? []),
        listener as unknown as (...args: unknown[]) => void,
      ]);
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    connect: () => {
      opened++;
      return socket satisfies LiveSocket;
    },
    socket,
    send: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    opened: () => opened,
  };
}
