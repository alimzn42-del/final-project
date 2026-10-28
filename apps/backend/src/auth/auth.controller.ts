import {
  type ChangePasswordInput,
  changePasswordSchema,
  type LoginInput,
  loginSchema,
  type PublicUser,
  type SignupInput,
  signupSchema,
  type UpdateMeInput,
  updateMeSchema,
} from '@mixline/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ZodPipe } from '../common/zod.pipe.js';
import {
  EmailTakenError,
  type StoredUser,
  toPublic,
  USER_STORE,
  type UserStore,
} from '../users/user-store.js';
import { AllowDuringPasswordChange, CurrentSession, CurrentUser, Public } from './access.js';
import { AuthService, WrongPasswordError } from './auth.service.js';
import { readCookie, type Session, SESSION_COOKIE, Sessions } from './session.js';

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

  /**
   * Ends this session on the server (a copied token stops working, its live
   * connection is closed) and clears the cookie. Public, so an expired
   * session can still be cleared.
   */
  @Post('logout')
  @HttpCode(204)
  @Public()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.end(readCookie(req.headers.cookie, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, this.sessions.clearCookieOptions());
  }

  @Get('me')
  @AllowDuringPasswordChange()
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  /**
   * Changes my password (and ends a temporary one). Logs out my other devices;
   * this one stays logged in (owner, step 11). Counted under the login rate
   * limit, since it also checks a password.
   */
  @Post('change-password')
  @HttpCode(200)
  @AllowDuringPasswordChange()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ signup: true })
  async changePassword(
    @CurrentUser() user: PublicUser,
    @CurrentSession() session: Session,
    @Body(new ZodPipe(changePasswordSchema)) input: ChangePasswordInput,
  ): Promise<PublicUser> {
    try {
      const changed = toPublic(await this.auth.changePassword(user.id, input));
      await this.sessions.endOthers(session);
      return changed;
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        throw new BadRequestException({
          message: 'invalid request',
          issues: [{ path: 'currentPassword', message: 'wrong password' }],
        });
      }
      throw error;
    }
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
    res.cookie(SESSION_COOKIE, await this.sessions.start(user.id), this.sessions.cookieOptions());
  }
}
