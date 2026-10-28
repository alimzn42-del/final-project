import { type DynamicModule, Module } from '@nestjs/common';

import { MachineController } from './machine.controller.js';
import { type ConfigFiles, LOCALES, MACHINE } from './machine.tokens.js';

/**
 * The line description (machine.json) and the locale files. They are loaded
 * and validated before the app starts (see bootstrap.ts) and handed in here.
 */
@Module({})
export class MachineModule {
  static register(files: ConfigFiles): DynamicModule {
    return {
      module: MachineModule,
      global: true,
      controllers: [MachineController],
      providers: [
        { provide: MACHINE, useValue: files.machine },
        { provide: LOCALES, useValue: files.locales },
      ],
      exports: [MACHINE, LOCALES],
    };
  }
}
