import type { StateSnapshot } from '@mixline/shared';
import { Controller, Get, Inject } from '@nestjs/common';

import { Roles } from '../auth/access.js';
import { StateService } from './state.service.js';

/**
 * /api/state: the state of every sensor, part, sub-section, section and the
 * line, as the live push has it. Staff only, like /api/telemetry.
 */
@Controller('state')
@Roles('manager', 'worker')
export class StateController {
  constructor(@Inject(StateService) private readonly state: StateService) {}

  @Get()
  current(): StateSnapshot {
    return this.state.current();
  }
}
