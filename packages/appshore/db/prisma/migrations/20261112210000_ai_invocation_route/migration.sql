-- Record which AI route served each call, and the credential type behind it.
--
-- Model calls now come from a per-tenant route resolver. `route_id` is the route
-- (`platform-openrouter`, `platform-cohere`, or later a workspace credential's public id) and
-- `credential_type` its type (`PLATFORM_OPENROUTER`, `PLATFORM_COHERE`, or later a workspace
-- credential type). Both are plain strings, so they hold platform routes and workspace credentials
-- alike, and an id left behind by a deleted credential stays readable.
--
-- Additive and nullable: existing rows keep null in both, which reads as platform-paid (only the
-- platform could pay before routing). No backfill.
ALTER TABLE "ai_invocations" ADD COLUMN IF NOT EXISTS "route_id" VARCHAR(64);
ALTER TABLE "ai_invocations" ADD COLUMN IF NOT EXISTS "credential_type" VARCHAR(40);
