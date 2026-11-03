/**
 * One sensor's points for its chart (plan step 14): its history from
 * GET /api/telemetry/:sensorId, then every live reading added at the right.
 * The history is loaded again when the window changes and when the live
 * connection is back after a loss (the backend kept the readings meanwhile).
 * While it loads, the previous points stay, so the chart can show them dimmed.
 */
import type { HistoryResponse } from '@mixline/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api/http';
import { useLive } from '../live/live';
import { historySpan, type Point, pointsFrom, withNewer } from './series';

export type SeriesStatus = 'loading' | 'ready' | 'failed';

export interface Series {
  status: SeriesStatus;
  points: readonly Point[];
  retry: () => void;
}

interface Loaded {
  /** Which load these points belong to (see `key` below). */
  key: string;
  failed: boolean;
  points: readonly Point[];
}

export function useSeries(sensorId: string, windowMs: number): Series {
  const { subscribe, reconnects, clockOffset } = useLive();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ key: '', failed: false, points: [] });
  // A new load for another sensor or window, after a reconnect, or on "Try again".
  const key = [sensorId, windowMs, reconnects, attempt].join(' ');
  // Read when a load starts; a new offset alone (every batch) must not reload.
  const offset = useRef(clockOffset);
  useEffect(() => {
    offset.current = clockOffset;
  }, [clockOffset]);

  useEffect(() => {
    let active = true;
    // Readings that arrive while the history loads; undefined once it is in.
    let early: Point[] | undefined = [];
    const stop = subscribe((batch) => {
      const r = batch[sensorId];
      if (!r) return;
      const p = { t: Date.parse(r.ts), v: r.value };
      if (early) {
        early.push(p);
        return;
      }
      setLoaded((s) =>
        s.key === key ? { ...s, points: withNewer(s.points, [p], p.t - historySpan(windowMs)) } : s,
      );
    });

    const to = Date.now() + offset.current;
    const from = to - historySpan(windowMs);
    const query = new URLSearchParams({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    const path = `/telemetry/${encodeURIComponent(sensorId)}?${query.toString()}`;
    void api<HistoryResponse>('GET', path).then(
      (res) => {
        if (!active) return;
        const points = withNewer(pointsFrom(res), early ?? [], from);
        early = undefined;
        setLoaded({ key, failed: false, points });
      },
      () => {
        if (!active) return;
        early = undefined;
        setLoaded((s) => ({ key, failed: true, points: s.points }));
      },
    );

    return () => {
      active = false;
      stop();
    };
  }, [key, sensorId, windowMs, subscribe]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  const status: SeriesStatus = loaded.key !== key ? 'loading' : loaded.failed ? 'failed' : 'ready';
  return { status, points: loaded.points, retry };
}
