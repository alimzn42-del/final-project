/**
 * The app against a fake backend: plan step 11's checks (a manager logs in, a
 * new customer lands on /customer, a customer typing /line is redirected,
 * Arabic is right-to-left) and the owner's step 11 rules.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { applyTheme } from '../prefs/theme';
import { fakeApi, location, MACHINE, renderApp, USERS } from '../test/app';

afterEach(() => {
  localStorage.clear();
  applyTheme(null);
  document.documentElement.dir = 'ltr';
});

/** The line page once its data has loaded (the breadcrumbs then replace the loading title). */
async function linePage(name = 'Line') {
  await screen.findByRole('complementary');
  return screen.getByRole('heading', { level: 1, name });
}

const loggedOut = { 'GET /api/auth/me': { status: 401 } };
const as = (user: object) => ({ 'GET /api/auth/me': { status: 200, body: user } });

describe('where each user lands', () => {
  it('a visitor opening /line is sent to the login page', async () => {
    fakeApi(loggedOut);
    await renderApp('/line');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(location()).toBe('/login');
  });

  it('a customer typing /line is sent to /customer', async () => {
    fakeApi(as(USERS.customer));
    await renderApp('/line');
    expect(await screen.findByRole('heading', { name: 'Customer area' })).toBeInTheDocument();
    expect(location()).toBe('/customer');
  });

  it('workers open the line pages (owner, step 11)', async () => {
    fakeApi(as(USERS.worker));
    await renderApp('/line/mixingColor');
    expect(await screen.findByRole('heading', { name: 'Mixing & Color' })).toBeInTheDocument();
    expect(location()).toBe('/line/mixingColor');
  });

  it('a logged-in user opening /login goes to their own page', async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/login');
    await linePage();
    expect(location()).toBe('/line');
  });

  it('an unknown address says so', async () => {
    fakeApi(loggedOut);
    await renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('the line page (plan step 12)', () => {
  it('without WebGL the page says so instead of failing (jsdom has no WebGL)', async () => {
    fakeApi(as(USERS.worker));
    await renderApp('/line');
    expect(await screen.findByText(/cannot show the 3D view/)).toBeInTheDocument();
  });

  it('when the line description cannot be loaded: try again', async () => {
    const api = fakeApi({ ...as(USERS.manager), 'GET /api/machine': { status: 500 } });
    const user = await renderApp('/line');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    api.on('GET /api/machine', () => ({ status: 200, body: MACHINE }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/cannot show the 3D view/)).toBeInTheDocument();
  });
});

describe('navigation between the levels (plan step 13)', () => {
  const crumbs = () =>
    within(screen.getByRole('navigation', { name: 'Where you are in the line' }));
  const panel = () => within(screen.getByRole('complementary'));

  it('breadcrumbs: Line › section › sub-section › part; the page itself is the title', async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/line/mixingColor/color/camera');
    expect(await screen.findByRole('heading', { level: 1, name: 'Camera' })).toBeInTheDocument();
    const links = crumbs().getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Line', '/line'],
      ['Mixing & Color', '/line/mixingColor'],
      ['Color', '/line/mixingColor/color'],
    ]);
  });

  it('every level is reachable by clicking the list beside the view, down to a part', async () => {
    fakeApi(as(USERS.worker));
    const user = await renderApp('/line');
    await user.click(await panelLink('Mixing & Color'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mixing & Color' })).toBeVisible();
    await user.click(await panelLink('Color'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Color' })).toBeVisible();
    await user.click(await panelLink('Camera'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Camera' })).toBeVisible();
    expect(location()).toBe('/line/mixingColor/color/camera');

    // And back up by the breadcrumbs.
    await user.click(crumbs().getByRole('link', { name: 'Line' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Line' })).toBeVisible();
  });

  it('a section without sub-sections lists its parts directly (doc 03: level 3 skipped)', async () => {
    fakeApi(as(USERS.manager));
    const user = await renderApp('/line/cabinet');
    await user.click(await panelLink('PLC'));
    expect(location()).toBe('/line/cabinet/part/plc');
  });

  it("a part's page: its status, the box it belongs to, and its sensors", async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/line/mixingColor/mixing/vessel');
    await screen.findByRole('heading', { level: 1, name: 'Mixing vessel' });
    expect(panel().getByText('Confirmed')).toBeInTheDocument();
    expect(panel().getByText('Net mass')).toBeInTheDocument();
    expect(panel().getByText('g')).toBeInTheDocument();
    // The vessel holds the lid, the mixer and the overflow float.
    expect(panel().getByRole('heading', { name: 'Parts inside' })).toBeInTheDocument();
  });

  it('a part inside a box links back to the box', async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/line/mixingColor/color/camera');
    const box = await panelLink('Color box');
    expect(box).toHaveAttribute('href', '/line/mixingColor/color/colorBox');
  });

  it('an unknown line address says so, with a way back to the line', async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/line/mixingColor/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Line' })).toHaveAttribute('href', '/line');
  });

  async function panelLink(name: string) {
    return within(await screen.findByRole('complementary')).findByRole('link', { name });
  }
});

describe('login', () => {
  it('a manager logs in and lands on the line page', async () => {
    const api = fakeApi({
      ...loggedOut,
      'POST /api/auth/login': { status: 200, body: USERS.manager },
    });
    const user = await renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'boss@lab.sy');
    await user.type(screen.getByLabelText('Password'), 'manager-pass-1');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await linePage()).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/auth/login')?.body).toEqual({
      email: 'boss@lab.sy',
      password: 'manager-pass-1',
    });
  });

  it('a wrong password says so; empty fields are required', async () => {
    fakeApi({ ...loggedOut, 'POST /api/auth/login': { status: 401 } });
    const user = await renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(screen.getAllByText('Required')).toHaveLength(2);

    await user.type(screen.getByLabelText('Email'), 'boss@lab.sy');
    await user.type(screen.getByLabelText('Password'), 'not it');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });

  it('too many attempts: wait a minute', async () => {
    fakeApi({ ...loggedOut, 'POST /api/auth/login': { status: 429 } });
    const user = await renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'boss@lab.sy');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait a minute');
  });
});

describe('a temporary password (owner, step 9)', () => {
  it('only the change-password page until it is changed, then the landing page', async () => {
    const temporary = { ...USERS.manager, mustChangePassword: true };
    const api = fakeApi({
      ...as(temporary),
      'POST /api/auth/change-password': { status: 200, body: USERS.manager },
    });
    const user = await renderApp('/line');
    await screen.findByText(/temporary password/);
    expect(location()).toBe('/change-password');
    // No theme choice and no other page while the password is temporary.
    await user.click(screen.getByRole('button', { name: /Boss/ }));
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'temporary-1');
    await user.type(screen.getByLabelText('New password'), 'temporary-1');
    await user.click(screen.getByRole('button', { name: 'Save the new password' }));
    expect(await screen.findByText('Must differ from the current password')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'my own long password');
    await user.click(screen.getByRole('button', { name: 'Save the new password' }));
    expect(await linePage()).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/auth/change-password')?.body).toEqual({
      currentPassword: 'temporary-1',
      newPassword: 'my own long password',
    });
  });

  it('a wrong current password is shown on its field', async () => {
    fakeApi({
      ...as(USERS.worker),
      'POST /api/auth/change-password': {
        status: 400,
        body: { issues: [{ path: 'currentPassword', message: 'wrong password' }] },
      },
    });
    const user = await renderApp('/change-password');
    await user.type(await screen.findByLabelText('Current password'), 'not it');
    await user.type(screen.getByLabelText('New password'), 'a new long password');
    await user.click(screen.getByRole('button', { name: 'Save the new password' }));
    expect(await screen.findByText('The current password is wrong.')).toBeInTheDocument();
  });
});

describe('language and theme', () => {
  it('Arabic switches the page to right-to-left; a logged-in user’s choice is saved', async () => {
    const api = fakeApi({
      ...as(USERS.manager),
      'PATCH /api/auth/me': { status: 200, body: { ...USERS.manager, locale: 'ar' } },
    });
    const user = await renderApp('/line');
    await user.click(await screen.findByRole('button', { name: 'العربية' }));

    expect(await screen.findByRole('heading', { name: 'خط الإنتاج' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ locale: 'ar' });
  });

  it('a visitor’s choice stays in this browser (nothing to save)', async () => {
    const api = fakeApi(loggedOut);
    const user = await renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'العربية' }));
    expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('mixline.language')).toBe('ar');
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('opens in the user’s saved language', async () => {
    fakeApi(as({ ...USERS.worker, locale: 'ar' }));
    await renderApp('/line');
    expect(await screen.findByRole('heading', { name: 'خط الإنتاج' })).toBeInTheDocument();
  });

  it('the theme is saved with the account and shown at once', async () => {
    const api = fakeApi({
      ...as(USERS.manager),
      'PATCH /api/auth/me': { status: 200, body: { ...USERS.manager, theme: 'light' } },
    });
    const user = await renderApp('/line');
    await user.click(await screen.findByRole('button', { name: /Boss/ }));
    const themes = screen.getByRole('group', { name: 'Theme' });
    await user.click(within(themes).getByRole('button', { name: 'Light' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ theme: 'light' });
    expect(within(themes).getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('a user who never picked a theme follows the browser (no data-theme)', async () => {
    fakeApi(as(USERS.manager));
    await renderApp('/line');
    await linePage();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('logout and ended sessions (owner, step 11)', () => {
  it('logout ends the session on the server and returns to the login page', async () => {
    const api = fakeApi({ ...as(USERS.manager), 'POST /api/auth/logout': { status: 204 } });
    const user = await renderApp('/line');
    await user.click(await screen.findByRole('button', { name: /Boss/ }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
  });

  it('a session ended elsewhere (401): the login page says so', async () => {
    fakeApi({ ...as(USERS.manager), 'PATCH /api/auth/me': { status: 401 } });
    const user = await renderApp('/line');
    await user.click(await screen.findByRole('button', { name: /Boss/ }));
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(await screen.findByText(/Your session has ended/)).toBeInTheDocument();
    expect(location()).toBe('/login');
  });

  it('the backend cannot be reached: try again', async () => {
    const api = fakeApi({ 'GET /api/auth/me': 'unreachable' });
    const user = await renderApp('/line');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    api.on('GET /api/auth/me', () => ({ status: 200, body: USERS.manager }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await linePage()).toBeInTheDocument();
  });
});

describe('customer sign-up', () => {
  it('lists every problem in the user’s language', async () => {
    fakeApi(loggedOut);
    const user = await renderApp('/signup');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    // email, password, full name, mobile, date of birth, governorate, city: all required
    expect(screen.getAllByText('Required')).toHaveLength(7);

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Mobile number'), '123');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2015-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a valid mobile number for the chosen country'),
    ).toBeInTheDocument();
    expect(screen.getByText('You must be at least 18 years old')).toBeInTheDocument();
  });

  it('a new customer: the mobile number is sent as E.164, then lands on /customer', async () => {
    const api = fakeApi({
      ...loggedOut,
      'POST /api/auth/signup': { status: 201, body: USERS.customer },
    });
    const user = await renderApp('/signup');
    await user.type(await screen.findByLabelText('Email'), 'rana@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Full name'), 'Rana Haddad');
    expect(screen.getByLabelText('Country code')).toHaveValue('SY'); // Syria by default
    await user.type(screen.getByLabelText('Mobile number'), '0912 345 678');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-05-17' } });
    await user.selectOptions(screen.getByLabelText('Governorate'), 'homs');
    await user.type(screen.getByLabelText('City or area'), 'Inshaat');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Customer area' })).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/auth/signup')?.body).toMatchObject({
      email: 'rana@example.com',
      mobile: '+963912345678',
      dateOfBirth: '1990-05-17',
      governorate: 'homs',
      cityArea: 'Inshaat',
      locale: 'en',
    });
  });

  it('"Outside Syria" asks for the country; an email already used is shown on its field', async () => {
    fakeApi({ ...loggedOut, 'POST /api/auth/signup': { status: 409 } });
    const user = await renderApp('/signup');
    await user.selectOptions(await screen.findByLabelText('Governorate'), 'outside');
    expect(screen.getByLabelText('Country')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'rana@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Full name'), 'Rana Haddad');
    await user.type(screen.getByLabelText('Mobile number'), '0912345678');
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-05-17' } });
    await user.type(screen.getByLabelText('City or area'), 'Beirut');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Required')).toBeInTheDocument(); // the country

    await user.type(screen.getByLabelText('Country'), 'Lebanon');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This email already has an account.')).toBeInTheDocument();
  });
});
