import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AccessGuard } from './auth/access.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { FIRST_MANAGER, FirstManagerSeed } from './auth/first-manager.js';
import { Sessions } from './auth/session.js';
import type { BackendConfig } from './config.js';
import { DatabaseModule } from './database/database.module.js';
import { PrismaService } from './database/prisma.service.js';
import { HealthController } from './health/health.controller.js';
import { MachineModule } from './machine/machine.module.js';
import type { ConfigFiles } from './machine/machine.tokens.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import type { TelemetryStore } from './telemetry/telemetry-store.js';
import { DEPARTMENT_STORE, type DepartmentStore } from './departments/department-store.js';
import { DepartmentsController } from './departments/departments.controller.js';
import { DepartmentsService } from './departments/departments.service.js';
import { PrismaDepartmentStore } from './departments/prisma-department-store.js';
import { PrismaUserStore } from './users/prisma-user-store.js';
import { USER_STORE, type UserStore } from './users/user-store.js';
import { UsersController } from './users/users.controller.js';

/** Requests allowed per address in a time window (ttl in ms). */
export interface RateLimits {
  login: { limit: number; ttl: number };
  signup: { limit: number; ttl: number };
}

/** Login: 10 a minute. Sign-up: 20 an hour (a kiosk is one address for many customers). */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  login: { limit: 10, ttl: 60_000 },
  signup: { limit: 20, ttl: 3_600_000 },
};

export interface AppOptions {
  files: ConfigFiles;
  config: BackendConfig;
  /** Replace the database stores (HTTP tests run without Docker). */
  userStore?: UserStore | undefined;
  departmentStore?: DepartmentStore | undefined;
  telemetryStore?: TelemetryStore | undefined;
  rateLimits?: RateLimits | undefined;
}

/** Root module. Step 10 adds the WebSocket push and state modules here. */
@Module({})
export class AppModule {
  static register(options: AppOptions): DynamicModule {
    const limits = options.rateLimits ?? DEFAULT_RATE_LIMITS;
    const { config } = options;
    return {
      module: AppModule,
      imports: [
        ...databaseImports(options),
        MachineModule.register(options.files),
        ThrottlerModule.forRoot([
          { name: 'login', ...limits.login },
          { name: 'signup', ...limits.signup },
        ]),
        TelemetryModule.register({
          mqtt: config.mqtt,
          clockToleranceMs: config.clockToleranceMs,
          store: options.telemetryStore,
        }),
      ],
      controllers: [HealthController, AuthController, UsersController, DepartmentsController],
      providers: [
        userStoreProvider(options),
        departmentStoreProvider(options),
        DepartmentsService,
        { provide: Sessions, useValue: new Sessions(config.session) },
        AuthService,
        { provide: FIRST_MANAGER, useValue: config.firstManager },
        FirstManagerSeed,
        // Default deny: runs before every route (see auth/access.ts).
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}

/** The database is needed unless every store is replaced (tests). */
function databaseImports(options: AppOptions): DynamicModule[] {
  if (options.userStore && options.departmentStore && options.telemetryStore) return [];
  const url = options.config.databaseUrl;
  if (!url) {
    throw new Error(
      'database settings are missing (check .env): set POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB, or DATABASE_URL',
    );
  }
  return [DatabaseModule.register(url)];
}

function userStoreProvider(options: AppOptions): Provider {
  if (options.userStore) return { provide: USER_STORE, useValue: options.userStore };
  return {
    provide: USER_STORE,
    useFactory: (prisma: PrismaService) => new PrismaUserStore(prisma),
    inject: [PrismaService],
  };
}

function departmentStoreProvider(options: AppOptions): Provider {
  if (options.departmentStore) {
    return { provide: DEPARTMENT_STORE, useValue: options.departmentStore };
  }
  return {
    provide: DEPARTMENT_STORE,
    useFactory: (prisma: PrismaService) => new PrismaDepartmentStore(prisma),
    inject: [PrismaService],
  };
}
