import { Controller, Get } from '@nestjs/common';

/** Liveness check for Docker and monitoring: answers while the app runs. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
