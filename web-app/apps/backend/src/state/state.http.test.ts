import type { Machine, StateSnapshot } from '@mixline/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MACHINE } from '../machine/machine.tokens.js';
import { TelemetryIngest } from '../telemetry/ingest.js';
import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';
import { StateService } from './state.service.js';

describe('GET /api/state', () => {
  let t: TestApp;
  let manager: string;

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
  });

  afterAll(async () => {
    await t.close();
  });

  it('gives staff the state of every sensor, part, sub-section, section and the line', async () => {
    const machine = t.app.get<Machine>(MACHINE);
    const ts = new Date().toISOString();
    t.app
      .get(TelemetryIngest)
      .handle(
        'lab/mixline/mixer/sensors/mass',
        JSON.stringify({ ts, value: 1800, unit: 'g', source: 'sim' }),
      );
    t.app.get(StateService).update();

    const r = await t.call('GET', '/state', undefined, manager);
    expect(r.status).toBe(200);
    const body = r.body as StateSnapshot;
    expect(body.sensors['vessel.mass']).toBe('ok');
    expect(body.sensors['mixer.rpm']).toBe('offline'); // nothing heard
    expect(body.line).toBe('offline');
    expect(Object.keys(body.sensors)).toHaveLength(
      machine.components.flatMap((c) => c.sensors).length,
    );
    expect(Object.keys(body.components)).toHaveLength(machine.components.length);
    expect(Object.keys(body.sections)).toHaveLength(machine.sections.length);
  });

  it('customers and anonymous visitors cannot read it', async () => {
    const signup = await t.call('POST', '/auth/signup', {
      email: 'client@example.com',
      password: 'long enough',
      fullName: 'Client',
      mobile: '+963911111111',
      dateOfBirth: '1990-01-01',
      governorate: 'homs',
      cityArea: 'Inshaat',
    });
    expect((await t.call('GET', '/state', undefined, signup.cookie)).status).toBe(403);
    expect((await t.call('GET', '/state')).status).toBe(401);
  });
});
