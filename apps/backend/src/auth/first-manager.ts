import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AuthService } from './auth.service.js';

export const FIRST_MANAGER = Symbol('FIRST_MANAGER');

/**
 * At startup, creates the first manager from MANAGER_EMAIL / MANAGER_PASSWORD
 * if no manager exists yet (doc 03). An existing account is never changed.
 */
@Injectable()
export class FirstManagerSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger('FirstManager');

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(FIRST_MANAGER) private readonly first: { email: string; password: string } | undefined,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.auth.seedFirstManager(this.first);
    if (result === 'created') {
      this.logger.log(`created the first manager: ${this.first?.email ?? ''}`);
    }
    if (result === 'not configured') {
      this.logger.warn('no manager account yet: set MANAGER_EMAIL and MANAGER_PASSWORD in .env');
    }
  }
}
