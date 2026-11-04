import {
  ACCOUNT_CODES,
  type ChangeDepartmentInput,
  changeDepartmentSchema,
  type CreateStaffInput,
  createStaffSchema,
  type PublicUser,
  type StaffMember,
  type TemporaryPasswordInput,
  temporaryPasswordSchema,
} from '@mixline/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { CurrentUser, Roles } from '../auth/access.js';
import { AuthService } from '../auth/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DepartmentNotFoundError } from '../departments/department-store.js';
import { StaffService } from './staff.service.js';
import {
  ActorNotActiveError,
  CannotDisableSelfError,
  EmailTakenError,
  LastActiveManagerError,
  NotAWorkerError,
  StaffNotFoundError,
  toPublic,
} from './user-store.js';

/**
 * /api/users: staff account management, managers only (owner, steps 9 and 16). Customers are
 * not listed or managed here (they get their own section later). Every change is recorded in
 * the audit log; no action may leave the line without an active manager.
 */
@Controller('users')
@Roles('manager')
export class UsersController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  /** Managers and workers, managers first. */
  @Get()
  list(): Promise<StaffMember[]> {
    return this.staff.list();
  }

  /** Creates a manager or worker account. Customers sign up themselves. */
  @Post()
  async create(
    @CurrentUser() manager: PublicUser,
    @Body(new ZodPipe(createStaffSchema)) input: CreateStaffInput,
  ): Promise<PublicUser> {
    return toPublic(await answer(() => this.auth.createStaff(manager, input)));
  }

  /** Moves a worker to another department. Their sessions continue (doc 05). */
  @Patch(':id/department')
  setDepartment(
    @CurrentUser() manager: PublicUser,
    @Param('id') id: string,
    @Body(new ZodPipe(changeDepartmentSchema)) input: ChangeDepartmentInput,
  ): Promise<StaffMember> {
    return answer(() => this.staff.setDepartment(manager.id, id, input.departmentId));
  }

  /** A new temporary password: changed at the next login; ends all their sessions. */
  @Post(':id/temporary-password')
  @HttpCode(200)
  issueTemporaryPassword(
    @CurrentUser() manager: PublicUser,
    @Param('id') id: string,
    @Body(new ZodPipe(temporaryPasswordSchema)) input: TemporaryPasswordInput,
  ): Promise<StaffMember> {
    return answer(() => this.staff.issueTemporaryPassword(manager.id, id, input.password));
  }

  /** No more login; ends all their sessions. Never yourself, never the last active manager. */
  @Post(':id/disable')
  @HttpCode(200)
  disable(@CurrentUser() manager: PublicUser, @Param('id') id: string): Promise<StaffMember> {
    return answer(() => this.staff.disable(manager.id, id));
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@CurrentUser() manager: PublicUser, @Param('id') id: string): Promise<StaffMember> {
    return answer(() => this.staff.enable(manager.id, id));
  }
}

/** Turns account errors into HTTP answers with a code the page can explain. */
async function answer<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof EmailTakenError) throw new ConflictException('email already registered');
    if (error instanceof StaffNotFoundError) throw new NotFoundException('no such staff account');
    if (error instanceof DepartmentNotFoundError) {
      throw new BadRequestException({
        message: 'invalid request',
        issues: [{ path: 'departmentId', message: 'unknown department' }],
      });
    }
    if (error instanceof NotAWorkerError) {
      throw new BadRequestException({
        message: 'only workers have a department',
        code: ACCOUNT_CODES.notAWorker,
      });
    }
    if (error instanceof CannotDisableSelfError) {
      throw new ConflictException({
        message: 'you cannot disable your own account',
        code: ACCOUNT_CODES.cannotDisableSelf,
      });
    }
    if (error instanceof LastActiveManagerError) {
      throw new ConflictException({
        message: 'the line must keep at least one active manager',
        code: ACCOUNT_CODES.lastActiveManager,
      });
    }
    if (error instanceof ActorNotActiveError) {
      throw new ForbiddenException({ message: 'account disabled', code: ACCOUNT_CODES.disabled });
    }
    throw error;
  }
}
