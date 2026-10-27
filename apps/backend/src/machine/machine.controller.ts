import {
  LANGUAGES,
  type Language,
  type LocaleDict,
  type Locales,
  type Machine,
} from '@mixline/shared';
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';

import { LOCALES, MACHINE } from './machine.tokens.js';

/**
 * Serves the line description and the label translations. Both were
 * validated together at startup, so they always match each other.
 */
@Controller()
export class MachineController {
  constructor(
    @Inject(MACHINE) private readonly machine: Machine,
    @Inject(LOCALES) private readonly locales: Locales,
  ) {}

  /** The validated machine.json (defaults applied, e.g. anchor). */
  @Get('machine')
  getMachine(): Machine {
    return this.machine;
  }

  /** One locale file: en or ar. */
  @Get('locales/:lang')
  getLocale(@Param('lang') lang: string): LocaleDict {
    if (!isLanguage(lang)) throw new NotFoundException(`no locale "${lang}"`);
    return this.locales[lang];
  }
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
