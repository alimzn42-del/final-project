import {
  type CreateDepartmentInput,
  createDepartmentSchema,
  type Department,
  type RenameDepartmentInput,
  renameDepartmentSchema,
} from '@mixline/shared';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { Roles } from '../auth/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  DepartmentHasWorkersError,
  DepartmentNameTakenError,
  DepartmentNotFoundError,
} from './department-store.js';
import { DepartmentsService } from './departments.service.js';

/**
 * /api/departments (owner, step 9). Everyone on staff can read the list (a
 * worker's own department name); only managers add, rename and delete.
 */
@Controller('departments')
export class DepartmentsController {
  constructor(@Inject(DepartmentsService) private readonly departments: DepartmentsService) {}

  @Get()
  @Roles('manager', 'worker')
  list(): Promise<Department[]> {
    return this.departments.list();
  }

  @Post()
  @Roles('manager')
  create(
    @Body(new ZodPipe(createDepartmentSchema)) input: CreateDepartmentInput,
  ): Promise<Department> {
    return answer(() => this.departments.create(input));
  }

  @Patch(':id')
  @Roles('manager')
  rename(
    @Param('id') id: string,
    @Body(new ZodPipe(renameDepartmentSchema)) input: RenameDepartmentInput,
  ): Promise<Department> {
    return answer(() => this.departments.rename(id, input));
  }

  /** Refused with 409 and the number of workers while the department has any. */
  @Delete(':id')
  @HttpCode(204)
  @Roles('manager')
  async delete(@Param('id') id: string): Promise<void> {
    await answer(() => this.departments.delete(id));
  }
}

/** Turns department errors into HTTP answers. */
async function answer<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DepartmentNotFoundError) throw new NotFoundException('no such department');
    if (error instanceof DepartmentNameTakenError) {
      throw new ConflictException({
        message: 'department name already used',
        issues: [{ path: error.field, message: 'already used' }],
      });
    }
    if (error instanceof DepartmentHasWorkersError) {
      throw new ConflictException({
        message: error.message,
        code: 'DEPARTMENT_HAS_WORKERS',
        workers: error.workers,
      });
    }
    throw error;
  }
}
