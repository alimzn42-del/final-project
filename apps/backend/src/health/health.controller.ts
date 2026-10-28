import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/access.js';

/** Liveness check for Docker and monitoring: answers while the app runs. */
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
