/**
 * TelemetryStore on TimescaleDB. Plain SQL: the telemetry table is not in the
 * generated Prisma client (a stream of readings has no unique key), and one
 * INSERT ... SELECT FROM unnest(...) writes a whole batch in one statement.
 */
import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  HistoryPoints,
  HistoryQuery,
  TelemetryRow,
  TelemetryStore,
} from './telemetry-store.js';

export class PrismaTelemetryStore implements TelemetryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(rows: readonly TelemetryRow[]): Promise<void> {
    if (rows.length === 0) return;
    // Arrays are sent as text and cast in SQL, so the driver never guesses types.
    const receivedAt = rows.map((r) => r.receivedAt.toISOString());
    const deviceTs = rows.map((r) => r.deviceTs.toISOString());
    const sensorIds = rows.map((r) => r.sensorId);
    const values = rows.map((r) => r.value);
    const sources = rows.map((r) => r.source);
    await this.prisma.$executeRaw`
      INSERT INTO telemetry (received_at, device_ts, sensor_id, value, source)
      SELECT * FROM unnest(
        ${receivedAt}::text[]::timestamptz[],
        ${deviceTs}::text[]::timestamptz[],
        ${sensorIds}::text[],
        ${values}::float8[],
        ${sources}::text[]::"Source"[]
      )`;
  }

  async history(q: HistoryQuery): Promise<HistoryPoints> {
    if (q.resolution === 'raw') {
      // Chart time per reading: device ts, or received_at when the device clock is off.
      // The window is on received_at, which the (sensor_id, received_at) index serves.
      const points = await this.prisma.$queryRaw<{ t: Date; v: number }[]>`
        SELECT
          CASE WHEN abs(extract(epoch FROM device_ts - received_at)) * 1000 > ${q.toleranceMs}
               THEN received_at ELSE device_ts END AS t,
          value AS v
        FROM telemetry
        WHERE sensor_id = ${q.sensorId} AND received_at >= ${q.from} AND received_at < ${q.to}
        ORDER BY t`;
      return { resolution: 'raw', points };
    }
    const points = await this.prisma.$queryRaw<
      { t: Date; min: number; max: number; avg: number }[]
    >`
      SELECT bucket AS t, min, max, avg
      FROM telemetry_1m
      WHERE sensor_id = ${q.sensorId} AND bucket >= ${q.from} AND bucket < ${q.to}
      ORDER BY bucket`;
    return { resolution: '1m', points };
  }
}
