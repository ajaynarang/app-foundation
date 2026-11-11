/**
 * Outbound webhook signing: Standard Webhooks (https://www.standardwebhooks.com).
 *
 * The signature is `v1,<base64 HMAC-SHA256(key, "<webhook-id>.<webhook-timestamp>.<raw body>")>`, where the key is
 * the base64-decoded secret after its `whsec_` prefix. During a secret rotation's overlap two `v1,` signatures are
 * sent, space-separated; a receiver accepts the delivery if any one matches. A receiver can verify with any
 * Standard Webhooks library.
 */
export const WEBHOOK_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature',
} as const;

/**
 * The headers sent before Standard Webhooks signing. Still sent so receivers written against them keep working;
 * `X-Webhook-Signature` covers the body only (no id, no timestamp), so it cannot stop a replay.
 * @deprecated Verify `WEBHOOK_HEADERS` instead.
 */
export const LEGACY_WEBHOOK_HEADERS = {
  signature: 'X-Webhook-Signature',
  event: 'X-Webhook-Event',
  delivery: 'X-Webhook-Delivery',
  eventVersion: 'X-Webhook-Event-Version',
} as const;

/** Every signing secret issued now starts with this prefix (the Standard Webhooks convention). */
export const WEBHOOK_SECRET_PREFIX = 'whsec_';

/** The signature scheme tag in `webhook-signature`. */
export const WEBHOOK_SIGNATURE_VERSION = 'v1';

/** Receivers reject a `webhook-timestamp` further than this from their clock (replay window). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

/** How long the previous secret keeps signing after a rotation, unless the caller picks another overlap. */
export const WEBHOOK_SECRET_OVERLAP_DEFAULT_HOURS = 24;
export const WEBHOOK_SECRET_OVERLAP_MAX_HOURS = 168;

/** `POST /webhooks/:id/rotate-secret` body. */
export interface RotateWebhookSecretInput {
  /** Hours the previous secret keeps signing (0 to WEBHOOK_SECRET_OVERLAP_MAX_HOURS, default 24). */
  overlapHours?: number;
}
