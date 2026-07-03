-- =============================================================================
-- AI Spend read-side views
-- =============================================================================
--
-- Aggregate views over `ai_invocations` consumed by the super-admin
-- `/admin/ai-spend` endpoints (AdminAiSpendService). Read-only — Prisma never
-- writes to these. We don't `prisma db pull` view definitions; the canonical
-- source is this migration. If you change a view, drop and recreate it in a
-- new migration (Postgres CREATE OR REPLACE VIEW won't change column order).
--
-- Surfaces three drill levels:
--   * Per tenant per day total — the front page
--   * Per tenant per surface per day — the drill-in
--   * Per desk episode — unit economics for autonomous responsibilities
-- =============================================================================

-- 1. Per-tenant per-day totals — the table on the AI Spend home view.
CREATE OR REPLACE VIEW vw_ai_cost_per_tenant AS
SELECT
  tenant_id,
  date_trunc('day', created_at)::date AS day,
  SUM(COALESCE(cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count,
  SUM(CASE WHEN status != 'OK' THEN 1 ELSE 0 END)::bigint AS error_count
FROM ai_invocations
GROUP BY tenant_id, date_trunc('day', created_at);

-- 2. Per-tenant per-surface per-day — the drill-in panel.
CREATE OR REPLACE VIEW vw_ai_cost_daily AS
SELECT
  tenant_id,
  surface,
  model,
  date_trunc('day', created_at)::date AS day,
  SUM(COALESCE(cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count,
  SUM(CASE WHEN status != 'OK' THEN 1 ELSE 0 END)::bigint AS error_count
FROM ai_invocations
GROUP BY tenant_id, surface, model, date_trunc('day', created_at);

-- 3. Per-desk-episode rollup — unit-economics view for the desk timeline.
--    Joins via the indexed DeskEpisodeStep.ai_invocation_id FK — the single,
--    fast path. If a future surface writes desk-episode-scoped rows WITHOUT
--    going through DeskEpisodeStep, add a UNION ALL branch over the
--    polymorphic linkRef then; not needed today.
CREATE OR REPLACE VIEW vw_ai_cost_per_episode AS
SELECT
  des.episode_id,
  ai.tenant_id,
  SUM(COALESCE(ai.cost_usd, 0))::numeric(14, 6) AS total_cost_usd,
  SUM(ai.total_tokens)::bigint AS total_tokens,
  COUNT(*)::bigint AS call_count
FROM ai_invocations ai
JOIN desk_episode_steps des ON des.ai_invocation_id = ai.id
GROUP BY des.episode_id, ai.tenant_id;
