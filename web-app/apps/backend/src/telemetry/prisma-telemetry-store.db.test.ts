/**
 * The real TimescaleDB (run with `pnpm test:db` after `pnpm infra:up`): batch
 * writes, raw history with the clock rule, and the real-time 1-minute summary.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { PrismaTelemetryStore } from './prisma-telemetry-store.js';
import type { TelemetryRow } from './telemetry-store.js';

let db: TestDatabase;
let prisma: PrismaService;
let store: PrismaTelemetryStore;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = new PrismaService(db.url);
  store = new PrismaTelemetryStore(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await db.drop();
});

const now = Date.now();
const row = (
  sensorId: string,
  value: number,
  receivedAt: number,
  deviceTs = receivedAt,
): TelemetryRow => ({
  receivedAt: new Date(receivedAt),
  deviceTs: new Date(deviceTs),
  sensorId,
  value,
  source: 'sim',
});

describe('PrismaTelemetryStore on TimescaleDB', () => {
  it('writes a batch of 1000 readings in one statement', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row('dyeC.mass', i, now - 120_000 + i * 10),
    );
    await store.insert(rows);
    const [count] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM telemetry WHERE sensor_id = 'dyeC.mass'`;
    expect(Number(count?.n)).toBe(1000);
  });

  it('raw history: chart time is the device time, or the received time past the tolerance', async () => {
    const t0 = now - 60_000;
    await store.insert([
      row('vessel.mass', 10, t0, t0 - 500), // within 2 s: device time
      row('vessel.mass', 20, t0 + 1000, t0 + 1000 + 3_600_000), // an hour ahead: received time
      row('vessel.mass', 30, now - 600_000), // outside the window below
    ]);
    const h = await store.history({
      sensorId: 'vessel.mass',
      from: new Date(now - 300_000),
      to: new Date(now),
      resolution: 'raw',
      toleranceMs: 2000,
    });
    if (h.resolution !== 'raw') throw new Error(`expected raw points, got ${h.resolution}`);
    expect(h.points.map((p) => [p.t.toISOString(), p.v])).toEqual([
      [new Date(t0 - 500).toISOString(), 10],
      [new Date(t0 + 1000).toISOString(), 20],
    ]);
  });

  it('1-minute summary includes the newest minutes (real-time), with min, max and average', async () => {
    const minute = Math.floor((now - 120_000) / 60_000) * 60_000;
    await store.insert([
      row('mixer.rpm', 100, minute + 1000),
      row('mixer.rpm', 200, minute + 2000),
      row('mixer.rpm', 300, minute + 3000),
    ]);
    const h = await store.history({
      sensorId: 'mixer.rpm',
      from: new Date(now - 2 * 3_600_000),
      to: new Date(now),
      resolution: '1m',
      toleranceMs: 2000,
    });
    expect(h.resolution).toBe('1m');
    expect(h.points).toContainEqual({ t: new Date(minute), min: 100, max: 300, avg: 200 });
  });
});
