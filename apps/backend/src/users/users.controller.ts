import { type CreateStaffInput, createStaffSchema, type PublicUser } from '@mixline/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Inject,
  Post,
} from '@nestjs/common';

import { CurrentUser, Roles } from '../auth/access.js';
import { AuthService } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DepartmentNotFoundError } from '../departments/department-store.js';
import { EmailTakenError, toPublic } from './user-store.js';

/** /api/users: account management, managers only (the page comes in the last step). */
@Controller('users')
@Roles('manager')
export class UsersController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Creates a manager or worker account. Customers sign up themselves. */
  @Post()
  async create(
    @CurrentUser() manager: PublicUser,
    @Body(new ZodPipe(createStaffSchema)) input: CreateStaffInput,
  ): Promise<PublicUser> {
    try {
      return toPublic(await this.auth.createStaff(manager, input));
    } catch (error) {
      if (error instanceof EmailTakenError) throw new ConflictException('email already registered');
      if (error instanceof DepartmentNotFoundError) {
        throw new BadRequestException({
          message: 'invalid request',
          issues: [{ path: 'departmentId', message: 'unknown department' }],
        });
      }
      throw error;
    }
  }
}
