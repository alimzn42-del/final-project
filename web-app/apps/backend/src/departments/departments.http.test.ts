import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, TEST_ENV, type TestApp } from '../testing/http.js';

describe('departments over HTTP (owner, step 9)', () => {
  let t: TestApp;
  let manager: string;
  let worker: string;

  /** Creates a worker in a department and returns nothing; password already changed. */
  const addWorker = async (email: string, departmentId: string) => {
    const r = await t.call(
      'POST',
      '/users',
      { fullName: email, email, password: 'temporary-1', role: 'worker', departmentId },
      manager,
    );
    expect(r.status).toBe(201);
  };

  beforeAll(async () => {
    t = await startTestApp();
    manager = await t.login(TEST_ENV.MANAGER_EMAIL, TEST_ENV.MANAGER_PASSWORD);
    await addWorker('sami@lab.sy', t.departments.idOf('Production'));
    worker = await t.login('sami@lab.sy', 'temporary-1');
    await t.call(
      'POST',
      '/auth/change-password',
      { currentPassword: 'temporary-1', newPassword: 'sami-own-pass' },
      worker,
    );
  });

  afterAll(async () => {
    await t.close();
  });

  it('staff can read the list with worker counts; customers and visitors cannot', async () => {
    const r = await t.call('GET', '/departments', undefined, worker);
    expect(r.status).toBe(200);
    expect(r.body).toContainEqual({
      id: t.departments.idOf('Production'),
      nameEn: 'Production',
      nameAr: 'الإنتاج',
      workerCount: 1,
    });
    const customer = await t.call('POST', '/auth/signup', {
      email: 'client@example.com',
      password: 'long enough',
      fullName: 'Client',
      mobile: '+963911111111',
      dateOfBirth: '1990-01-01',
      governorate: 'homs',
      cityArea: 'Inshaat',
    });
    expect((await t.call('GET', '/departments', undefined, customer.cookie)).status).toBe(403);
    expect((await t.call('GET', '/departments')).status).toBe(401);
  });

  it('a manager adds a department, which can then take workers', async () => {
    const r = await t.call(
      'POST',
      '/departments',
      { nameEn: 'Packaging', nameAr: 'التغليف' },
      manager,
    );
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    expect(r.body).toEqual({ id, nameEn: 'Packaging', nameAr: 'التغليف', workerCount: 0 });
    await addWorker('rami@lab.sy', id);
  });

  it('names are unique, ignoring letter case', async () => {
    const r = await t.call('POST', '/departments', { nameEn: 'quality', nameAr: 'جديد' }, manager);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ issues: [{ path: 'nameEn', message: 'already used' }] });
    const ar = await t.call('POST', '/departments', { nameEn: 'New', nameAr: 'الجودة' }, manager);
    expect(ar.body).toMatchObject({ issues: [{ path: 'nameAr', message: 'already used' }] });
  });

  it('a manager renames a department; workers keep it', async () => {
    const id = t.departments.idOf('Production');
    const r = await t.call('PATCH', `/departments/${id}`, { nameAr: 'خط الإنتاج' }, manager);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id, nameEn: 'Production', nameAr: 'خط الإنتاج', workerCount: 1 });
    const taken = await t.call('PATCH', `/departments/${id}`, { nameEn: 'Maintenance' }, manager);
    expect(taken.status).toBe(409);
    // Renaming to its own name (another letter case) is not a clash with itself.
    expect(
      (await t.call('PATCH', `/departments/${id}`, { nameEn: 'PRODUCTION' }, manager)).status,
    ).toBe(200);
  });

  it('deleting a department that still has workers is refused, with the number of workers', async () => {
    const id = t.departments.idOf('PRODUCTION');
    await addWorker('lina@lab.sy', id);
    const r = await t.call('DELETE', `/departments/${id}`, undefined, manager);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      message: 'cannot delete: 2 workers are in this department',
      code: 'DEPARTMENT_HAS_WORKERS',
      workers: 2,
    });
    expect(t.departments.rows.has(id)).toBe(true);
  });

  it('one worker: the message says so', async () => {
    const id = [...t.departments.rows.values()].find((d) => d.nameEn === 'Packaging')?.id ?? '';
    const r = await t.call('DELETE', `/departments/${id}`, undefined, manager);
    expect(r.body).toMatchObject({ message: 'cannot delete: 1 worker is in this department' });
  });

  it('an empty department is deleted', async () => {
    const id = t.departments.idOf('Maintenance');
    expect((await t.call('DELETE', `/departments/${id}`, undefined, manager)).status).toBe(204);
    expect(t.departments.rows.has(id)).toBe(false);
    expect((await t.call('DELETE', `/departments/${id}`, undefined, manager)).status).toBe(404);
  });

  it('only managers add, rename and delete', async () => {
    const id = t.departments.idOf('Quality');
    expect(
      (await t.call('POST', '/departments', { nameEn: 'X', nameAr: 'س' }, worker)).status,
    ).toBe(403);
    expect((await t.call('PATCH', `/departments/${id}`, { nameEn: 'X' }, worker)).status).toBe(403);
    expect((await t.call('DELETE', `/departments/${id}`, undefined, worker)).status).toBe(403);
  });

  it('refuses incomplete input and unknown ids', async () => {
    expect((await t.call('POST', '/departments', { nameEn: 'Only English' }, manager)).status).toBe(
      400,
    );
    expect(
      (await t.call('PATCH', `/departments/${t.departments.idOf('Quality')}`, {}, manager)).status,
    ).toBe(400);
    expect((await t.call('PATCH', '/departments/not-an-id', { nameEn: 'X' }, manager)).status).toBe(
      404,
    );
  });
});
