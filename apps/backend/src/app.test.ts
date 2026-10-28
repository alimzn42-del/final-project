import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { startTestApp, TEST_ENV, type TestApp } from './testing/http.js';
import { MemoryUserStore } from './testing/memory-user-store.js';

const configDir = fileURLToPath(new URL('../../../config/', import.meta.url));

describe('backend HTTP API: machine, locales, health', () => {
  let t: TestApp;
  let manager: string;

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/health answers ok, without a login', async () => {
    const r = await t.call('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  it('GET /api/machine returns the validated machine.json to staff', async () => {
    const r = await t.call('GET', '/machine', undefined, manager);
    expect(r.status).toBe(200);
    const body = r.body as { site: string; components: { anchor: string }[] };
    expect(body.site).toBe('lab');
    expect(body.components).toHaveLength(103);
    // Parsed, not just the raw file: defaults such as anchor are filled in.
    expect(body.components.every((c) => c.anchor === 'bottom' || c.anchor === 'center')).toBe(true);
  });

  it('GET /api/locales/en and /ar return the locale files, without a login', async () => {
    const en = (await t.call('GET', '/locales/en')).body as Record<string, string>;
    const ar = (await t.call('GET', '/locales/ar')).body;
    const rawAr = JSON.parse(readFileSync(join(configDir, 'locales/ar.json'), 'utf8')) as object;
    expect(en['part.vessel']).toBe('Mixing vessel');
    expect(ar).toEqual(rawAr);
  });

  it('answers 404 for an unknown language and an unknown route', async () => {
    expect((await t.call('GET', '/locales/fr')).status).toBe(404);
    expect((await t.call('GET', '/nothing', undefined, manager)).status).toBe(404);
  });
});

describe('startup checks', () => {
  const store = () => ({ userStore: new MemoryUserStore(), logs: false });

  it('refuses to start with a broken machine.json, listing every problem', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixline-backend-'));
    const m = JSON.parse(readFileSync(join(configDir, 'machine.json'), 'utf8')) as {
      components: { id: string; parent?: string; sensors: { id: string; station: string }[] }[];
    };
    const tank = m.components.find((c) => c.id === 'dyeMTank');
    const camera = m.components.find((c) => c.id === 'camera');
    if (!tank?.sensors[0] || !camera) throw new Error('fixture');
    tank.sensors[0].station = 'dye_c';
    camera.parent = 'nothing';
    writeFileSync(join(dir, 'machine.json'), JSON.stringify(m));

    await expect(
      createApp(
        {
          ...TEST_ENV,
          MACHINE_CONFIG: join(dir, 'machine.json'),
          LOCALES_DIR: join(configDir, 'locales'),
        },
        store(),
      ),
    ).rejects.toThrow(
      /2 problem\(s\)[\s\S]*dye_c\/sensors\/mass[\s\S]*unknown component "nothing"/,
    );
  });

  it('refuses a missing locale folder', async () => {
    await expect(
      createApp({ ...TEST_ENV, LOCALES_DIR: join(configDir, 'nope') }, store()),
    ).rejects.toThrow(/cannot read .*en\.json/);
  });

  it('refuses to start without database settings when no store is given', async () => {
    await expect(createApp(TEST_ENV, { logs: false })).rejects.toThrow(
      /database settings are missing/,
    );
  });

  it('checks the settings', () => {
    expect(loadConfig(TEST_ENV).port).toBe(3000);
    expect(loadConfig({ ...TEST_ENV, PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ ...TEST_ENV, PORT: 'eighty' })).toThrow(
      /backend settings are invalid[\s\S]*PORT/,
    );
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...TEST_ENV, JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => loadConfig({ JWT_SECRET: TEST_ENV.JWT_SECRET, MANAGER_EMAIL: 'a@b.co' })).toThrow(
      /MANAGER_EMAIL and MANAGER_PASSWORD together/,
    );
  });

  it('builds the database address from the POSTGRES_* values', () => {
    const c = loadConfig({
      ...TEST_ENV,
      POSTGRES_USER: 'mixline',
      POSTGRES_PASSWORD: 'p@ss/word',
      POSTGRES_DB: 'mixline',
      POSTGRES_HOST: 'db',
    });
    expect(c.databaseUrl).toBe('postgresql://mixline:p%40ss%2Fword@db:5432/mixline');
    expect(loadConfig(TEST_ENV).databaseUrl).toBeUndefined();
  });
});
