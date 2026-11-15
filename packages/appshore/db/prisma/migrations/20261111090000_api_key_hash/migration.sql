-- API keys: store sha256(key) plus a display prefix and the last four characters
-- instead of the plaintext. Existing keys keep working: the hash below is the
-- same one the service computes (sha256 over the UTF-8 bytes, lowercase hex).
ALTER TABLE "api_keys"
  ADD COLUMN "key_hash" VARCHAR(64),
  ADD COLUMN "key_prefix" VARCHAR(16),
  ADD COLUMN "key_last4" VARCHAR(4);

UPDATE "api_keys" SET
  "key_hash"   = encode(sha256(convert_to("key", 'UTF8')), 'hex'),
  "key_prefix" = CASE WHEN left("key", 8) = 'sk_live_' THEN 'sk_live_' ELSE '' END,
  "key_last4"  = right("key", 4);

ALTER TABLE "api_keys"
  ALTER COLUMN "key_hash" SET NOT NULL,
  ALTER COLUMN "key_prefix" SET NOT NULL,
  ALTER COLUMN "key_last4" SET NOT NULL;

-- Dropping the column also drops its unique index ("api_keys_key_key").
ALTER TABLE "api_keys" DROP COLUMN "key";

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
