-- Chat grants (a signed-in user's confirmation of one exact write in one conversation) live on hitl_challenges with
-- explicit columns: the conversation, the confirm card (the suspended confirm-action call) and when the person pressed
-- Confirm. Additive and nullable: existing rows are third-party agent challenges and keep null in all three.
ALTER TABLE "hitl_challenges" ADD COLUMN "conversation_id" VARCHAR(80);
ALTER TABLE "hitl_challenges" ADD COLUMN "tool_call_id" VARCHAR(128);
ALTER TABLE "hitl_challenges" ADD COLUMN "confirmed_at" TIMESTAMPTZ;

CREATE INDEX "hitl_challenges_tenant_id_conversation_id_idx" ON "hitl_challenges"("tenant_id", "conversation_id");
