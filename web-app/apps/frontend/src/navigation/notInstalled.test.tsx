/**
 * A part not installed yet (owner, step 16): dimmed in the scene with a label, and on the pages a
 * "Not installed" label instead of a state chip. Never shown as offline, no warning.
 */
import { machineSchema } from '@mixline/shared';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import { applyTheme } from '../prefs/theme';
import { fakeApi, renderApp, USERS } from '../test/app';
import { fakeLive } from '../test/fakeLive';

afterEach(() => {
  localStorage.clear();
  applyTheme(null);
  document.documentElement.dir = 'ltr';
});

/** The real machine.json with the black dye pump not installed. */
const withoutBlackPump = machineSchema.parse({
  ...raw,
  components: raw.components.map((c) => (c.id === 'dyeKPump' ? { ...c, installed: false } : c)),
});

function serve() {
  const api = fakeApi({ 'GET /api/auth/me': { status: 200, body: USERS.manager } });
  api.on('GET /api/machine', { status: 200, body: withoutBlackPump });
}

describe('a part not installed yet (owner, step 16)', () => {
  it('its page says so instead of a state, and shows no values, even with no data at all', async () => {
    serve();
    const live = fakeLive();
    await renderApp('/line/mixingColor/mixing/dyeKPump', live);
    const panel = await screen.findByRole('complementary');
    act(() => {
      // The backend gives a part that is not installed no state (`none`).
      live.send('snapshot', {
        readings: {},
        states: {
          line: 'offline',
          sections: {},
          subsections: {},
          components: { dyeKPump: 'none' },
          sensors: {},
        },
      });
    });
    expect(within(panel).getByRole('heading', { name: 'Black dye pump' })).toBeInTheDocument();
    expect(within(panel).getAllByText('Not installed').length).toBeGreaterThan(0);
    expect(
      within(panel).getByText('Not installed yet, so no data is expected from it.'),
    ).toBeInTheDocument();
    expect(within(panel).queryByText('Offline')).not.toBeInTheDocument();
    expect(within(panel).queryByText('No data yet')).not.toBeInTheDocument();
  });

  it('the list of parts marks it, while the others keep their state chips', async () => {
    serve();
    const live = fakeLive();
    await renderApp('/line/mixingColor/mixing', live);
    const panel = await screen.findByRole('complementary');
    act(() => {
      live.send('snapshot', {
        readings: {},
        states: {
          line: 'ok',
          sections: {},
          subsections: {},
          components: { dyeKPump: 'none', dyeCPump: 'offline' },
          sensors: {},
        },
      });
    });
    const black = within(panel).getByRole('link', { name: /Black dye pump/ });
    expect(black).toHaveTextContent('Not installed');
    const cyan = within(panel).getByRole('link', { name: /Cyan dye pump/ });
    expect(cyan).toHaveTextContent('Offline');
    expect(cyan).not.toHaveTextContent('Not installed');
  });
});
