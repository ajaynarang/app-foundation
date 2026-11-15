-- The foundation crons' default schedules. The squashed init migration lost these rows, so on a database built from
-- it job-cleanup, data-retention, login-events-cleanup, tokens-cleanup, trial-expiry and the notifications cleanup
-- never ran. ON CONFLICT DO NOTHING: a row a product already has (retuned or disabled) wins.
-- To keep one of these from starting on a database that already has data, insert or update its row with
-- is_enabled = false BEFORE this migration runs (docs/upgrade-notes/operations.md).
-- Daily patterns are UTC, staggered so no two hold the one-at-a-time bulk-ops lane together.
INSERT INTO "job_schedules" ("category", "job_type", "schedule_type", "pattern", "interval_ms", "is_enabled", "updated_at") VALUES
  ('maintenance', 'trial-expiry', 'cron', '15 0 * * *', NULL, true, NOW()),
  ('maintenance', 'job-cleanup', 'cron', '0 3 * * *', NULL, true, NOW()),
  ('maintenance', 'data-retention', 'cron', '0 4 * * *', NULL, true, NOW()),
  ('maintenance', 'login-events-cleanup', 'cron', '30 4 * * *', NULL, true, NOW()),
  ('maintenance', 'tokens-cleanup', 'cron', '0 5 * * *', NULL, true, NOW()),
  ('notifications', 'cleanup', 'cron', '30 5 * * *', NULL, true, NOW())
ON CONFLICT ("category", "job_type") DO NOTHING;
