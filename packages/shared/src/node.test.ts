import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rawLocales, rawMachine, sensor } from './__fixtures__/config.js';
import { loadConfigFiles, loadDepartmentsFile, loadMachineFile, readJsonFile } from './node.js';

const configDir = fileURLToPath(new URL('../../../config/', import.meta.url));
const machinePath = join(configDir, 'machine.json');
const localesDir = join(configDir, 'locales');

describe('node file loaders', () => {
  it('loads and validates the real config files together', () => {
    const { machine, locales } = loadConfigFiles(machinePath, localesDir);
    expect(machine.components).toHaveLength(103);
    expect(locales.en['part.vessel']).toBe('Mixing vessel');
    expect(locales.ar['part.vessel']).toBe('وعاء الخلط');
  });

  it('loads machine.json alone', () => {
    expect(loadMachineFile(machinePath).site).toBe('lab');
  });

  it('names the file it cannot read', () => {
    expect(() => readJsonFile(join(configDir, 'nope.json'))).toThrow(/cannot read .*nope\.json/);
  });

  it('lists every problem across machine.json and the locale files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixline-config-'));
    const m = rawMachine();
    sensor(m, 'dyeM.mass').station = 'dye_c';
    const { en, ar } = rawLocales();
    delete ar['part.camera'];
    writeFileSync(join(dir, 'machine.json'), JSON.stringify(m));
    writeFileSync(join(dir, 'en.json'), JSON.stringify(en));
    writeFileSync(join(dir, 'ar.json'), JSON.stringify(ar));

    expect(() => loadConfigFiles(join(dir, 'machine.json'), dir)).toThrow(
      /problem\(s\)[\s\S]*dye_c\/sensors\/mass[\s\S]*part\.camera/,
    );
  });
});

describe('loadDepartmentsFile', () => {
  it('loads the real file', () => {
    const { locales } = loadConfigFiles(machinePath, localesDir);
    const file = loadDepartmentsFile(join(configDir, 'departments.json'), locales);
    expect(file.departments).toHaveLength(3);
  });

  it('lists every problem in one error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixline-departments-'));
    writeFileSync(
      join(dir, 'departments.json'),
      JSON.stringify({
        departments: [
          { id: 'quality', labelKey: 'department.nope' },
          { id: 'quality', labelKey: 'department.quality' },
        ],
      }),
    );
    const { locales } = loadConfigFiles(machinePath, localesDir);
    expect(() => loadDepartmentsFile(join(dir, 'departments.json'), locales)).toThrow(
      /departments\.json is invalid \(3 problem\(s\)\)/,
    );
  });
});
