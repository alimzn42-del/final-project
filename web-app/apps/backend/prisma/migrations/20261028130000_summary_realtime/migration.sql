-- Real-time 1-minute summary (step 9). The refresh policy materialises buckets up to
-- one minute ago; with materialized_only = false, a query also includes the newest
-- minutes from the raw readings, so a chart longer than one hour (which reads the
-- summary) does not miss its last minutes.
ALTER MATERIALIZED VIEW "telemetry_1m" SET (timescaledb.materialized_only = false);
