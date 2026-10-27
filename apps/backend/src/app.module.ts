import { type DynamicModule, Module } from '@nestjs/common';

import { HealthController } from './health/health.controller.js';
import { MachineModule } from './machine/machine.module.js';
import type { ConfigFiles } from './machine/machine.tokens.js';

/** Root module. Later steps add auth, telemetry and state modules here. */
@Module({})
export class AppModule {
  static register(files: ConfigFiles): DynamicModule {
    return {
      module: AppModule,
      imports: [MachineModule.register(files)],
      controllers: [HealthController],
    };
  }
}
