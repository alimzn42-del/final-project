import { type DynamicModule, Module } from '@nestjs/common';

import { DATABASE_URL, PrismaService } from './prisma.service.js';

/** The database connection, shared by every module that stores data. */
@Module({})
export class DatabaseModule {
  static register(url: string): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [{ provide: DATABASE_URL, useValue: url }, PrismaService],
      exports: [PrismaService],
    };
  }
}
