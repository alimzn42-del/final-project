import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AccessGuard } from './auth/access.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { FIRST_MANAGER, FirstManagerSeed } from './auth/first-manager.js';
import { Sessions } from './auth/session.js';
import type { BackendConfig } from './config.js';
import { DATABASE_URL, PrismaService } from './database/prisma.service.js';
import { HealthController } from './health/health.controller.js';
import { MachineModule } from './machine/machine.module.js';
import type { ConfigFiles } from './machine/machine.tokens.js';
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
  /** Replaces the database user store (HTTP tests run without Docker). */
  userStore?: UserStore | undefined;
  rateLimits?: RateLimits | undefined;
}

/** Root module. Later steps add the telemetry and state modules here. */
@Module({})
export class AppModule {
  static register(options: AppOptions): DynamicModule {
    const limits = options.rateLimits ?? DEFAULT_RATE_LIMITS;
    return {
      module: AppModule,
      imports: [
        MachineModule.register(options.files),
        ThrottlerModule.forRoot([
          { name: 'login', ...limits.login },
          { name: 'signup', ...limits.signup },
        ]),
      ],
      controllers: [HealthController, AuthController, UsersController],
      providers: [
        ...userStoreProviders(options),
        { provide: Sessions, useValue: new Sessions(options.config.session) },
        AuthService,
        { provide: FIRST_MANAGER, useValue: options.config.firstManager },
        FirstManagerSeed,
        // Default deny: runs before every route (see auth/access.ts).
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}

function userStoreProviders(options: AppOptions): Provider[] {
  if (options.userStore) return [{ provide: USER_STORE, useValue: options.userStore }];
  const url = options.config.databaseUrl;
  if (!url) {
    throw new Error(
      'database settings are missing (check .env): set POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB, or DATABASE_URL',
    );
  }
  return [
    { provide: DATABASE_URL, useValue: url },
    PrismaService,
    {
      provide: USER_STORE,
      useFactory: (prisma: PrismaService) => new PrismaUserStore(prisma),
      inject: [PrismaService],
    },
  ];
}
