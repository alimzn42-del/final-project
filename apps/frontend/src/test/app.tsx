/**
 * Test helpers: the real app (routes, session, labels from the real locale
 * files) against a fake backend, at a given address.
 */
import { machineSchema, type PublicUser } from '@mixline/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';

import ar from '../../../../config/locales/ar.json';
import en from '../../../../config/locales/en.json';
import machine from '../../../../config/machine.json';
import { App } from '../app/App';
import { AppProviders } from '../app/AppProviders';
import { createI18n, switchLanguage } from '../i18n/i18n';
import { LiveConnectContext } from '../live/live';
import { visitorLanguage } from '../prefs/language';
import { type FakeLive, fakeLive } from './fakeLive';

/** The real line description, as GET /api/machine returns it. */
export const MACHINE = machineSchema.parse(machine);

export const USERS = {
  manager: {
    id: 'u-manager',
    email: 'boss@lab.sy',
    role: 'manager',
    locale: 'en',
    theme: null,
    fullName: 'Boss',
    departmentId: null,
    mustChangePassword: false,
  },
  worker: {
    id: 'u-worker',
    email: 'sami@lab.sy',
    role: 'worker',
    locale: 'en',
    theme: null,
    fullName: 'Sami',
    departmentId: 'd-production',
    mustChangePassword: false,
  },
  customer: {
    id: 'u-customer',
    email: 'rana@example.com',
    role: 'customer',
    locale: 'en',
    theme: null,
    fullName: 'Rana',
    departmentId: null,
    mustChangePassword: false,
  },
} satisfies Record<string, PublicUser>;

type Reply = { status: number; body?: unknown } | 'unreachable';
type Handler = (body: unknown) => Reply;

export interface FakeApi {
  calls: { method: string; path: string; body: unknown }[];
  on: (route: string, handler: Handler) => void;
}

/** Replaces fetch: answers `"METHOD /api/path"` routes; the locale files and machine.json are always served. */
export function fakeApi(routes: Record<string, Handler | Reply> = {}): FakeApi {
  const table = new Map<string, Handler>();
  const on = (route: string, handler: Handler | Reply) => {
    table.set(route, typeof handler === 'function' ? handler : () => handler);
  };
  on('GET /api/locales/en', { status: 200, body: en });
  on('GET /api/locales/ar', { status: 200, body: ar });
  on('GET /api/machine', { status: 200, body: MACHINE });
  for (const [route, handler] of Object.entries(routes)) on(route, handler);

  const calls: FakeApi['calls'] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url, body });
    const reply = table.get(`${method} ${url}`)?.(body) ?? { status: 404 };
    if (reply === 'unreachable') return Promise.reject(new TypeError('Failed to fetch'));
    const text = reply.body === undefined ? null : JSON.stringify(reply.body);
    return Promise.resolve(new Response(text, { status: reply.status }));
  });
  return { calls, on };
}

/** Shows the current address, so tests can check where the app went. */
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

/** The app at `path`; the live connection is a fake one (pass your own to send it events). */
export async function renderApp(path: string, live: FakeLive = fakeLive()) {
  const i18n = await createI18n();
  await switchLanguage(i18n, visitorLanguage());
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders i18n={i18n}>
        <LiveConnectContext value={live.connect}>
          <App />
          <Location />
        </LiveConnectContext>
      </AppProviders>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

export const location = () => screen.getByTestId('location').textContent;
