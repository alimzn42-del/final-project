/**
 * TEST-ONLY telemetry store kept in memory, so the HTTP tests run without
 * Docker. It follows the same rules as the SQL store: raw points use the
 * chart time; the 1-minute summary buckets on the received time.
 * Excluded from the build (tsconfig.build.json).
 */
import { chartTime } from '@mixline/shared';

import type {
  HistoryPoints,
  HistoryQuery,
  TelemetryRow,
  TelemetryStore,
} from '../telemetry/telemetry-store.js';

export class MemoryTelemetryStore implements TelemetryStore {
  readonly rows: TelemetryRow[] = [];
  /** Set to make the next inserts fail, as if the database were down. */
  failInserts = false;

  insert(rows: readonly TelemetryRow[]): Promise<void> {
    if (this.failInserts) return Promise.reject(new Error('database is down'));
    this.rows.push(...rows);
    return Promise.resolve();
  }

  history(q: HistoryQuery): Promise<HistoryPoints> {
    const inWindow = this.rows.filter(
      (r) =>
        r.sensorId === q.sensorId &&
        r.receivedAt.getTime() >= q.from.getTime() &&
        r.receivedAt.getTime() < q.to.getTime(),
    );
    if (q.resolution === 'raw') {
      const points = inWindow
        .map((r) => ({
          t: new Date(chartTime(r.deviceTs.getTime(), r.receivedAt.getTime(), q.toleranceMs)),
          v: r.value,
        }))
        .sort((a, b) => a.t.getTime() - b.t.getTime());
      return Promise.resolve({ resolution: 'raw', points });
    }
    const buckets = new Map<number, number[]>();
    for (const r of inWindow) {
      const bucket = Math.floor(r.receivedAt.getTime() / 60_000) * 60_000;
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), r.value]);
    }
    const points = [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, values]) => ({
        t: new Date(t),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((s, v) => s + v, 0) / values.length,
      }));
    return Promise.resolve({ resolution: '1m', points });
  }
}
