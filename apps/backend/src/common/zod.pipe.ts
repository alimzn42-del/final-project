import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a request body with a shared zod schema. On failure: 400 with
 * every problem, by field, so the frontend form can show each one.
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      message: 'invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
}
