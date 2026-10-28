import {
  HISTORY_DEFAULT_MS,
  HISTORY_MAX_MS,
  type HistoryResponse,
  historyResolution,
  type LatestReading,
  type Machine,
} from '@mixline/shared';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { Roles } from '../auth/access.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MACHINE } from '../machine/machine.tokens.js';
import { TelemetryIngest } from './ingest.js';
import { TELEMETRY_STORE, type TelemetryStore } from './telemetry-store.js';
import { CLOCK_TOLERANCE_MS } from './telemetry.tokens.js';

const historyQuery = z.strictObject({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

/**
 * /api/telemetry: live and past sensor values. Staff only: customers never
 * reach line data (doc 03).
 */
@Controller('telemetry')
@Roles('manager', 'worker')
export class TelemetryController {
  private readonly sensorIds: Set<string>;

  constructor(
    @Inject(TelemetryIngest) private readonly ingest: TelemetryIngest,
    @Inject(TELEMETRY_STORE) private readonly store: TelemetryStore,
    @Inject(CLOCK_TOLERANCE_MS) private readonly toleranceMs: number,
    @Inject(MACHINE) machine: Machine,
  ) {
    this.sensorIds = new Set(machine.components.flatMap((c) => c.sensors.map((s) => s.id)));
  }

  /** The latest value of every sensor heard so far (from memory, no database). */
  @Get('latest')
  latest(): { sensors: Record<string, LatestReading> } {
    return { sensors: this.ingest.latest() };
  }

  /**
   * One sensor's history. Default: the last 5 minutes. Up to 1 hour comes from
   * raw readings, longer spans (max 7 days) from the 1-minute summary.
   */
  @Get(':sensorId')
  async history(
    @Param('sensorId') sensorId: string,
    @Query(new ZodPipe(historyQuery)) query: z.infer<typeof historyQuery>,
  ): Promise<HistoryResponse> {
    if (!this.sensorIds.has(sensorId)) throw new NotFoundException(`no sensor "${sensorId}"`);
    const to = query.to ? Date.parse(query.to) : Date.now();
    const from = query.from ? Date.parse(query.from) : to - HISTORY_DEFAULT_MS;
    if (from >= to) throw new BadRequestException('"from" must be before "to"');
    if (to - from > HISTORY_MAX_MS) throw new BadRequestException('at most 7 days per request');

    const result = await this.store.history({
      sensorId,
      from: new Date(from),
      to: new Date(to),
      resolution: historyResolution(from, to),
      toleranceMs: this.toleranceMs,
    });
    const span = { sensorId, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    if (result.resolution === 'raw') {
      return {
        ...span,
        resolution: 'raw',
        points: result.points.map((p) => ({ t: p.t.toISOString(), v: p.v })),
      };
    }
    return {
      ...span,
      resolution: '1m',
      points: result.points.map((p) => ({
        t: p.t.toISOString(),
        min: p.min,
        max: p.max,
        avg: p.avg,
      })),
    };
  }
}
