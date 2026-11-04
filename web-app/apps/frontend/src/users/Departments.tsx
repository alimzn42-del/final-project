/**
 * Departments (owner, step 9): an English and an Arabic name each; managers add, rename and
 * delete them. A department that still has workers cannot be deleted; the page says how many.
 */
import { createDepartmentSchema, type Department, renameDepartmentSchema } from '@mixline/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, invalidFields } from '../api/http';
import { fieldErrors } from '../forms/errors';
import { Field, TextInput } from '../forms/Field';
import formStyles from '../forms/forms.module.css';
import { useSession } from '../session/session';
import { cx } from '../ui/cx';
import { departmentName, problemKey, workersBlocking } from './accounts';
import styles from './users.module.css';

interface Props {
  departments: Department[];
  onChanged: (message: string) => void;
}

/** Names already used come back as 409 with the field; other problems as a sentence. */
function nameProblems(error: unknown, t: (key: string) => string): Record<string, string> {
  if (error instanceof ApiError && error.status === 409) {
    const issues = (error.body as { issues?: { path?: unknown }[] } | undefined)?.issues ?? [];
    return Object.fromEntries(
      issues.flatMap((i) => (typeof i.path === 'string' ? [[i.path, t('error.nameTaken')]] : [])),
    );
  }
  return Object.fromEntries(invalidFields(error).map((f) => [f, t('error.invalid')]));
}

export function Departments({ departments, onChanged }: Props) {
  const { t } = useTranslation();
  const { call } = useSession();
  const [values, setValues] = useState({ nameEn: '', nameAr: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function add() {
    setProblem(undefined);
    const parsed = createDepartmentSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, values, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await call(() => api('POST', '/departments', parsed.data));
      setValues({ nameEn: '', nameAr: '' });
      onChanged(t('departments.added', { name: parsed.data.nameEn }));
    } catch (error) {
      const named = nameProblems(error, t);
      if (Object.keys(named).length) setErrors(named);
      else setProblem(t(problemKey(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="departments-title">
      <h2 id="departments-title" className={styles.sectionTitle}>
        {t('departments.title')}
      </h2>
      <ul className={styles.list}>
        {departments.map((d) => (
          <DepartmentRow key={d.id} department={d} onChanged={onChanged} />
        ))}
      </ul>
      <form
        className={cx(styles.form, styles.inlineForm)}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field id="department-nameEn" label={t('field.nameEn')} error={errors.nameEn}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              ltr
              value={values.nameEn}
              onChange={(v) => {
                setValues((old) => ({ ...old, nameEn: v }));
              }}
            />
          )}
        </Field>
        <Field id="department-nameAr" label={t('field.nameAr')} error={errors.nameAr}>
          {(a11y) => (
            <TextInput
              a11y={a11y}
              value={values.nameAr}
              onChange={(v) => {
                setValues((old) => ({ ...old, nameAr: v }));
              }}
            />
          )}
        </Field>
        {problem && (
          <p className={formStyles.alert} role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className={styles.primary} disabled={busy}>
          {t('departments.add')}
        </button>
      </form>
    </section>
  );
}

type Mode = 'idle' | 'rename' | 'confirmDelete';

function DepartmentRow({
  department,
  onChanged,
}: {
  department: Department;
  onChanged: Props['onChanged'];
}) {
  const { t, i18n } = useTranslation();
  const { call } = useSession();
  const [mode, setMode] = useState<Mode>('idle');
  const [names, setNames] = useState({ nameEn: department.nameEn, nameAr: department.nameAr });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const id = department.id;
  const name = departmentName(department, i18n.language);
  const other = i18n.language === 'ar' ? department.nameEn : department.nameAr;

  async function run(request: () => Promise<unknown>, done: string) {
    setProblem(undefined);
    setBusy(true);
    try {
      await call(request);
      setMode('idle');
      onChanged(done);
    } catch (error) {
      const workers = workersBlocking(error);
      const named = nameProblems(error, t);
      if (workers !== undefined) setProblem(t('departments.hasWorkers', { count: workers }));
      else if (Object.keys(named).length) setErrors(named);
      else setProblem(t(problemKey(error)));
    } finally {
      setBusy(false);
    }
  }

  function rename() {
    // Send only the names that changed.
    const changed = {
      nameEn: names.nameEn !== department.nameEn ? names.nameEn : undefined,
      nameAr: names.nameAr !== department.nameAr ? names.nameAr : undefined,
    };
    const parsed = renameDepartmentSchema.safeParse(changed);
    if (!parsed.success) {
      if (changed.nameEn === undefined && changed.nameAr === undefined) setMode('idle');
      else setErrors(fieldErrors(parsed.error.issues, names, t));
      return;
    }
    setErrors({});
    void run(() => api('PATCH', `/departments/${id}`, parsed.data), t('departments.renamed'));
  }

  return (
    <li className={styles.row} aria-labelledby={`department-${id}`}>
      <div className={styles.who}>
        <span id={`department-${id}`} className={styles.name}>
          {name}
        </span>
        <span className={styles.email}>{other}</span>
      </div>
      <span className={styles.role}>
        {t('departments.workers', { count: department.workerCount })}
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-expanded={mode === 'rename'}
          onClick={() => {
            setNames({ nameEn: department.nameEn, nameAr: department.nameAr });
            setMode(mode === 'rename' ? 'idle' : 'rename');
          }}
        >
          {t('departments.rename')}
        </button>
        <button
          type="button"
          className={cx(styles.button, styles.danger)}
          aria-expanded={mode === 'confirmDelete'}
          onClick={() => {
            setMode(mode === 'confirmDelete' ? 'idle' : 'confirmDelete');
          }}
        >
          {t('departments.delete')}
        </button>
      </div>

      {mode === 'rename' && (
        <form
          className={styles.inline}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <Field id={`rename-en-${id}`} label={t('field.nameEn')} error={errors.nameEn}>
            {(a11y) => (
              <TextInput
                a11y={a11y}
                ltr
                value={names.nameEn}
                onChange={(v) => {
                  setNames((old) => ({ ...old, nameEn: v }));
                }}
              />
            )}
          </Field>
          <Field id={`rename-ar-${id}`} label={t('field.nameAr')} error={errors.nameAr}>
            {(a11y) => (
              <TextInput
                a11y={a11y}
                value={names.nameAr}
                onChange={(v) => {
                  setNames((old) => ({ ...old, nameAr: v }));
                }}
              />
            )}
          </Field>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {t('ui.save')}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setMode('idle');
              }}
            >
              {t('ui.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'confirmDelete' && (
        <div className={styles.inline} role="group" aria-labelledby={`delete-${id}`}>
          <p id={`delete-${id}`} className={styles.confirm}>
            {t('departments.confirmDelete', { name })}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={cx(styles.primary, styles.dangerPrimary)}
              disabled={busy}
              onClick={() => {
                void run(
                  () => api('DELETE', `/departments/${id}`),
                  t('departments.deleted', { name }),
                );
              }}
            >
              {t('departments.delete')}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setMode('idle');
              }}
            >
              {t('ui.cancel')}
            </button>
          </div>
        </div>
      )}

      {problem && (
        <p className={formStyles.alert} role="alert">
          {problem}
        </p>
      )}
    </li>
  );
}
