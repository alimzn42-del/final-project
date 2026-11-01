import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

export const DATABASE_URL = Symbol('DATABASE_URL');

/**
 * The database connection (Prisma 7 with the node-postgres driver adapter).
 * Closed when the app shuts down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(DATABASE_URL) url: string) {
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
