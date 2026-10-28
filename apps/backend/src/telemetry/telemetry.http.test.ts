import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { BatchWriter } from './batch-writer.js';
import { TelemetryIngest } from './ingest.js';

describe('telemetry over HTTP', () => {
  let t: TestApp;
  let manager: string;
  let ingest: TelemetryIngest;
  let writer: BatchWriter;

  /** As if the broker delivered a message now. */
  const publish = (variable: string, body: object, receivedAt = Date.now()) =>
    ingest.handle(`lab/mixline/mixer/sensors/${variable}`, JSON.stringify(body), receivedAt);

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    ingest = t.app.get(TelemetryIngest);
    writer = t.app.get(BatchWriter);
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/telemetry/latest: the latest value of each sensor heard', async () => {
    const ts = new Date().toISOString();
    publish('mass', { ts, value: 1800.5, unit: 'g', source: 'sim' });
    publish('mixer_rpm', { ts, value: 180, unit: 'rpm', source: 'sim' });
    const r = await t.call('GET', '/telemetry/latest', undefined, manager);
    expect(r.status).toBe(200);
    const sensors = (r.body as { sensors: Record<string, { value: number }> }).sensors;
    expect(sensors['vessel.mass']?.value).toBe(1800.5);
    expect(sensors['mixer.rpm']?.value).toBe(180);
  });

  it('GET /api/telemetry/:sensorId: the last 5 minutes from stored readings', async () => {
    const now = Date.now();
    for (let i = 10; i >= 1; i--) {
      publish(
        'mass',
        { ts: new Date(now - i * 1000).toISOString(), value: 1000 + i, unit: 'g', source: 'sim' },
        now - i * 1000,
      );
    }
    // A reading from 10 minutes ago, outside the default window.
    publish(
      'mass',
      { ts: new Date(now - 600_000).toISOString(), value: 1, unit: 'g', source: 'sim' },
      now - 600_000,
    );
    await writer.flush();

    const r = await t.call('GET', '/telemetry/vessel.mass', undefined, manager);
    expect(r.status).toBe(200);
    const body = r.body as { resolution: string; points: { t: string; v: number }[] };
    expect(body.resolution).toBe('raw');
    const values = body.points.map((p) => p.v);
    expect(values).toContain(1010);
    expect(values).not.toContain(1);
    const times = body.points.map((p) => Date.parse(p.t));
    expect(times).toEqual([...times].sort((a, b) => a - b)); // in time order
  });

  it('a reading whose device clock is an hour off is charted at its received time', async () => {
    const received = Date.now() - 30_000;
    publish(
      'mass',
      { ts: new Date(received + 3_600_000).toISOString(), value: 4242, unit: 'g', source: 'hw' },
      received,
    );
    await writer.flush();
    const r = await t.call('GET', '/telemetry/vessel.mass', undefined, manager);
    const point = (r.body as { points: { t: string; v: number }[] }).points.find(
      (p) => p.v === 4242,
    );
    expect(point?.t).toBe(new Date(received).toISOString());
  });

  it('longer than 1 hour: the 1-minute summary', async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 3 * 3_600_000);
    const r = await t.call(
      'GET',
      `/telemetry/vessel.mass?from=${from.toISOString()}&to=${to.toISOString()}`,
      undefined,
      manager,
    );
    expect(r.status).toBe(200);
    const body = r.body as { resolution: string; points: { min: number; max: number }[] };
    expect(body.resolution).toBe('1m');
    expect(body.points.length).toBeGreaterThan(0);
    expect(body.points[0]).toHaveProperty('min');
  });

  it('refuses bad ranges and unknown sensors', async () => {
    const at = (q: string) => t.call('GET', `/telemetry/vessel.mass${q}`, undefined, manager);
    expect((await at('?from=2026-10-28T10:00:00Z&to=2026-10-28T09:00:00Z')).status).toBe(400);
    expect((await at('?from=2026-10-01T00:00:00Z&to=2026-10-28T00:00:00Z')).status).toBe(400); // > 7 days
    expect((await at('?from=yesterday')).status).toBe(400);
    expect((await at('?limit=5')).status).toBe(400);
    expect((await t.call('GET', '/telemetry/vessel.weight', undefined, manager)).status).toBe(404);
  });

  it('customers and anonymous visitors cannot read line data', async () => {
    const signup = await t.call('POST', '/auth/signup', {
      email: 'client@example.com',
      password: 'long enough',
      fullName: 'Client',
      mobile: '+963911111111',
      dateOfBirth: '1990-01-01',
      governorate: 'homs',
      cityArea: 'Inshaat',
    });
    expect((await t.call('GET', '/telemetry/latest', undefined, signup.cookie)).status).toBe(403);
    expect((await t.call('GET', '/telemetry/vessel.mass', undefined, signup.cookie)).status).toBe(
      403,
    );
    expect((await t.call('GET', '/telemetry/latest')).status).toBe(401);
  });
});
