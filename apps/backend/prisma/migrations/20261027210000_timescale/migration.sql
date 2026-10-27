-- TimescaleDB and checks that Prisma cannot describe (docs/04-architecture.md, "Database").
-- Prisma runs this file as one transaction, so every statement must be allowed in one
-- (the continuous aggregate is therefore created WITH NO DATA; its policy fills it).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Emails are stored lowercase, so the unique index on email also means
-- "unique ignoring case". The database refuses anything else.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- telemetry becomes a hypertable partitioned on received_at, which the backend sets
-- (never a device clock). One chunk per day. TimescaleDB's default time-only index is
-- not created: telemetry_sensor_time_idx (sensor, time) serves the chart queries.
SELECT create_hypertable(
  'telemetry',
  by_range('received_at', INTERVAL '1 day'),
  create_default_indexes => false
);

-- Columnstore (compression) after 1 day. Rows of one sensor are stored together and in
-- time order, which compresses repeated readings very well.
ALTER TABLE "telemetry" SET (
  timescaledb.enable_columnstore,
  timescaledb.segmentby = 'sensor_id',
  timescaledb.orderby = 'received_at DESC'
);
CALL add_columnstore_policy('telemetry', after => INTERVAL '1 day');

-- Raw readings are kept 7 days.
SELECT add_retention_policy('telemetry', drop_after => INTERVAL '7 days');

-- 1-minute summary per sensor (min, max, avg, number of readings), kept 1 year.
-- Bucketed on received_at, like the raw data. The policy refreshes the last 3 hours
-- every minute, well inside the 7 days of raw data, so no summary ever loses its source.
CREATE MATERIALIZED VIEW "telemetry_1m"
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', "received_at") AS "bucket",
  "sensor_id",
  min("value") AS "min",
  max("value") AS "max",
  avg("value") AS "avg",
  count(*) AS "samples"
FROM "telemetry"
GROUP BY "bucket", "sensor_id"
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'telemetry_1m',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute'
);

SELECT add_retention_policy('telemetry_1m', drop_after => INTERVAL '1 year');
