/**
 * Access rules. Default deny: every route needs a logged-in user unless it is
 * marked @Public(), so a route added later without thinking about access is
 * closed, not open. @Roles(...) narrows a route to some roles.
 */
import type { PublicUser, Role } from '@mixline/shared';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { toPublic, USER_STORE, type UserStore } from '../users/user-store.js';
import { readCookie, SESSION_COOKIE, Sessions } from './session.js';

const IS_PUBLIC = 'mixline:public';
const ROLES = 'mixline:roles';
const DURING_PASSWORD_CHANGE = 'mixline:duringPasswordChange';

/** Anyone may call this route, logged in or not. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call this route. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/**
 * Allowed while the user still has a temporary password (owner, step 9). Every
 * other route answers 403 PASSWORD_CHANGE_REQUIRED until the password is changed.
 */
export const AllowDuringPasswordChange = () => SetMetadata(DURING_PASSWORD_CHANGE, true);

/** The 403 answer while a temporary password is still in use; the frontend checks the code. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export type AuthedRequest = Request & { user?: PublicUser };

/** The logged-in user (on routes that require a login). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});

/**
 * Runs before every route. Reads the session cookie, re-reads the user from
 * the database (so a deleted user or a changed role counts at once), then
 * applies @Public and @Roles.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const userId = await this.sessions.verify(readCookie(req.headers.cookie, SESSION_COOKIE));
    const user = userId ? await this.users.findById(userId) : undefined;
    if (user) req.user = toPublic(user);

    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;
    if (!user) throw new UnauthorizedException('login required');

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean | undefined>(DURING_PASSWORD_CHANGE, targets)
    ) {
      throw new ForbiddenException({
        message: 'password change required',
        code: PASSWORD_CHANGE_REQUIRED,
      });
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('not allowed for this role');
    }
    return true;
  }
}
