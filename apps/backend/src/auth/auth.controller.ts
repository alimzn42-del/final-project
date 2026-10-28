import {
  type LoginInput,
  loginSchema,
  type PublicUser,
  type SignupInput,
  signupSchema,
  type UpdateMeInput,
  updateMeSchema,
} from '@mixline/shared';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';

import { ZodPipe } from '../common/zod.pipe.js';
import {
  EmailTakenError,
  type StoredUser,
  toPublic,
  USER_STORE,
  type UserStore,
} from '../users/user-store.js';
import { CurrentUser, Public } from './access.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, Sessions } from './session.js';

/**
 * /api/auth: sign-up (customers only), login, logout, and the logged-in
 * user's own account. Login and sign-up are rate-limited per address.
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Sessions) private readonly sessions: Sessions,
    @Inject(USER_STORE) private readonly users: UserStore,
  ) {}

  /** Creates a customer and logs them in. */
  @Post('signup')
  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ login: true })
  async signup(
    @Body(new ZodPipe(signupSchema)) input: SignupInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    let user: StoredUser;
    try {
      user = await this.auth.signup(input);
    } catch (error) {
      if (error instanceof EmailTakenError) throw new ConflictException('email already registered');
      throw error;
    }
    await this.startSession(res, user);
    return toPublic(user);
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ signup: true })
  async login(
    @Body(new ZodPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const user = await this.auth.login(input);
    // One message for both cases: do not reveal which emails have accounts.
    if (!user) throw new UnauthorizedException('wrong email or password');
    await this.startSession(res, user);
    return toPublic(user);
  }

  /** Public, so an expired session can still be cleared. */
  @Post('logout')
  @HttpCode(204)
  @Public()
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.sessions.clearCookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  /** Remembers the user's language (doc 03: remembered per user). */
  @Patch('me')
  async updateMe(
    @CurrentUser() user: PublicUser,
    @Body(new ZodPipe(updateMeSchema)) input: UpdateMeInput,
  ): Promise<PublicUser> {
    return toPublic(await this.users.setLocale(user.id, input.locale));
  }

  private async startSession(res: Response, user: StoredUser): Promise<void> {
    res.cookie(SESSION_COOKIE, await this.sessions.sign(user.id), this.sessions.cookieOptions());
  }
}
