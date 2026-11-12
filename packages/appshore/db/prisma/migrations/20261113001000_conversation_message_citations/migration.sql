-- The sources an assistant answer named (the chat's `c:` frames), kept with the message so history shows them.
-- Additive and nullable: existing messages keep null (no sources recorded). Capped per message by the writer
-- (MAX_CITATIONS_PER_MESSAGE in @app/shared-types).
ALTER TABLE "conversation_messages" ADD COLUMN "citations" JSONB;
