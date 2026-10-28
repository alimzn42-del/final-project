-- Compress the 1-minute summary after 7 days (owner, step 9). Measured: the
-- summary grows by about 14 MB a day uncompressed and is kept 1 year (~5 GB);
-- raw readings compressed 19x in the same test. 7 days is well beyond the
-- refresh window (3 hours), so compressed buckets are never refreshed again.
ALTER MATERIALIZED VIEW "telemetry_1m" SET (
  timescaledb.enable_columnstore = true,
  timescaledb.segmentby = 'sensor_id',
  timescaledb.orderby = 'bucket DESC'
);
CALL add_columnstore_policy('telemetry_1m', after => INTERVAL '7 days');
