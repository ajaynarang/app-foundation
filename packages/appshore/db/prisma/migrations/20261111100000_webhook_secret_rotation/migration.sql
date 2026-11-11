-- Webhook signing-secret rotation: the secret a rotation replaced keeps signing
-- alongside the new one until previous_secret_expires_at. Both columns are
-- nullable, so existing subscriptions are untouched and keep their secret.
ALTER TABLE "webhook_subscriptions"
  ADD COLUMN "previous_secret" VARCHAR(255),
  ADD COLUMN "previous_secret_expires_at" TIMESTAMPTZ;
