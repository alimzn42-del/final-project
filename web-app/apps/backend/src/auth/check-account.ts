import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AuthService } from './auth.service.js';

export const CHECK_ACCOUNT = Symbol('CHECK_ACCOUNT');

/**
 * At startup, creates or updates the automated checks' worker account from CHECK_EMAIL /
 * CHECK_PASSWORD (owner, step 16), so the live checks never use a person's login.
 */
@Injectable()
export class CheckAccountSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger('CheckAccount');

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CHECK_ACCOUNT) private readonly check: { email: string; password: string } | undefined,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.check?.email ?? '';
    const result = await this.auth.seedCheckAccount(this.check);
    if (result === 'created') this.logger.log(`created the checks account: ${email}`);
    if (result === 'updated') this.logger.log(`updated the checks account's password: ${email}`);
    if (result === 'disabled') {
      this.logger.warn(`the checks account ${email} is disabled: the live checks will fail`);
    }
    if (result === 'refused') {
      this.logger.error(`${email} belongs to another account: choose another CHECK_EMAIL`);
    }
    if (result === 'no department') {
      this.logger.warn('no department yet: the checks account is created once one exists');
    }
  }
}
