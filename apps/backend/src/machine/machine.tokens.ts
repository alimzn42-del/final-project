import type { DepartmentsFile, Locales, Machine } from '@mixline/shared';

/** Injection tokens for the validated config files, loaded once at startup. */
export const MACHINE = Symbol('MACHINE');
export const LOCALES = Symbol('LOCALES');
export const DEPARTMENTS = Symbol('DEPARTMENTS');

export interface ConfigFiles {
  machine: Machine;
  locales: Locales;
  departments: DepartmentsFile;
}
