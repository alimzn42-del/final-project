/** Injection tokens and settings for the telemetry module. */

export const MQTT_SETTINGS = Symbol('MQTT_SETTINGS');
export const CLOCK_TOLERANCE_MS = Symbol('CLOCK_TOLERANCE_MS');

export interface MqttSettings {
  url: string;
  username: string;
  password: string;
  /** Subscription patterns built from machine.json (site, machine). */
  topics: { sensors: string };
}
