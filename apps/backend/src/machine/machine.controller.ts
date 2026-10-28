import {
  type Department,
  type DepartmentsFile,
  LANGUAGES,
  type Language,
  type LocaleDict,
  type Locales,
  type Machine,
} from '@mixline/shared';
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';

import { Public, Roles } from '../auth/access.js';
import { DEPARTMENTS, LOCALES, MACHINE } from './machine.tokens.js';

/**
 * Serves the line description and the label translations. Both were
 * validated together at startup, so they always match each other.
 */
@Controller()
export class MachineController {
  constructor(
    @Inject(MACHINE) private readonly machine: Machine,
    @Inject(LOCALES) private readonly locales: Locales,
    @Inject(DEPARTMENTS) private readonly departments: DepartmentsFile,
  ) {}

  /**
   * The validated machine.json (defaults applied, e.g. anchor). Staff only:
   * customers never reach line data (doc 03).
   */
  @Get('machine')
  @Roles('manager', 'worker')
  getMachine(): Machine {
    return this.machine;
  }

  /** Worker departments (config/departments.json), for the user page. Managers only. */
  @Get('departments')
  @Roles('manager')
  getDepartments(): Department[] {
    return this.departments.departments;
  }

  /** One locale file: en or ar. Public: the login and sign-up pages need it. */
  @Get('locales/:lang')
  @Public()
  getLocale(@Param('lang') lang: string): LocaleDict {
    if (!isLanguage(lang)) throw new NotFoundException(`no locale "${lang}"`);
    return this.locales[lang];
  }
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
