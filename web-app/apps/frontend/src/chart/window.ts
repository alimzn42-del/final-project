/**
 * How much time the charts show (plan step 14): 5, 15 or 60 minutes, 5 by
 * default. The choice is remembered in this browser, across parts and visits,
 * not in the account (owner, step 14).
 */
import { useCallback, useState } from 'react';

export const CHART_WINDOWS = [5, 15, 60] as const;
export type ChartWindow = (typeof CHART_WINDOWS)[number];
export const DEFAULT_WINDOW: ChartWindow = 5;

const KEY = 'mixline.chartWindow';

export function savedWindow(): ChartWindow {
  try {
    const saved = Number(localStorage.getItem(KEY));
    const known = CHART_WINDOWS.find((w) => w === saved);
    if (known) return known;
  } catch {
    // storage blocked (private window): use the default
  }
  return DEFAULT_WINDOW;
}

export function saveWindow(minutes: ChartWindow): void {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
}

/** The window in minutes, and how to change it (remembered at once). */
export function useChartWindow(): [ChartWindow, (minutes: ChartWindow) => void] {
  const [minutes, setMinutes] = useState(savedWindow);
  const choose = useCallback((next: ChartWindow) => {
    setMinutes(next);
    saveWindow(next);
  }, []);
  return [minutes, choose];
}
