/**
 * The backend's MQTT connection: subscribes to every sensor topic of the
 * machine and feeds each message to the ingest. Reconnects by itself; a
 * broker that is down never stops the backend.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { connect, type MqttClient } from 'mqtt';

import { BatchWriter } from './batch-writer.js';
import { TelemetryIngest } from './ingest.js';
import { type MqttSettings, MQTT_SETTINGS } from './telemetry.tokens.js';

@Injectable()
export class MqttIntake implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('MqttIntake');
  private client: MqttClient | undefined;

  constructor(
    @Inject(MQTT_SETTINGS) private readonly settings: MqttSettings | undefined,
    @Inject(TelemetryIngest) private readonly ingest: TelemetryIngest,
    @Inject(BatchWriter) private readonly writer: BatchWriter,
  ) {}

  onModuleInit(): void {
    this.writer.start();
    if (!this.settings) {
      this.logger.warn(
        'MQTT is not configured (MQTT_USERNAME / MQTT_PASSWORD): no telemetry intake',
      );
      return;
    }
    const { url, username, password, topics } = this.settings;
    this.client = connect(url, {
      clientId: `mixline-backend-${String(process.pid)}`,
      username,
      password,
      reconnectPeriod: 2000,
    });
    this.client.on('connect', () => {
      this.logger.log(`connected to ${url}`);
      this.client?.subscribe(topics.sensors, { qos: 0 }, (error) => {
        if (error) this.logger.warn(`subscribe failed: ${error.message}`);
      });
    });
    this.client.on('offline', () => {
      this.logger.warn('broker offline, reconnecting');
    });
    this.client.on('error', (error) => {
      this.logger.warn(`MQTT error: ${error.message}`);
    });
    this.client.on('message', (topic, payload) => {
      this.ingest.handle(topic, payload);
    });
  }

  /** Stop listening, then write what is still buffered. */
  async onApplicationShutdown(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }
      this.client.end(false, {}, () => {
        resolve();
      });
    });
    await this.writer.stop();
  }
}
