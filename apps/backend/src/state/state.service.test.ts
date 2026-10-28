import { fileURLToPath } from 'node:url';

import { OFFLINE_AFTER_MS, type StateChanges } from '@mixline/shared';
import { loadMachineFile } from '@mixline/shared/node';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TelemetryIngest } from '../telemetry/ingest.js';
import { StateService } from './state.service.js';

const machine = loadMachineFile(
  fileURLToPath(new URL('../../../../config/machine.json', import.meta.url)),
);

function setup() {
  const ingest = new TelemetryIngest(machine, () => undefined, 2000, {
    warn: () => undefined,
    log: () => undefined,
  });
  const state = new StateService(machine, ingest);
  const now = Date.now();
  const publishMass = (at: number) =>
    ingest.handle(
      'lab/mixline/mixer/sensors/mass',
      JSON.stringify({ ts: new Date(at).toISOString(), value: 1800, unit: 'g', source: 'sim' }),
      at,
    );
  return { state, now, publishMass };
}

describe('StateService', () => {
  it('starts offline everywhere when no data has arrived; parts without sensors are none', () => {
    const { state } = setup();
    const snap = state.current();
    expect(snap.line).toBe('offline');
    expect(snap.sensors['vessel.mass']).toBe('offline');
    expect(snap.components.pedestal).toBe('none');
  });

  it('reports only what changed, and keeps the new snapshot', () => {
    const { state, now, publishMass } = setup();
    publishMass(now);
    const changes = state.update(now);
    expect(changes?.sensors).toEqual({ 'vessel.mass': 'ok' });
    expect(changes).not.toHaveProperty('line'); // other sensors are still offline
    expect(state.current().sensors['vessel.mass']).toBe('ok');
  });

  it('reports nothing and calls no listener when nothing changed', () => {
    const { state, now, publishMass } = setup();
    publishMass(now);
    state.update(now);
    const listener = vi.fn();
    state.onChange(listener);
    expect(state.update(now + 500)).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notices offline with time alone, with no new message', () => {
    const { state, now, publishMass } = setup();
    publishMass(now);
    state.update(now);
    expect(state.update(now + OFFLINE_AFTER_MS + 1)?.sensors).toEqual({
      'vessel.mass': 'offline',
    });
  });

  it('a failing listener does not stop the others; a stopped listener is not called', () => {
    const { state, now, publishMass } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const seen: StateChanges[] = [];
    state.onChange(() => {
      throw new Error('broken');
    });
    state.onChange((c) => seen.push(c));
    const stopped = vi.fn();
    state.onChange(stopped)();

    publishMass(now);
    state.update(now);
    expect(seen).toHaveLength(1);
    expect(stopped).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('state listener failed: Error: broken');
    warn.mockRestore();
  });
});
