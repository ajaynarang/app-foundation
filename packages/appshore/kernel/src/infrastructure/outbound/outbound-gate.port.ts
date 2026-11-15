import type { OutboundMode } from './outbound-mode';

/**
 * The outbound gate (ADR "Outbound gate"): the one check every send to a real person passes before a provider is
 * called. The kernel holds the port so kernel senders (SMS) can use it without Prisma; platform binds it
 * (`OutboundPolicyService`, global `OutboundModule`).
 */
export const OUTBOUND_GATE = Symbol('OUTBOUND_GATE');

/** Which sender asked. Shown in the held-back list. */
export const OUTBOUND_SOURCE = {
  EMAIL: 'email',
  SMS: 'sms',
  SIGN_IN_CODE: 'sign-in-code',
  PUSH_FCM: 'push-fcm',
  PUSH_WEB: 'push-web',
  OUTBOUND_WEBHOOK: 'outbound-webhook',
} as const;

export type OutboundSource = (typeof OUTBOUND_SOURCE)[keyof typeof OUTBOUND_SOURCE];

/** What `allowlist` mode puts in front of whatever it does send. WhatsApp templates are pre-approved: no prefix. */
export const STAGING_EMAIL_SUBJECT_PREFIX = '[STAGING] ';
export const STAGING_SMS_PREFIX = 'STG: ';
export const STAGING_PUSH_TITLE_PREFIX = '[STG] ';

export interface OutboundContext {
  source: OutboundSource;
  /** The tenant's numeric key, when the sender knows it. Stored on the held-back row; never on the wire. */
  tenantId?: number | null;
  /** Subject, title or a short preview for the held-back row. Redacted before it is stored. */
  subject?: string;
}

export interface EmailEnvelope {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
}

/**
 * A recipient the delivery pipeline asks about before it sends, so a gated send is ledgered `SKIPPED` with reason
 * `GATED` instead of as a provider failure or a send.
 */
export type OutboundTarget =
  | { channel: 'email'; address: string }
  | { channel: 'sms' | 'whatsapp'; phone: string }
  | { channel: 'push'; userId: number }
  | { channel: 'webhook'; url: string };

export interface OutboundGate {
  getMode(): OutboundMode;
  isLive(): boolean;

  /**
   * The message to send: untouched in `live` mode; otherwise with every recipient not on the list removed (each one
   * recorded as held back) and a staging subject. `null` when no `to` recipient is allowed and nothing is sent.
   */
  gateEmail<T extends EmailEnvelope>(message: T, context: OutboundContext): Promise<T | null>;

  /** SMS and sign-in codes. False means held back (and recorded). */
  allowPhone(phone: string, context: OutboundContext): Promise<boolean>;

  /** Push: allowed when the user's email or phone is on the list. False means held back (and recorded). */
  allowUser(userId: number, context: OutboundContext): Promise<boolean>;

  /** Customer webhooks: allowed when the URL's host is on the list. False means held back (and recorded). */
  allowUrl(url: string, context: OutboundContext): Promise<boolean>;

  /** The same decision as the methods above, with no side effect: nothing is recorded. */
  wouldAllow(target: OutboundTarget): Promise<boolean>;

  markSms(text: string): string;
  markPushTitle(title: string): string;
}
