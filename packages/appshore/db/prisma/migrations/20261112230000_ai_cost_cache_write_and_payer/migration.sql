-- The AI cost ledger prices prompt-cache writes, says who paid, and the plan seeder owns default budget rows.
--
-- 1. Cache writes. `ai_invocations.cache_write_tokens` counts the prompt tokens a call wrote to the provider's
--    prompt cache (they are inside `prompt_tokens`, like `cached_tokens`), and `model_pricing` gains the write rate.
--    A null rate prices a write at the plain input rate. Additive and nullable; old rows keep null.
ALTER TABLE "ai_invocations" ADD COLUMN IF NOT EXISTS "cache_write_tokens" INTEGER;
ALTER TABLE "model_pricing" ADD COLUMN IF NOT EXISTS "cache_write_input_per_mtok_usd" DECIMAL(10, 6);

-- 2. The spend views gain `platform_cost_usd` beside `total_cost_usd`: the part of the cost the platform paid.
--    The platform paid when `credential_type` is null (every row written before routing, when only the platform
--    could pay) or starts with `PLATFORM_`; a workspace's own credential type means the workspace paid. The same
--    rule is `PLATFORM_PAID_SQL` in `ai-telemetry.service.ts`. The column order changes, so each view is dropped and
--    created, never replaced in place.
DROP VIEW IF EXISTS vw_ai_cost_per_tenant;
DROP VIEW IF EXISTS vw_ai_cost_daily;
DROP VIEW IF EXISTS vw_ai_cost_per_episode;

-- Per-tenant per-day totals: the AI Spend home table.
CREATE VIEW vw_ai_cost_per_tenant AS
SELECT
  tenant_id,
  date_trunc('day', created_at)::date AS day,
  SUM(COALESCE(cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(CASE WHEN credential_type IS NULL OR credential_type LIKE 'PLATFORM\_%' THEN COALESCE(cost_usd, 0) ELSE 0 END)::numeric(14, 6) AS platform_cost_usd,
  SUM(total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count,
  SUM(CASE WHEN status != 'OK' THEN 1 ELSE 0 END)::bigint AS error_count
FROM ai_invocations
GROUP BY tenant_id, date_trunc('day', created_at);

-- Per-tenant per-surface per-day: the drill-in panel.
CREATE VIEW vw_ai_cost_daily AS
SELECT
  tenant_id,
  surface,
  model,
  date_trunc('day', created_at)::date AS day,
  SUM(COALESCE(cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(CASE WHEN credential_type IS NULL OR credential_type LIKE 'PLATFORM\_%' THEN COALESCE(cost_usd, 0) ELSE 0 END)::numeric(14, 6) AS platform_cost_usd,
  SUM(total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count,
  SUM(CASE WHEN status != 'OK' THEN 1 ELSE 0 END)::bigint AS error_count
FROM ai_invocations
GROUP BY tenant_id, surface, model, date_trunc('day', created_at);

-- Per-desk-episode rollup: unit economics for the desk timeline.
CREATE VIEW vw_ai_cost_per_episode AS
SELECT
  des.episode_id,
  ai.tenant_id,
  SUM(COALESCE(ai.cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(CASE WHEN ai.credential_type IS NULL OR ai.credential_type LIKE 'PLATFORM\_%' THEN COALESCE(ai.cost_usd, 0) ELSE 0 END)::numeric(14, 6) AS platform_cost_usd,
  SUM(ai.total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count
FROM ai_invocations ai
JOIN desk_episode_steps des ON des.ai_invocation_id = ai.id
GROUP BY des.episode_id, ai.tenant_id;

-- 3. Default budget rows belong to the plan seeder. A row is the seeder's when `notes` starts with `plan:`; until
--    now both lazy creators (the pre-call budget check and the admin spend panel) wrote null, which reads as
--    admin-owned for ever. Stamp `plan:DEFAULT` on rows nobody chose: null notes and all four caps still at the
--    schema defaults. A row with any other cap was edited by an admin and stays the admin's.
UPDATE "tenant_ai_budgets"
SET "notes" = 'plan:DEFAULT'
WHERE "notes" IS NULL
  AND "daily_soft_usd" = 5
  AND "daily_hard_usd" = 20
  AND "monthly_soft_usd" = 50
  AND "monthly_hard_usd" = 200;
