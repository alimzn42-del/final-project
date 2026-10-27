import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';

const configDir = fileURLToPath(new URL('../../../config/', import.meta.url));

describe('backend HTTP API', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    ({ app } = await createApp({}));
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health answers ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/machine returns the validated machine.json', async () => {
    const res = await fetch(`${base}/machine`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      site: string;
      components: { id: string; anchor: string }[];
    };
    expect(body.site).toBe('lab');
    expect(body.components).toHaveLength(103);
    // Parsed, not just the raw file: defaults such as anchor are filled in.
    expect(body.components.every((c) => c.anchor === 'bottom' || c.anchor === 'center')).toBe(true);
  });

  it('GET /api/locales/en and /ar return the locale files', async () => {
    const en = (await (await fetch(`${base}/locales/en`)).json()) as Record<string, string>;
    const ar = (await (await fetch(`${base}/locales/ar`)).json()) as Record<string, string>;
    const rawAr = JSON.parse(readFileSync(join(configDir, 'locales/ar.json'), 'utf8')) as object;
    expect(en['part.vessel']).toBe('Mixing vessel');
    expect(ar).toEqual(rawAr);
  });

  it('answers 404 for an unknown language and an unknown route', async () => {
    expect((await fetch(`${base}/locales/fr`)).status).toBe(404);
    expect((await fetch(`${base}/nothing`)).status).toBe(404);
    expect((await fetch(`${base.replace('/api', '')}/machine`)).status).toBe(404); // no /api prefix
  });
});

describe('startup checks', () => {
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
      createApp({
        MACHINE_CONFIG: join(dir, 'machine.json'),
        LOCALES_DIR: join(configDir, 'locales'),
      }),
    ).rejects.toThrow(
      /2 problem\(s\)[\s\S]*dye_c\/sensors\/mass[\s\S]*unknown component "nothing"/,
    );
  });

  it('refuses a missing locale folder', async () => {
    await expect(createApp({ LOCALES_DIR: join(configDir, 'nope') })).rejects.toThrow(
      /cannot read .*en\.json/,
    );
  });

  it('checks the settings', () => {
    expect(loadConfig({}).port).toBe(3000);
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/backend settings are invalid[\s\S]*PORT/);
  });
});
