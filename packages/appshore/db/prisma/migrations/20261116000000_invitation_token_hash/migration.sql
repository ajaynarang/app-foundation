-- Invitation tokens: store sha256(token) instead of the plain text. Pending invitations keep working: the hash is
-- the one the service computes (hashToken: sha256 over the UTF-8 bytes, lowercase hex), so an emailed link still
-- resolves.
ALTER TABLE "user_invitations"
  ADD COLUMN "token_hash" VARCHAR(64),
  ADD COLUMN "link_shared_at" TIMESTAMPTZ;

UPDATE "user_invitations" SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

-- Every link that exists today may have been read by the inviter (create, resend and GET /link all returned it).
-- Mark pending ones as shared, so accepting one is never treated as proof of the mailbox.
UPDATE "user_invitations" SET "link_shared_at" = "created_at" WHERE "status" = 'PENDING';

ALTER TABLE "user_invitations" ALTER COLUMN "token_hash" SET NOT NULL;

-- Dropping the column also drops its unique index ("user_invitations_token_key").
ALTER TABLE "user_invitations" DROP COLUMN "token";

CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");
