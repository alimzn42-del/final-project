import { describe, expect, it } from 'vitest';

import { MemoryTelemetryStore } from '../testing/memory-telemetry-store.js';
import { BatchWriter } from './batch-writer.js';
import type { TelemetryRow } from './telemetry-store.js';

const row = (i: number): TelemetryRow => ({
  receivedAt: new Date(i),
  deviceTs: new Date(i),
  sensorId: 'vessel.mass',
  value: i,
  source: 'sim',
});

function setup(options = { intervalMs: 60_000, maxBatch: 100, maxBuffered: 5 }) {
  const store = new MemoryTelemetryStore();
  const logs: string[] = [];
  const writer = new BatchWriter(
    store,
    { warn: (m) => logs.push(`warn: ${m}`), log: (m) => logs.push(`log: ${m}`) },
    options,
  );
  return { store, writer, logs };
}

describe('BatchWriter', () => {
  it('writes waiting readings in one batch', async () => {
    const { store, writer } = setup();
    [1, 2, 3].forEach((i) => {
      writer.add(row(i));
    });
    expect(store.rows).toHaveLength(0);
    await writer.flush();
    expect(store.rows.map((r) => r.value)).toEqual([1, 2, 3]);
    expect(writer.pending).toBe(0);
  });

  it('keeps readings while the database is down, and writes them when it is back', async () => {
    const { store, writer, logs } = setup();
    store.failInserts = true;
    writer.add(row(1));
    writer.add(row(2));
    await writer.flush();
    await writer.flush();
    expect(writer.pending).toBe(2);
    expect(logs.filter((l) => l.startsWith('warn: cannot write'))).toHaveLength(1); // once, not per try

    store.failInserts = false;
    writer.add(row(3));
    await writer.flush();
    expect(store.rows.map((r) => r.value)).toEqual([1, 2, 3]); // order kept
    expect(logs.at(-1)).toBe('log: telemetry writes resumed');
  });

  it('past the limit, drops the oldest readings with a warning', async () => {
    const { store, writer, logs } = setup();
    store.failInserts = true;
    for (let i = 1; i <= 7; i++) writer.add(row(i));
    expect(writer.pending).toBe(5);
    expect(logs.at(-1)).toMatch(/dropped the 2 oldest readings so far/);
    store.failInserts = false;
    await writer.flush();
    expect(store.rows.map((r) => r.value)).toEqual([3, 4, 5, 6, 7]);
  });

  it('writes at once when a batch is full, and on stop', async () => {
    const { store, writer } = setup({ intervalMs: 60_000, maxBatch: 3, maxBuffered: 100 });
    writer.start();
    [1, 2, 3].forEach((i) => {
      writer.add(row(i));
    });
    await writer.flush(); // waits for the write the third add started
    expect(store.rows).toHaveLength(3);
    writer.add(row(4));
    await writer.stop();
    expect(store.rows).toHaveLength(4);
  });
});
