-- Email verification: one-time tokens that prove a person can read mail at an address. Only sha256(token) is stored
-- (hashToken: sha256 over the UTF-8 bytes, lowercase hex); the raw token lives only in the emailed link. `email` is
-- the address the token proves. A new table: no existing row changes, and no user is marked verified.
CREATE TABLE "email_verification_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

CREATE INDEX "email_verification_tokens_user_id_created_at_idx" ON "email_verification_tokens"("user_id", "created_at");

CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
