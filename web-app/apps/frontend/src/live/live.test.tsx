/** The live connection against a fake server: data, reconnects, refusals (plan step 14). */
import type { StateSnapshot } from '@mixline/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../config/locales/en.json';
import { AppProviders } from '../app/AppProviders';
import { createI18n, switchLanguage } from '../i18n/i18n';
import { fakeApi, USERS } from '../test/app';
import { type FakeLive, fakeLive } from '../test/fakeLive';
import { LiveConnectContext, LiveProvider, useLive } from './live';

const states: StateSnapshot = {
  line: 'ok',
  sections: {},
  subsections: {},
  components: { vessel: 'ok' },
  sensors: { 'vessel.mass': 'ok' },
};
const reading = (value: number) => ({
  value,
  ts: '2026-10-29T10:00:00.000Z',
  receivedAt: '2026-10-29T10:00:00.000Z',
  source: 'sim' as const,
});

function Probe() {
  const live = useLive();
  return (
    <output data-testid="live">
      {`${live.status} ${String(live.readings['vessel.mass']?.value ?? '-')} ${live.states?.components.vessel ?? '-'}`}
    </output>
  );
}

async function renderLive(live: FakeLive) {
  const api = fakeApi({ 'GET /api/auth/me': { status: 200, body: USERS.manager } });
  const i18n = await createI18n();
  await switchLanguage(i18n, 'en', () => Promise.resolve(en));
  const view = render(
    <AppProviders i18n={i18n}>
      <LiveConnectContext value={live.connect}>
        <LiveProvider>
          <Probe />
        </LiveProvider>
      </LiveConnectContext>
    </AppProviders>,
  );
  const shown = () => screen.getByTestId('live').textContent;
  const meCalls = () => api.calls.filter((c) => c.path === '/api/auth/me').length;
  return { view, shown, meCalls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the live connection', () => {
  it('is "connecting" until the snapshot, then live with its data', async () => {
    const live = fakeLive();
    const { shown } = await renderLive(live);
    expect(shown()).toBe('connecting - -');
    act(() => {
      live.send('snapshot', { readings: { 'vessel.mass': reading(1800) }, states });
    });
    expect(shown()).toBe('live 1800 ok');
  });

  it('new readings and state changes update the data', async () => {
    const live = fakeLive();
    const { shown } = await renderLive(live);
    act(() => {
      live.send('snapshot', { readings: { 'vessel.mass': reading(1800) }, states });
      live.send('readings', { 'vessel.mass': reading(1801) });
      live.send('states', { components: { vessel: 'offline' } });
    });
    expect(shown()).toBe('live 1801 offline');
  });

  it('a network loss: "reconnecting" until the next snapshot', async () => {
    const live = fakeLive();
    const { shown } = await renderLive(live);
    act(() => {
      live.send('snapshot', { readings: {}, states });
      live.send('disconnect', 'transport close');
    });
    expect(shown()).toMatch(/^reconnecting/);
    act(() => {
      live.send('snapshot', { readings: { 'vessel.mass': reading(5) }, states });
    });
    expect(shown()).toBe('live 5 ok');
  });

  it('refused at connect: asks who is logged in now, and tries again later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const live = fakeLive();
    const { meCalls } = await renderLive(live);
    const before = meCalls();
    act(() => {
      live.send('connect_error', new Error('LOGIN_REQUIRED'));
    });
    await waitFor(() => {
      expect(meCalls()).toBe(before + 1);
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(live.socket.connect).toHaveBeenCalledTimes(1);
  });

  it('closed by the server: asks who is logged in now', async () => {
    const live = fakeLive();
    const { meCalls } = await renderLive(live);
    const before = meCalls();
    act(() => {
      live.send('disconnect', 'io server disconnect');
    });
    await waitFor(() => {
      expect(meCalls()).toBe(before + 1);
    });
  });

  it('login could not be checked (UNAVAILABLE): tries again, without asking', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const live = fakeLive();
    const { meCalls } = await renderLive(live);
    const before = meCalls();
    act(() => {
      live.send('connect_error', new Error('UNAVAILABLE'));
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(live.socket.connect).toHaveBeenCalledTimes(1);
    expect(meCalls()).toBe(before);
  });

  it('a network error is left to socket.io (it reconnects by itself)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const live = fakeLive();
    await renderLive(live);
    act(() => {
      live.send('connect_error', new Error('xhr poll error'));
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(live.socket.connect).not.toHaveBeenCalled();
  });

  it('leaving the line pages closes the connection', async () => {
    const live = fakeLive();
    const { view } = await renderLive(live);
    expect(live.opened()).toBe(1);
    view.unmount();
    expect(live.socket.disconnect).toHaveBeenCalled();
  });
});
