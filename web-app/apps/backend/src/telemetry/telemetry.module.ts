import { type Machine, subscriptions } from '@mixline/shared';
import { type DynamicModule, Logger, Module, type Provider } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { MACHINE } from '../machine/machine.tokens.js';
import { BatchWriter } from './batch-writer.js';
import { TelemetryIngest } from './ingest.js';
import { MqttIntake } from './mqtt-intake.service.js';
import { PrismaTelemetryStore } from './prisma-telemetry-store.js';
import { TelemetryController } from './telemetry.controller.js';
import { TELEMETRY_STORE, type TelemetryStore } from './telemetry-store.js';
import { CLOCK_TOLERANCE_MS, MQTT_SETTINGS } from './telemetry.tokens.js';

export interface TelemetryOptions {
  /** Broker login; undefined = no intake (logged as a warning). */
  mqtt: { url: string; username: string; password: string } | undefined;
  clockToleranceMs: number;
  /** Replaces the database store (HTTP tests run without Docker). */
  store?: TelemetryStore | undefined;
}

/** MQTT intake -> batched database writes, latest values, history (step 9). */
@Module({})
export class TelemetryModule {
  static register(options: TelemetryOptions): DynamicModule {
    const store: Provider = options.store
      ? { provide: TELEMETRY_STORE, useValue: options.store }
      : {
          provide: TELEMETRY_STORE,
          useFactory: (prisma: PrismaService) => new PrismaTelemetryStore(prisma),
          inject: [PrismaService],
        };
    return {
      module: TelemetryModule,
      controllers: [TelemetryController],
      providers: [
        store,
        { provide: CLOCK_TOLERANCE_MS, useValue: options.clockToleranceMs },
        {
          provide: MQTT_SETTINGS,
          useFactory: (machine: Machine) =>
            options.mqtt && {
              ...options.mqtt,
              topics: { sensors: subscriptions(machine).sensors },
            },
          inject: [MACHINE],
        },
        {
          provide: BatchWriter,
          useFactory: (s: TelemetryStore) => new BatchWriter(s, new Logger('TelemetryWriter')),
          inject: [TELEMETRY_STORE],
        },
        {
          provide: TelemetryIngest,
          useFactory: (machine: Machine, writer: BatchWriter) =>
            new TelemetryIngest(
              machine,
              (row) => {
                writer.add(row);
              },
              options.clockToleranceMs,
              new Logger('Telemetry'),
            ),
          inject: [MACHINE, BatchWriter],
        },
        MqttIntake,
      ],
      // The state and live modules read the latest values from memory.
      exports: [TelemetryIngest],
    };
  }
}
