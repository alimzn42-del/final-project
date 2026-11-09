/**
 * The users page (owner, step 16) against a fake backend that keeps its own lists, so every
 * change shows up after the page loads them again.
 */
import type { Department, PublicUser, StaffMember } from '@mixline/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { applyTheme } from '../prefs/theme';
import { type FakeApi, fakeApi, location, renderApp, USERS } from '../test/app';

afterEach(() => {
  localStorage.clear();
  applyTheme(null);
  document.documentElement.dir = 'ltr';
});

/** Department ids are UUIDs, as the backend sends them (the shared rules check that). */
const D = {
  maintenance: '2d0a9c1e-4b5f-4c6d-8e7f-0a1b2c3d4e5f',
  production: '3e1b0d2f-5c6a-4d7e-9f80-1b2c3d4e5f60',
  quality: '4f2c1e30-6d7b-4e8f-a091-2c3d4e5f6071',
};

const staffMember = (over: Partial<StaffMember>): StaffMember => ({
  id: 'x',
  email: 'x@lab.sy',
  role: 'worker',
  fullName: 'X',
  locale: 'en',
  departmentId: D.production,
  mustChangePassword: false,
  disabledAt: null,
  createdAt: '2026-11-04T08:00:00.000Z',
  ...over,
});

/** A fake backend with a staff list and departments that the calls change. */
function backend(user: PublicUser = USERS.manager) {
  const staff: StaffMember[] = [
    staffMember({
      id: USERS.manager.id,
      email: USERS.manager.email,
      role: 'manager',
      fullName: 'Boss',
      departmentId: null,
    }),
    staffMember({
      id: 'u-lina',
      email: 'lina@lab.sy',
      role: 'manager',
      fullName: 'Lina',
      departmentId: null,
    }),
    staffMember({ id: USERS.worker.id, email: USERS.worker.email, fullName: 'Sami' }),
    staffMember({
      id: 'u-omar',
      email: 'omar@lab.sy',
      fullName: 'Omar',
      disabledAt: '2026-11-04T09:00:00.000Z',
    }),
  ];
  const departments: Department[] = [
    { id: D.maintenance, nameEn: 'Maintenance', nameAr: 'الصيانة', workerCount: 0 },
    { id: D.production, nameEn: 'Production', nameAr: 'الإنتاج', workerCount: 2 },
    { id: D.quality, nameEn: 'Quality', nameAr: 'الجودة', workerCount: 0 },
  ];
  const find = (url: string) => staff.find((s) => url.includes(`/${s.id}/`));
  const api: FakeApi = fakeApi({
    'GET /api/auth/me': { status: 200, body: user },
    'GET /api/users': () => ({ status: 200, body: staff }),
    'GET /api/departments': () => ({ status: 200, body: departments }),
  });
  for (const s of staff) {
    api.on(`POST /api/users/${s.id}/disable`, (_b, url) => {
      const target = find(url);
      if (target) target.disabledAt = '2026-11-04T10:00:00.000Z';
      return { status: 200, body: target };
    });
    api.on(`POST /api/users/${s.id}/enable`, (_b, url) => {
      const target = find(url);
      if (target) target.disabledAt = null;
      return { status: 200, body: target };
    });
    api.on(`POST /api/users/${s.id}/temporary-password`, (_b, url) => {
      const target = find(url);
      if (target) target.mustChangePassword = true;
      return { status: 200, body: target };
    });
    api.on(`PATCH /api/users/${s.id}/department`, (body, url) => {
      const target = find(url);
      if (target) target.departmentId = (body as { departmentId: string }).departmentId;
      return { status: 200, body: target };
    });
  }
  return { api, staff, departments };
}

const row = (name: string) => screen.getByRole('listitem', { name });
const calls = (api: FakeApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path);

async function usersPage() {
  const user = await renderApp('/users');
  await screen.findByRole('heading', { name: 'Staff accounts' });
  return user;
}

describe('the way in', () => {
  it('managers find "Users" in their menu; workers do not, and /users sends them away', async () => {
    backend();
    const user = await renderApp('/line');
    await user.click(await screen.findByRole('button', { name: /Boss/ }));
    await user.click(screen.getByRole('link', { name: 'Users' }));
    expect(location()).toBe('/users');
    expect(await screen.findByRole('heading', { name: 'Staff accounts' })).toBeInTheDocument();
  });

  it('a worker typing /users is sent to their own page', async () => {
    backend(USERS.worker);
    const user = await renderApp('/users');
    await waitFor(() => {
      expect(location()).toBe('/line');
    });
    await user.click(await screen.findByRole('button', { name: /Sami/ }));
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });
});

describe('the staff list', () => {
  it('shows each account with its role and status; marks you, and offers no "Disable" on you', async () => {
    backend();
    await usersPage();
    const me = row('Boss');
    expect(within(me).getByText('you')).toBeInTheDocument();
    expect(within(me).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    expect(within(row('Omar')).getByText('Disabled')).toBeInTheDocument();
    expect(within(row('Omar')).getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(within(row('Sami')).getByText('Active')).toBeInTheDocument();
    expect(within(row('Sami')).getByRole('combobox', { name: 'Department' })).toHaveValue(
      D.production,
    );
    expect(within(row('Lina')).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('asks before disabling, then says it was done and loads the list again', async () => {
    const { api } = backend();
    const user = await usersPage();
    await user.click(within(row('Sami')).getByRole('button', { name: 'Disable' }));
    expect(within(row('Sami')).getByText(/logged out everywhere/)).toBeInTheDocument();
    const before = calls(api, 'GET', '/api/users').length;
    await user.click(
      within(within(row('Sami')).getByRole('group')).getByRole('button', { name: 'Disable' }),
    );
    expect(await screen.findByText('Sami is disabled.')).toBeInTheDocument();
    expect(calls(api, 'POST', `/api/users/${USERS.worker.id}/disable`)).toHaveLength(1);
    expect(calls(api, 'GET', '/api/users').length).toBeGreaterThan(before);
    expect(await within(row('Sami')).findByText('Disabled')).toBeInTheDocument();
  });

  it("explains the backend's lockout refusal", async () => {
    const { api } = backend();
    api.on('POST /api/users/u-lina/disable', {
      status: 409,
      body: { code: 'LAST_ACTIVE_MANAGER', message: 'x' },
    });
    const user = await usersPage();
    await user.click(within(row('Lina')).getByRole('button', { name: 'Disable' }));
    await user.click(
      within(within(row('Lina')).getByRole('group')).getByRole('button', { name: 'Disable' }),
    );
    expect(await within(row('Lina')).findByRole('alert')).toHaveTextContent(
      'The line must keep at least one active manager.',
    );
  });

  it('a new temporary password: checked with the password rules, then sent', async () => {
    const { api } = backend();
    const user = await usersPage();
    await user.click(within(row('Sami')).getByRole('button', { name: 'New temporary password' }));
    const sami = row('Sami');
    await user.type(within(sami).getByLabelText('Temporary password'), 'short');
    await user.click(within(sami).getByRole('button', { name: 'Give this password' }));
    expect(within(sami).getByText(/At least 8 characters/)).toBeInTheDocument();
    expect(calls(api, 'POST', `/api/users/${USERS.worker.id}/temporary-password`)).toHaveLength(0);
    await user.clear(within(sami).getByLabelText('Temporary password'));
    await user.type(within(sami).getByLabelText('Temporary password'), 'a-new-temporary-1');
    await user.click(within(sami).getByRole('button', { name: 'Give this password' }));
    expect(await screen.findByText('Sami has a new temporary password.')).toBeInTheDocument();
    expect(calls(api, 'POST', `/api/users/${USERS.worker.id}/temporary-password`)[0]?.body).toEqual(
      {
        password: 'a-new-temporary-1',
      },
    );
    expect(await within(row('Sami')).findByText('Must change password')).toBeInTheDocument();
  });

  it('moves a worker to another department', async () => {
    const { api } = backend();
    const user = await usersPage();
    await user.selectOptions(
      within(row('Sami')).getByRole('combobox', { name: 'Department' }),
      D.quality,
    );
    await user.click(within(row('Sami')).getByRole('button', { name: 'Move' }));
    expect(await screen.findByText('Sami moved to Quality.')).toBeInTheDocument();
    expect(calls(api, 'PATCH', `/api/users/${USERS.worker.id}/department`)[0]?.body).toEqual({
      departmentId: D.quality,
    });
  });
});

describe('a new account', () => {
  it('needs a department for a worker, then creates the account', async () => {
    const { api } = backend();
    api.on('POST /api/users', { status: 201, body: {} });
    const user = await usersPage();
    const form = screen.getByRole('region', { name: 'New account' });
    await user.type(within(form).getByLabelText('Full name'), 'Huda');
    await user.type(within(form).getByLabelText('Email'), 'huda@lab.sy');
    await user.type(within(form).getByLabelText('Temporary password'), 'temporary-pass-1');
    await user.click(within(form).getByRole('button', { name: 'Create account' }));
    expect(within(form).getByText('Required')).toBeInTheDocument();
    expect(calls(api, 'POST', '/api/users')).toHaveLength(0);
    await user.selectOptions(within(form).getByLabelText('Department'), D.quality);
    await user.click(within(form).getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText("Huda's account is ready.")).toBeInTheDocument();
    expect(calls(api, 'POST', '/api/users')[0]?.body).toEqual({
      fullName: 'Huda',
      email: 'huda@lab.sy',
      role: 'worker',
      password: 'temporary-pass-1',
      locale: 'en',
      departmentId: D.quality,
    });
  });

  it('a manager has no department; an email already used is said by the field', async () => {
    const { api } = backend();
    api.on('POST /api/users', { status: 409, body: { message: 'email already registered' } });
    const user = await usersPage();
    const form = screen.getByRole('region', { name: 'New account' });
    await user.selectOptions(within(form).getByLabelText('Role'), 'manager');
    expect(within(form).queryByLabelText('Department')).not.toBeInTheDocument();
    await user.type(within(form).getByLabelText('Full name'), 'Lina');
    await user.type(within(form).getByLabelText('Email'), 'lina@lab.sy');
    await user.type(within(form).getByLabelText('Temporary password'), 'temporary-pass-1');
    await user.click(within(form).getByRole('button', { name: 'Create account' }));
    expect(await within(form).findByText('This email already has an account')).toBeInTheDocument();
  });
});

describe('departments', () => {
  it('a department with workers is not deleted, and the page says how many', async () => {
    const { api } = backend();
    api.on(`DELETE /api/departments/${D.production}`, {
      status: 409,
      body: { code: 'DEPARTMENT_HAS_WORKERS', workers: 2, message: 'x' },
    });
    const user = await usersPage();
    const production = row('Production');
    expect(within(production).getByText('2 workers')).toBeInTheDocument();
    await user.click(within(production).getByRole('button', { name: 'Delete' }));
    await user.click(
      within(within(production).getByRole('group')).getByRole('button', { name: 'Delete' }),
    );
    expect(await within(row('Production')).findByRole('alert')).toHaveTextContent(
      'Cannot delete: 2 workers are in this department. Move them first.',
    );
  });

  it('adds a department; a name already used is said by the field', async () => {
    const { api } = backend();
    let tries = 0;
    api.on('POST /api/departments', () => {
      tries++;
      return tries === 1
        ? { status: 409, body: { issues: [{ path: 'nameEn', message: 'already used' }] } }
        : { status: 201, body: {} };
    });
    const user = await usersPage();
    const section = screen.getByRole('region', { name: 'Departments' });
    await user.type(within(section).getByLabelText('Name in English'), 'Quality');
    await user.type(within(section).getByLabelText('Name in Arabic'), 'التعبئة');
    await user.click(within(section).getByRole('button', { name: 'Add department' }));
    expect(await within(section).findByText('This name is already used')).toBeInTheDocument();
    await user.clear(within(section).getByLabelText('Name in English'));
    await user.type(within(section).getByLabelText('Name in English'), 'Packing');
    await user.click(within(section).getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('Department Packing added.')).toBeInTheDocument();
  });
});

describe('a disabled account at login (owner, step 16)', () => {
  it('is told so, after the right password', async () => {
    const api = fakeApi({ 'GET /api/auth/me': { status: 401 } });
    api.on('POST /api/auth/login', {
      status: 403,
      body: { code: 'ACCOUNT_DISABLED', message: 'x' },
    });
    const user = await renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'omar@lab.sy');
    await user.type(screen.getByLabelText('Password'), 'his-own-pass');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account is disabled. Ask a manager.',
    );
  });
});

describe('in Arabic', () => {
  it('right to left, Arabic labels and department names, Arabic plurals; emails stay left to right', async () => {
    backend({ ...USERS.manager, locale: 'ar' });
    await renderApp('/users');
    expect(await screen.findByRole('heading', { name: 'حسابات الموظفين' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(within(row('الإنتاج')).getByText('عاملان')).toBeInTheDocument();
    expect(within(row('Sami')).getByText(USERS.worker.email)).toHaveAttribute('dir', 'ltr');
    expect(within(row('Sami')).getByRole('combobox', { name: 'القسم' })).toHaveDisplayValue(
      'الإنتاج',
    );
  });
});
