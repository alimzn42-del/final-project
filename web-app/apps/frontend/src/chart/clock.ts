/**
 * The time now, for the charts' right edge, updated every second while a
 * chart is on screen: one timer for all of them. The window keeps sliding
 * when no data arrives, so a silent sensor shows as a growing gap.
 */
import { useSyncExternalStore } from 'react';

const TICK_MS = 1000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** This browser's clock (ms); add the live connection's clockOffset for the server's. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
