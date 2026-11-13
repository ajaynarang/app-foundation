-- In-app approval of external agent writes. Additive: existing challenges keep approval_required = false (they finish
-- on the old echo-the-token flow and expire within minutes), and every workspace starts with self-confirm off, so
-- external agent writes now wait for a person unless the owner turns self-confirm on.
ALTER TABLE "hitl_challenges" ADD COLUMN "approval_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "hitl_challenges" ADD COLUMN "args_preview" JSONB;
ALTER TABLE "hitl_challenges" ADD COLUMN "args_redacted" JSONB;
ALTER TABLE "hitl_challenges" ADD COLUMN "approved_at" TIMESTAMPTZ;
ALTER TABLE "hitl_challenges" ADD COLUMN "denied_at" TIMESTAMPTZ;
ALTER TABLE "hitl_challenges" ADD COLUMN "decided_by_id" INTEGER;

ALTER TABLE "tenants" ADD COLUMN "agent_self_confirm" BOOLEAN NOT NULL DEFAULT false;
