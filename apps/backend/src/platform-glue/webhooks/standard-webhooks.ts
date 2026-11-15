import { createHmac, randomBytes } from 'crypto';
import {
  LEGACY_WEBHOOK_HEADERS,
  WEBHOOK_HEADERS,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SIGNATURE_VERSION,
} from '@app/shared-types';

/**
 * Outbound webhook signing per Standard Webhooks, so a receiver can verify with any Standard Webhooks library and
 * reject replays by timestamp.
 */

/** A new signing secret: `whsec_` + 32 random bytes, base64. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64')}`;
}

/**
 * The HMAC key behind a secret: the base64-decoded part after an optional `whsec_` prefix (the Standard Webhooks
 * rule). Secrets issued before the prefix are 64 hex characters, which are valid base64 too, so the same rule, and
 * the official libraries, work for them unchanged.
 */
export function webhookSigningKey(secret: string): Buffer {
  const encoded = secret.startsWith(WEBHOOK_SECRET_PREFIX) ? secret.slice(WEBHOOK_SECRET_PREFIX.length) : secret;
  return Buffer.from(encoded, 'base64');
}

/** `v1,<base64 HMAC-SHA256(key, "id.timestamp.body")>`. */
export function signStandardWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const digest = createHmac('sha256', webhookSigningKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `${WEBHOOK_SIGNATURE_VERSION},${digest}`;
}

/** The deprecated `X-Webhook-Signature` value: `sha256=<hex HMAC-SHA256(secret as UTF-8, body)>`. */
export function signLegacyWebhook(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export interface WebhookMessage {
  /** Stable across retries of the same delivery; receivers de-duplicate on it. */
  id: string;
  /** Unix seconds at send time. */
  timestamp: number;
  /** The exact bytes sent as the request body. */
  body: string;
  event: string;
  eventVersion: number;
}

/**
 * The secrets that sign a delivery: the current one, then the previous one while a rotation's overlap lasts
 * (each adds a `v1,` signature, so receivers on either secret verify).
 */
export function signingSecrets(
  subscription: { secret: string; previousSecret?: string | null; previousSecretExpiresAt?: Date | null },
  now = new Date(),
): string[] {
  const { secret, previousSecret, previousSecretExpiresAt } = subscription;
  const overlapping = previousSecret && previousSecretExpiresAt && previousSecretExpiresAt > now;
  return overlapping ? [secret, previousSecret] : [secret];
}

/**
 * Request headers for one delivery attempt. `secrets` is the current secret first, then, during a rotation's
 * overlap, the previous one; each adds a space-separated `v1,` signature. The legacy headers are signed with the
 * current secret only.
 */
export function buildWebhookHeaders(secrets: readonly string[], message: WebhookMessage): Record<string, string> {
  const [current] = secrets;
  return {
    'Content-Type': 'application/json',
    [WEBHOOK_HEADERS.id]: message.id,
    [WEBHOOK_HEADERS.timestamp]: String(message.timestamp),
    [WEBHOOK_HEADERS.signature]: secrets
      .map((secret) => signStandardWebhook(secret, message.id, message.timestamp, message.body))
      .join(' '),
    [LEGACY_WEBHOOK_HEADERS.signature]: signLegacyWebhook(current, message.body),
    [LEGACY_WEBHOOK_HEADERS.event]: message.event,
    [LEGACY_WEBHOOK_HEADERS.delivery]: message.id,
    [LEGACY_WEBHOOK_HEADERS.eventVersion]: String(message.eventVersion),
  };
}
