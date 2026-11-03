/**
 * Trend charts on a part's page against a fake backend (plan step 14, owner's
 * decisions): history per sensor, the time window, live additions, reloads,
 * gaps, state timelines with words, and left-to-right time in Arabic.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { type FakeApi, fakeApi, renderApp, USERS } from '../test/app';
import { fakeLive } from '../test/fakeLive';

const SEC = 1000;
const MIN = 60 * SEC;
const BASE_PUMP = '/line/mixingColor/mixing/basePump';
const as = (user: object) => ({ 'GET /api/auth/me': { status: 200, body: user } });

afterEach(() => {
  localStorage.clear();
  document.documentElement.dir = 'ltr';
});

/**
 * A history answer: a reading every `every` ms back from the request's `to`,
 * valued `value(age)` (age = ms before `to`); undefined means no reading then.
 */
function history(every: number, value: (age: number) => number | undefined) {
  return (_body: unknown, url: string) => {
    const query = new URL(url, 'http://test').searchParams;
    const from = Date.parse(query.get('from') ?? '');
    const to = Date.parse(query.get('to') ?? '');
    const points: { t: string; v: number }[] = [];
    for (let age = to - from; age >= 0; age -= every) {
      const v = value(age);
      if (v !== undefined) points.push({ t: new Date(to - age).toISOString(), v });
    }
    const span = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    return { status: 200, body: { sensorId: 'x', resolution: 'raw', ...span, points } };
  };
}

/** The pump's current alternates 0.48 / 0.52 A every second; the pump is on. */
const basePump = {
  ...as(USERS.manager),
  'GET /api/telemetry/basePump.current': history(SEC, (age) => ((age / SEC) % 2 ? 0.52 : 0.48)),
  'GET /api/telemetry/basePump.on': history(5 * SEC, () => 1),
};

/** The time span of each history request so far, by sensor. */
function spans(api: FakeApi): [string, number][] {
  return api.calls
    .filter((c) => c.path.startsWith('/api/telemetry/'))
    .map((c) => {
      const url = new URL(c.path, 'http://test');
      const span =
        Date.parse(url.searchParams.get('to') ?? '') -
        Date.parse(url.searchParams.get('from') ?? '');
      return [decodeURIComponent(url.pathname.replace('/api/telemetry/', '')), span];
    });
}

const row = (name: string) => screen.getByRole('listitem', { name });

describe('trend charts on a part’s page', () => {
  it('ask each sensor’s history for the window and draw it: a line, and a timeline', async () => {
    const api = fakeApi(basePump);
    await renderApp(BASE_PUMP);
    expect(
      await screen.findByRole('img', {
        name: 'Pump current, last 5 min: lowest 0.48 A, highest 0.52 A',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pump, last 5 min: On 100%' })).toBeInTheDocument();
    // 5 minutes, and 10 s before them so the value at the left edge is known.
    expect(spans(api).sort()).toEqual([
      ['basePump.current', 5 * MIN + 10 * SEC],
      ['basePump.on', 5 * MIN + 10 * SEC],
    ]);
  });

  it('one switch changes every chart; the choice is remembered in this browser', async () => {
    const api = fakeApi(basePump);
    const user = await renderApp(BASE_PUMP);
    await screen.findByRole('img', { name: /^Pump current, last 5 min/ });
    const switcher = screen.getByRole('group', { name: 'Time shown' });
    expect(within(switcher).getByRole('button', { name: '5 min' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(switcher).getByRole('button', { name: '15 min' }));
    expect(await screen.findByRole('img', { name: /^Pump current, last 15 min/ })).toBeVisible();
    expect(await screen.findByRole('img', { name: /^Pump, last 15 min/ })).toBeVisible();
    expect(
      spans(api)
        .slice(-2)
        .map(([, span]) => span),
    ).toEqual([15 * MIN + 10 * SEC, 15 * MIN + 10 * SEC]);
    expect(localStorage.getItem('mixline.chartWindow')).toBe('15');
  });

  it('opens with the remembered window; 60 minutes asks exactly an hour (raw readings)', async () => {
    localStorage.setItem('mixline.chartWindow', '60');
    const api = fakeApi(basePump);
    await renderApp(BASE_PUMP);
    expect(await screen.findByRole('img', { name: /^Pump current, last 60 min/ })).toBeVisible();
    expect(screen.getByRole('button', { name: '60 min' })).toHaveAttribute('aria-pressed', 'true');
    expect(spans(api).map(([, span]) => span)).toEqual([60 * MIN, 60 * MIN]);
  });

  it('live readings are added at the right', async () => {
    const live = fakeLive();
    fakeApi({
      ...basePump,
      // The last stored reading is 3 s old, so the live one below is newer.
      'GET /api/telemetry/basePump.current': history(SEC, (age) =>
        age >= 3 * SEC ? 0.5 : undefined,
      ),
    });
    await renderApp(BASE_PUMP, live);
    await screen.findByRole('img', {
      name: /^Pump current, last 5 min: lowest 0.50 A, highest 0.50 A/,
    });
    const now = Date.now();
    act(() => {
      live.send('readings', {
        'basePump.current': {
          value: 0.9,
          ts: new Date(now - 2 * SEC).toISOString(),
          receivedAt: new Date(now).toISOString(),
          source: 'sim',
        },
      });
    });
    expect(await screen.findByRole('img', { name: /highest 0.90 A$/ })).toBeVisible();
  });

  it('the history is loaded again when the connection is back after a loss', async () => {
    const api = fakeApi(basePump);
    const live = fakeLive();
    await renderApp(BASE_PUMP, live);
    await screen.findByRole('img', { name: /^Pump current/ });
    const states = { line: 'ok', sections: {}, subsections: {}, components: {}, sensors: {} };
    act(() => {
      live.send('snapshot', { readings: {}, states });
    });
    expect(spans(api)).toHaveLength(2);
    act(() => {
      live.send('disconnect', 'transport close');
      live.send('snapshot', { readings: {}, states });
    });
    await waitFor(() => {
      expect(spans(api)).toHaveLength(4);
    });
  });

  it('a history that cannot be loaded says so, and “Try again” loads it', async () => {
    const api = fakeApi({ ...basePump, 'GET /api/telemetry/basePump.current': { status: 500 } });
    const user = await renderApp(BASE_PUMP);
    await screen.findByRole('img', { name: /^Pump, last 5 min/ });
    const current = row('Pump current');
    expect(await within(current).findByRole('alert')).toHaveTextContent(
      'Could not load the history.',
    );
    api.on(
      'GET /api/telemetry/basePump.current',
      history(SEC, () => 0.5),
    );
    await user.click(within(current).getByRole('button', { name: 'Try again' }));
    expect(
      await within(current).findByRole('img', { name: /^Pump current, last 5 min/ }),
    ).toBeVisible();
  });

  it('missing data: the line breaks, the timeline leaves empty space (never a grey band)', async () => {
    fakeApi({
      ...as(USERS.manager),
      // No current readings between 60 s and 120 s ago.
      'GET /api/telemetry/basePump.current': history(SEC, (age) =>
        age > 60 * SEC && age < 120 * SEC ? undefined : 0.5,
      ),
      // The pump went silent 61 s ago: its value holds 10 s, then 51 s of nothing.
      'GET /api/telemetry/basePump.on': history(SEC, (age) => (age >= 61 * SEC ? 1 : undefined)),
    });
    await renderApp(BASE_PUMP);
    expect(
      await screen.findByRole('img', { name: 'Pump, last 5 min: On 83%, No data 17%' }),
    ).toBeVisible();
    const line = row('Pump current').querySelector('[data-line]');
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
  });

  it('an enum sensor: one neutral shade per value, the words from the locale file', async () => {
    fakeApi({
      ...as(USERS.manager),
      // None, Pass, Reject in turn, 20 s each.
      'GET /api/telemetry/check.decision': history(
        5 * SEC,
        (age) => Math.floor(age / (20 * SEC)) % 3,
      ),
    });
    await renderApp('/line/conveyor/checkCap/checkPlatform');
    const decision = await screen.findByRole('listitem', { name: 'Check result' });
    await within(decision).findByRole('img', { name: /^Check result, last 5 min: None \d+%/ });
    const legend = within(decision).getByRole('list');
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => [li.textContent, li.dataset.shade]),
    ).toEqual([
      ['None', '1'],
      ['Pass', '2'],
      ['Reject', '3'],
    ]);
    const band = decision.querySelector('[data-band][data-shade="3"]');
    expect(band).toHaveTextContent('Reject');
  });

  it('the arrow keys read the value under the crosshair; Escape lets go', async () => {
    fakeApi(basePump);
    const user = await renderApp(BASE_PUMP);
    const chart = await screen.findByRole('img', { name: /^Pump current, last 5 min/ });
    chart.focus();
    await user.keyboard('{ArrowLeft}');
    const current = row('Pump current');
    expect(within(current).getByText(/^0\.(48|52) A at \d\d:\d\d:\d\d$/)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(within(current).queryByText(/^0\.(48|52) A at/)).not.toBeInTheDocument();
  });

  it('in Arabic the page is right to left, but time on the charts still runs left to right', async () => {
    fakeApi({ ...basePump, ...as({ ...USERS.manager, locale: 'ar' }) });
    await renderApp(BASE_PUMP);
    const timeline = await screen.findByRole('img', {
      name: 'المضخة، آخر 5 دقائق: تشغيل 100%',
    });
    expect(document.documentElement.dir).toBe('rtl');
    expect(timeline.closest('[dir="ltr"]')).not.toBeNull();
    const line = screen.getByRole('img', { name: /^تيار المضخة، آخر 5 دقائق/ });
    expect(line.closest('[dir="ltr"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '15 دقيقة' })).toBeInTheDocument();
  });
});
