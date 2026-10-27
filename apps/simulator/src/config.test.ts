import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the settings and fills defaults', () => {
    const config = loadConfig({ MQTT_USERNAME: 'mixline', MQTT_PASSWORD: 'secret' });
    expect(config.mqttUrl).toBe('mqtt://localhost:1883');
    expect(config.machineConfigPath.replaceAll('\\', '/')).toMatch(/\/config\/machine\.json$/);
  });

  it('names every missing or bad setting', () => {
    expect(() => loadConfig({ MQTT_URL: 'not a url' })).toThrow(
      /MQTT_URL[\s\S]*MQTT_USERNAME[\s\S]*MQTT_PASSWORD/,
    );
  });
});
